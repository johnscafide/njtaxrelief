create table if not exists public.public_watchdog_score_cache_v1 (
  pams_pin text primary key,
  model_version text not null default 'ROBUST-v1',
  score numeric not null check (score >= 0 and score <= 100),
  evidence_coverage numeric null check (evidence_coverage is null or (evidence_coverage >= 0 and evidence_coverage <= 100)),
  confidence text null,
  verdict text null,
  inputs jsonb not null default '{}'::jsonb,
  formula text null,
  facts_hash text not null,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint public_watchdog_score_cache_v1_model_check check (model_version = 'ROBUST-v1')
);

comment on table public.public_watchdog_score_cache_v1 is 'Service-owned canonical ROBUST-v1 public score cache. Browser roles have no direct table access; public reads are mediated by bounded RPCs and score-on-demand Edge logic.';

alter table public.public_watchdog_score_cache_v1 enable row level security;
revoke all on table public.public_watchdog_score_cache_v1 from anon, authenticated;
create index if not exists public_watchdog_score_cache_v1_expires_idx on public.public_watchdog_score_cache_v1 (expires_at);

create or replace function public.get_public_realtime_watchdog_scores(p_rows jsonb)
returns table(pams_pin text, watchdog_score numeric, score_source text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with input_rows as (
  select distinct left(coalesce(x->>'pams_pin',''),40) as pams_pin
  from jsonb_array_elements(case when jsonb_typeof(p_rows)='array' then p_rows else '[]'::jsonb end) x
  where left(coalesce(x->>'pams_pin',''),40) <> ''
  limit 100
), canonical_cache as (
  select c.pams_pin, c.score
  from public.public_watchdog_score_cache_v1 c
  join input_rows i on i.pams_pin = c.pams_pin
  where c.model_version = 'ROBUST-v1'
    and c.expires_at > now()
), canonical_observation as (
  select distinct on (s.pams_pin) s.pams_pin, s.score
  from public.score_observations s
  join input_rows i on i.pams_pin = s.pams_pin
  where s.marker_id = 'watchdog.watchdog_score'
    and s.model_version = 'ROBUST-v1'
  order by s.pams_pin, s.observed_at desc nulls last, s.observed_on desc nulls last
)
select i.pams_pin,
       coalesce(c.score, o.score)::numeric as watchdog_score,
       case when c.score is not null then 'robust_public_cache'
            when o.score is not null then 'robust_observation'
            else 'insufficient_canonical_evidence' end as score_source
from input_rows i
left join canonical_cache c on c.pams_pin = i.pams_pin
left join canonical_observation o on o.pams_pin = i.pams_pin;
$function$;

revoke all on function public.get_public_realtime_watchdog_scores(jsonb) from public;
grant execute on function public.get_public_realtime_watchdog_scores(jsonb) to anon, authenticated, service_role;

create or replace function public.get_public_property_watchdog_score_details(p_pins text[])
returns table(
  pams_pin text,
  watchdog_score numeric,
  evidence_coverage numeric,
  model_version text,
  observed_on date,
  observed_at timestamptz,
  recourse_score numeric,
  overassessment_score numeric,
  burden_score numeric,
  uniformity_score numeric,
  stability_score numeric,
  trajectory_score numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with requested as (
  select distinct left(trim(pin), 40) as pams_pin
  from unnest(coalesce(p_pins, array[]::text[])) as pin
  where trim(coalesce(pin, '')) <> ''
  limit 100
), cache_rows as (
  select
    c.pams_pin,
    c.score,
    c.evidence_coverage,
    c.model_version,
    c.computed_at,
    c.inputs
  from public.public_watchdog_score_cache_v1 c
  join requested r on r.pams_pin = c.pams_pin
  where c.model_version = 'ROBUST-v1'
    and c.expires_at > now()
), ranked_observations as (
  select
    s.pams_pin,
    s.score,
    s.evidence_coverage,
    s.model_version,
    s.observed_on,
    s.observed_at,
    s.inputs,
    row_number() over (
      partition by s.pams_pin
      order by s.observed_at desc nulls last, s.observed_on desc nulls last
    ) as rn
  from public.score_observations s
  join requested r on r.pams_pin = s.pams_pin
  where s.marker_id = 'watchdog.watchdog_score'
    and s.model_version = 'ROBUST-v1'
), observations as (
  select * from ranked_observations where rn = 1
)
select
  r.pams_pin,
  coalesce(c.score, o.score)::numeric as watchdog_score,
  coalesce(c.evidence_coverage, o.evidence_coverage)::numeric as evidence_coverage,
  coalesce(c.model_version, o.model_version) as model_version,
  coalesce(c.computed_at::date, o.observed_on) as observed_on,
  coalesce(c.computed_at, o.observed_at) as observed_at,
  nullif(coalesce(c.inputs #>> '{components,recourse,score}', o.inputs #>> '{components,recourse,score}'), '')::numeric as recourse_score,
  nullif(coalesce(c.inputs #>> '{components,fairness,score}', o.inputs #>> '{components,fairness,score}'), '')::numeric as overassessment_score,
  nullif(coalesce(c.inputs #>> '{components,burden,score}', o.inputs #>> '{components,burden,score}'), '')::numeric as burden_score,
  nullif(coalesce(c.inputs #>> '{components,uniformity,score}', o.inputs #>> '{components,uniformity,score}'), '')::numeric as uniformity_score,
  nullif(coalesce(c.inputs #>> '{components,stability,score}', o.inputs #>> '{components,stability,score}'), '')::numeric as stability_score,
  nullif(coalesce(c.inputs #>> '{components,trajectory,score}', o.inputs #>> '{components,trajectory,score}'), '')::numeric as trajectory_score
from requested r
left join cache_rows c on c.pams_pin = r.pams_pin
left join observations o on o.pams_pin = r.pams_pin
where coalesce(c.score, o.score) is not null;
$function$;

revoke all on function public.get_public_property_watchdog_score_details(text[]) from public;
grant execute on function public.get_public_property_watchdog_score_details(text[]) to anon, authenticated, service_role;
