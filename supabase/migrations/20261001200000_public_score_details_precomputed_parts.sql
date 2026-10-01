-- Public ROBUST part scores for precomputed parcels.
--
-- get_public_property_watchdog_score_details (20260826214428) reads each part as
-- inputs.components.<part>.score. On-demand cache rows store parts that way, but the
-- statewide batch pass (workbench-score batch_precompute) stores each part as a bare
-- number to keep the 3M-row cache small, e.g. {"burden": 62}. For those rows every
-- part came back null, so the property score panel showed the total with blank parts.
--
-- Each part is now read from either shape. Everything else is unchanged: inputs,
-- outputs, the cache-then-observation order, SECURITY DEFINER, search_path and grants.

create or replace function public.get_public_property_watchdog_score_details(p_pins text[])
returns table(
  pams_pin text,
  watchdog_score numeric,
  evidence_coverage numeric,
  model_version text,
  observed_on date,
  observed_at timestamp with time zone,
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
set search_path to 'public', 'pg_temp'
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
  -- A part is a bare number in precomputed rows and {"score": n, ...} in on-demand rows.
  nullif(coalesce(
    case jsonb_typeof(c.inputs #> '{components,recourse}')
      when 'number' then c.inputs #>> '{components,recourse}'
      when 'object' then c.inputs #>> '{components,recourse,score}'
    end,
    o.inputs #>> '{components,recourse,score}'), '')::numeric as recourse_score,
  nullif(coalesce(
    case jsonb_typeof(c.inputs #> '{components,fairness}')
      when 'number' then c.inputs #>> '{components,fairness}'
      when 'object' then c.inputs #>> '{components,fairness,score}'
    end,
    o.inputs #>> '{components,fairness,score}'), '')::numeric as overassessment_score,
  nullif(coalesce(
    case jsonb_typeof(c.inputs #> '{components,burden}')
      when 'number' then c.inputs #>> '{components,burden}'
      when 'object' then c.inputs #>> '{components,burden,score}'
    end,
    o.inputs #>> '{components,burden,score}'), '')::numeric as burden_score,
  nullif(coalesce(
    case jsonb_typeof(c.inputs #> '{components,uniformity}')
      when 'number' then c.inputs #>> '{components,uniformity}'
      when 'object' then c.inputs #>> '{components,uniformity,score}'
    end,
    o.inputs #>> '{components,uniformity,score}'), '')::numeric as uniformity_score,
  nullif(coalesce(
    case jsonb_typeof(c.inputs #> '{components,stability}')
      when 'number' then c.inputs #>> '{components,stability}'
      when 'object' then c.inputs #>> '{components,stability,score}'
    end,
    o.inputs #>> '{components,stability,score}'), '')::numeric as stability_score,
  nullif(coalesce(
    case jsonb_typeof(c.inputs #> '{components,trajectory}')
      when 'number' then c.inputs #>> '{components,trajectory}'
      when 'object' then c.inputs #>> '{components,trajectory,score}'
    end,
    o.inputs #>> '{components,trajectory,score}'), '')::numeric as trajectory_score
from requested r
left join cache_rows c on c.pams_pin = r.pams_pin
left join observations o on o.pams_pin = r.pams_pin
where coalesce(c.score, o.score) is not null;
$function$;

revoke all on function public.get_public_property_watchdog_score_details(text[]) from public;
grant execute on function public.get_public_property_watchdog_score_details(text[]) to anon, authenticated, service_role;
