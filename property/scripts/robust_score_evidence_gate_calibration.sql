-- ROBUST-v1 evidence-gate / missingness calibration addendum
-- NJW-273 / NJW-270
-- READ ONLY. Do not mutate score_observations, weights, bands, or production score state.
--
-- Purpose:
--   1. Measure the exact ROBUST component compositions present in the latest persisted cohort.
--   2. Quantify how much unresolved score range remains when missing dimensions are unknown.
--   3. Test whether current bands are stable under extreme completion of missing evidence.
--   4. Segment current evidence coverage where sample size is large enough to report.
--
-- Interpretation rule:
--   Extreme completion is a structural sensitivity bound, not a proposed imputation rule.
--   Missing evidence remains omitted and available weights remain renormalized in ROBUST-v1.

-- -----------------------------------------------------------------------------
-- 1. Latest-per-property component composition
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,
    o.score::numeric as stored_score,
    o.evidence_coverage::numeric as coverage,
    o.inputs,
    o.observed_at
  from public.score_observations o
  where o.marker_id = 'watchdog.watchdog_score'
    and o.model_version = 'ROBUST-v1'
  order by o.pams_pin, o.observed_at desc
), c as (
  select l.*,
    nullif(l.inputs#>>'{components,recourse,score}','')::numeric as r,
    nullif(l.inputs#>>'{components,fairness,score}','')::numeric as o,
    nullif(l.inputs#>>'{components,burden,score}','')::numeric as b,
    nullif(l.inputs#>>'{components,uniformity,score}','')::numeric as u,
    nullif(l.inputs#>>'{components,stability,score}','')::numeric as s,
    nullif(l.inputs#>>'{components,trajectory,score}','')::numeric as t
  from latest l
), composition as (
  select *, concat_ws('',
    case when r is not null then 'R' else '-' end,
    case when o is not null then 'O' else '-' end,
    case when b is not null then 'B' else '-' end,
    case when u is not null then 'U' else '-' end,
    case when s is not null then 'S' else '-' end,
    case when t is not null then 'T' else '-' end
  ) as composition
  from c
)
select composition, coverage, count(*) as properties,
       round(avg(stored_score),2) as mean_score,
       min(stored_score) as min_score,
       max(stored_score) as max_score
from composition
group by composition, coverage
order by properties desc, composition;

-- -----------------------------------------------------------------------------
-- 2. Missing-dimension completion bounds and band stability
--    lower_if_missing_zero / upper_if_missing_hundred represent the full-weight
--    score if every currently missing dimension later resolved to 0 or 100.
--    These are deliberately extreme sensitivity controls, not production scores.
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,
    o.score::numeric as stored_score,
    o.evidence_coverage::numeric as coverage,
    o.inputs,
    o.observed_at
  from public.score_observations o
  where o.marker_id = 'watchdog.watchdog_score'
    and o.model_version = 'ROBUST-v1'
  order by o.pams_pin, o.observed_at desc
), c as (
  select l.*,
    nullif(l.inputs#>>'{components,recourse,score}','')::numeric as r,
    nullif(l.inputs#>>'{components,fairness,score}','')::numeric as o,
    nullif(l.inputs#>>'{components,burden,score}','')::numeric as b,
    nullif(l.inputs#>>'{components,uniformity,score}','')::numeric as u,
    nullif(l.inputs#>>'{components,stability,score}','')::numeric as s,
    nullif(l.inputs#>>'{components,trajectory,score}','')::numeric as t
  from latest l
), calc as (
  select *,
    concat_ws('',
      case when r is not null then 'R' else '-' end,
      case when o is not null then 'O' else '-' end,
      case when b is not null then 'B' else '-' end,
      case when u is not null then 'U' else '-' end,
      case when s is not null then 'S' else '-' end,
      case when t is not null then 'T' else '-' end
    ) as composition,
    (coalesce(r*10,0)+coalesce(o*20,0)+coalesce(b*30,0)+coalesce(u*15,0)+coalesce(s*15,0)+coalesce(t*10,0)) as present_num,
    ((case when r is not null then 10 else 0 end)+
     (case when o is not null then 20 else 0 end)+
     (case when b is not null then 30 else 0 end)+
     (case when u is not null then 15 else 0 end)+
     (case when s is not null then 15 else 0 end)+
     (case when t is not null then 10 else 0 end))::numeric as present_weight
  from c
), bounds as (
  select *,
    round(present_num/100.0) as lower_if_missing_zero,
    round((present_num + (100-present_weight)*100)/100.0) as upper_if_missing_hundred
  from calc
), bands as (
  select *,
    case when stored_score>=80 then 'A' when stored_score>=65 then 'B' when stored_score>=50 then 'C' when stored_score>=35 then 'D' else 'E' end as current_band,
    case when lower_if_missing_zero>=80 then 'A' when lower_if_missing_zero>=65 then 'B' when lower_if_missing_zero>=50 then 'C' when lower_if_missing_zero>=35 then 'D' else 'E' end as low_band,
    case when upper_if_missing_hundred>=80 then 'A' when upper_if_missing_hundred>=65 then 'B' when upper_if_missing_hundred>=50 then 'C' when upper_if_missing_hundred>=35 then 'D' else 'E' end as high_band
  from bounds
)
select composition, coverage, count(*) as properties,
       round(avg(upper_if_missing_hundred-lower_if_missing_zero),2) as mean_full_uncertainty_width,
       min(upper_if_missing_hundred-lower_if_missing_zero) as min_width,
       max(upper_if_missing_hundred-lower_if_missing_zero) as max_width,
       count(*) filter (where current_band=low_band and current_band=high_band) as band_stable_under_extremes,
       round(100.0*count(*) filter (where current_band=low_band and current_band=high_band)/count(*),1) as band_stable_pct,
       count(*) filter (where current_band<>low_band or current_band<>high_band) as band_can_migrate
from bands
group by composition, coverage
order by properties desc, composition;

-- -----------------------------------------------------------------------------
-- 3. Evidence coverage by reporting segment
--    Suppress segments with fewer than five observations; tiny groups are not
--    treated as calibration evidence.
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,
    o.score::numeric as score,
    o.evidence_coverage::numeric as coverage,
    o.inputs,
    o.observed_at
  from public.score_observations o
  where o.marker_id = 'watchdog.watchdog_score'
    and o.model_version = 'ROBUST-v1'
  order by o.pams_pin, o.observed_at desc
), enriched as (
  select l.*,
    coalesce(nullif(l.inputs->>'county',''),p.county,'UNKNOWN') as county,
    coalesce(nullif(l.inputs->>'town',''),p.town,'UNKNOWN') as town,
    coalesce(nullif(p.prop_class,''),'UNKNOWN') as prop_class,
    nullif(l.inputs#>>'{components,fairness,score}','')::numeric as o,
    nullif(l.inputs#>>'{components,trajectory,score}','')::numeric as t
  from latest l
  left join public.property_lookups p on p.pams_pin=l.pams_pin
)
select 'county' as segment_type, county as segment, count(*) as n,
       round(avg(score),2) as mean_score,
       percentile_cont(.5) within group(order by score) as median_score,
       round(avg(coverage),2) as mean_coverage,
       count(o) as o_present,
       count(t) as t_present
from enriched
group by county
having count(*) >= 5
union all
select 'property_class', prop_class, count(*),
       round(avg(score),2),
       percentile_cont(.5) within group(order by score),
       round(avg(coverage),2),
       count(o), count(t)
from enriched
group by prop_class
having count(*) >= 5
order by segment_type, n desc, segment;
