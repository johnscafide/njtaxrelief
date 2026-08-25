-- Public-safe canonical ROBUST score details for public property surfaces.
--
-- The public lookup previously recomputed a second Watchdog Score in the
-- browser from a different evidence shape. That allowed the same parcel to
-- show different unqualified scores across the recent card and property
-- detail. This RPC exposes only the governed ROBUST-v1 score, evidence
-- coverage and six component scores. Raw inputs and notes remain private.

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
as $$
  with requested as (
    select distinct left(trim(pin), 40) as pams_pin
    from unnest(coalesce(p_pins, array[]::text[])) as pin
    where trim(coalesce(pin, '')) <> ''
    limit 100
  ), ranked as (
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
  )
  select
    r.pams_pin,
    r.score::numeric as watchdog_score,
    r.evidence_coverage::numeric,
    r.model_version,
    r.observed_on,
    r.observed_at,
    nullif(r.inputs #>> '{components,recourse,score}', '')::numeric as recourse_score,
    nullif(r.inputs #>> '{components,fairness,score}', '')::numeric as overassessment_score,
    nullif(r.inputs #>> '{components,burden,score}', '')::numeric as burden_score,
    nullif(r.inputs #>> '{components,uniformity,score}', '')::numeric as uniformity_score,
    nullif(r.inputs #>> '{components,stability,score}', '')::numeric as stability_score,
    nullif(r.inputs #>> '{components,trajectory,score}', '')::numeric as trajectory_score
  from ranked r
  where r.rn = 1;
$$;

revoke all on function public.get_public_property_watchdog_score_details(text[]) from public;
grant execute on function public.get_public_property_watchdog_score_details(text[]) to anon, authenticated;
