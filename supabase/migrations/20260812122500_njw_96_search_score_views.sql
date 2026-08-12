-- NJW-96 refinement: expose only the public-safe score fields needed by
-- the public property search filters and town SEO comparison modules.

create or replace view public.property_watchdog_scores
with (security_invoker = true)
as
with ranked as (
  select
    pams_pin,
    score,
    observed_on,
    observed_at,
    inputs,
    row_number() over (
      partition by pams_pin
      order by observed_at desc nulls last, observed_on desc nulls last,
               case when marker_id = 'watchdog.watchdog_score' then 0 else 1 end
    ) as rn
  from public.score_observations
  where marker_id in ('watchdog.watchdog_score','watchdog.score')
    and pams_pin is not null
)
select
  pams_pin,
  score::numeric as watchdog_score,
  nullif(inputs->>'town','') as town,
  nullif(inputs->>'county','') as county,
  observed_on,
  observed_at
from ranked
where rn = 1;

create or replace view public.town_watchdog_scores
with (security_invoker = true)
as
select
  upper(town) as town,
  upper(county) as county,
  round(avg(watchdog_score)::numeric, 1) as avg_watchdog_score,
  count(*)::bigint as scored_properties,
  max(observed_on) as score_as_of
from public.property_watchdog_scores
where town is not null and county is not null and watchdog_score is not null
group by upper(town), upper(county);

grant select on public.property_watchdog_scores to anon, authenticated;
grant select on public.town_watchdog_scores to anon, authenticated;

-- The underlying observation table is intentionally not public. These two
-- fixed-search-path RPCs return only the score aggregates needed by search.
create or replace function public.get_public_property_watchdog_scores(p_pins text[])
returns table(pams_pin text, watchdog_score numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      s.pams_pin,
      s.score,
      row_number() over (
        partition by s.pams_pin
        order by s.observed_at desc nulls last, s.observed_on desc nulls last,
                 case when s.marker_id = 'watchdog.watchdog_score' then 0 else 1 end
      ) as rn
    from public.score_observations s
    where s.marker_id in ('watchdog.watchdog_score','watchdog.score')
      and s.pams_pin = any(p_pins)
  )
  select r.pams_pin, r.score::numeric
  from ranked r
  where r.rn = 1;
$$;

create or replace function public.get_public_town_watchdog_scores()
returns table(town text, county text, avg_watchdog_score numeric, scored_properties bigint, score_as_of date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      s.pams_pin,
      s.score,
      nullif(s.inputs->>'town','') as town,
      nullif(s.inputs->>'county','') as county,
      s.observed_on,
      row_number() over (
        partition by s.pams_pin
        order by s.observed_at desc nulls last, s.observed_on desc nulls last,
                 case when s.marker_id = 'watchdog.watchdog_score' then 0 else 1 end
      ) as rn
    from public.score_observations s
    where s.marker_id in ('watchdog.watchdog_score','watchdog.score')
      and s.pams_pin is not null
  )
  select
    upper(r.town),
    upper(r.county),
    round(avg(r.score)::numeric, 1),
    count(*)::bigint,
    max(r.observed_on)
  from ranked r
  where r.rn = 1 and r.town is not null and r.county is not null and r.score is not null
  group by upper(r.town), upper(r.county);
$$;

revoke all on function public.get_public_property_watchdog_scores(text[]) from public;
revoke all on function public.get_public_town_watchdog_scores() from public;
grant execute on function public.get_public_property_watchdog_scores(text[]) to anon, authenticated;
grant execute on function public.get_public_town_watchdog_scores() to anon, authenticated;
