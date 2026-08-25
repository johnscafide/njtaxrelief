-- NJW-37: bound the anonymous public property-score batch surface.
-- Public property scores remain intentionally public; this adds extraction friction
-- without changing the established score-selection semantics.

create or replace function public.get_public_property_watchdog_scores(p_pins text[])
returns table(pams_pin text, watchdog_score numeric)
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
  ), ranked as (
    select s.pams_pin, s.score,
      row_number() over (
        partition by s.pams_pin
        order by s.observed_at desc nulls last, s.observed_on desc nulls last
      ) as rn
    from public.score_observations s
    join requested r on r.pams_pin = s.pams_pin
    where s.marker_id='watchdog.watchdog_score'
      and s.model_version='ROBUST-v1'
  )
  select r.pams_pin, r.score::numeric
  from ranked r
  where r.rn=1;
$function$;

comment on function public.get_public_property_watchdog_scores(text[])
is 'Public property-score lookup. Anonymous/authenticated execution is intentionally supported; each call is normalized, deduplicated, and capped at 100 requested PINs.';
