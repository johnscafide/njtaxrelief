-- NJW-96: calculate a Watchdog score for every search result in real time.
-- Existing observed scores remain authoritative when available; otherwise the
-- public search gets a deterministic live score from the parcel's current
-- assessment/tax inputs, blended with a town average when one exists.

create or replace function public.get_public_realtime_watchdog_scores(p_rows jsonb)
returns table(pams_pin text, watchdog_score numeric, score_source text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with input_rows as (
  select
    left(coalesce(x->>'pams_pin',''),40) as pams_pin,
    nullif(x->>'assessment','')::numeric as assessment,
    nullif(x->>'tax','')::numeric as tax,
    upper(nullif(x->>'town','')) as town,
    upper(nullif(x->>'county','')) as county
  from jsonb_array_elements(case when jsonb_typeof(p_rows)='array' then p_rows else '[]'::jsonb end) x
  limit 100
),
latest as (
  select distinct on (s.pams_pin) s.pams_pin, s.score
  from public.score_observations s
  join input_rows i on i.pams_pin=s.pams_pin
  where s.marker_id in ('watchdog.watchdog_score','watchdog.score')
  order by s.pams_pin, s.observed_at desc nulls last, s.observed_on desc nulls last,
           case when s.marker_id='watchdog.watchdog_score' then 0 else 1 end
),
town_avg as (
  select upper(nullif(s.inputs->>'town','')) town,
         upper(nullif(s.inputs->>'county','')) county,
         avg(s.score)::numeric avg_score
  from (
    select distinct on (pams_pin) *
    from public.score_observations
    where marker_id in ('watchdog.watchdog_score','watchdog.score')
    order by pams_pin, observed_at desc nulls last, observed_on desc nulls last,
             case when marker_id='watchdog.watchdog_score' then 0 else 1 end
  ) s
  where nullif(s.inputs->>'town','') is not null and nullif(s.inputs->>'county','') is not null
  group by 1,2
),
calc as (
  select i.*,
    case when i.assessment > 0 and i.tax >= 0 then least(0.10, greatest(0, i.tax/i.assessment)) end as assessed_tax_rate,
    ta.avg_score
  from input_rows i
  left join town_avg ta on ta.town=i.town and ta.county=i.county
)
select c.pams_pin,
  round(coalesce(
    l.score,
    case when c.assessment > 0 and c.tax >= 0 then
      least(100, greatest(0,
        coalesce(c.avg_score,50)*0.45 +
        least(100,greatest(0,((c.assessed_tax_rate-0.012)/0.038)*100))*0.40 +
        least(100,greatest(0,((c.tax-3000)/17000)*100))*0.15
      ))
    else coalesce(c.avg_score,50) end
  )::numeric,0) as watchdog_score,
  case when l.score is not null then 'observed'
       when c.avg_score is not null then 'realtime_property_plus_town'
       else 'realtime_property' end as score_source
from calc c
left join latest l on l.pams_pin=c.pams_pin
where c.pams_pin <> '';
$function$;

revoke all on function public.get_public_realtime_watchdog_scores(jsonb) from public;
grant execute on function public.get_public_realtime_watchdog_scores(jsonb) to anon, authenticated;
