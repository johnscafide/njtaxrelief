-- ROBUST-v1 Trajectory provenance calibration
-- NJW-273 / 2026-08-23
-- READ ONLY. This harness does not mutate score_observations or invoke workbench-score.
--
-- Purpose:
--   1. Audit whether property_lookups.last_sale_* agrees with governed SR-1A subject evidence.
--   2. Quantify the stale-sale risk discovered while attempting to expand Trajectory coverage.
--   3. Recompute Trajectory only from parcel-matched SR-1A subject sale evidence.
--   4. Report exact, unique-parcel, compact-exact and compact-unique match classes separately.
--   5. Confirm the statewide SR-1A subject index is healthy before classifying unmatched parcels as evidence absence.
--   6. Keep ROBUST-v1 weights/bands unchanged; missing T continues to be omitted/renormalized.

-- -----------------------------------------------------------------------------
-- 1. Latest canonical calibration cohort + governed subject matches
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,
    o.score::numeric as stored_score,
    o.evidence_coverage::numeric as stored_coverage,
    o.inputs,
    o.observed_at
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score'
    and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), subjects as (
  select
    l.pams_pin,
    p.last_sale_price,
    p.last_sale_year,
    left(regexp_replace(l.pams_pin,'\D','','g'),4) as district,
    upper(regexp_replace(regexp_replace(coalesce(p.block,''),'\s+','','g'),'^0+','')) as block,
    upper(regexp_replace(regexp_replace(coalesce(p.lot,''),'\s+','','g'),'^0+','')) as lot,
    upper(regexp_replace(trim(coalesce(p.qualifier,'')),'\s+','','g')) as qualifier
  from latest l
  join public.property_lookups p using(pams_pin)
  where coalesce(p.block,'')<>'' and coalesce(p.lot,'')<>''
), payload as (
  select jsonb_agg(jsonb_build_object(
    'key',pams_pin,
    'district',district,
    'block',block,
    'lot',lot,
    'qualifier',qualifier
  )) as js
  from subjects
), matches as (
  select m.* from payload p
  cross join lateral public.lookup_sr1a_subject_evidence(p.js) m
)
select
  count(*) as subject_matches,
  count(*) filter(where m.sale_price is not null and m.sale_year is not null) as matches_with_verified_sale,
  count(*) filter(where s.last_sale_price=m.sale_price and s.last_sale_year=m.sale_year) as property_lookup_exact_sale_matches,
  count(*) filter(where s.last_sale_year=m.sale_year) as property_lookup_year_matches,
  count(*) filter(where s.last_sale_price=m.sale_price) as property_lookup_price_matches,
  count(*) filter(where m.match_quality='exact') as exact_parcel_matches,
  count(*) filter(where m.match_quality='unique_parcel_fallback') as unique_parcel_fallback_matches,
  count(*) filter(where m.match_quality='compact_exact') as compact_exact_matches,
  count(*) filter(where m.match_quality='compact_unique_parcel_fallback') as compact_unique_parcel_fallback_matches
from matches m
join subjects s on s.pams_pin=m.request_key;

-- -----------------------------------------------------------------------------
-- 2. Stale parcel-sale sensitivity under the retired broad property_lookups gate
--    This is diagnostic only. These rows are NOT accepted as governed T evidence.
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin) o.pams_pin,o.inputs
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score' and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), base as (
  select l.pams_pin,p.assessed_value,p.last_sale_price,p.last_sale_year,
    nullif(l.inputs#>>'{components,burden,note,market_value}','')::numeric as market_value,
    l.inputs#>>'{components,burden,note,market_source}' as market_source
  from latest l left join public.property_lookups p using(pams_pin)
), candidates as (
  select *,
    case when market_source='verified' and market_value>0 and assessed_value>0
      then assessed_value::numeric/market_value end as verified_ratio
  from base
), scored as (
  select *,
    round(100*greatest(0::numeric,least(1::numeric,
      case
        when ((assessed_value::numeric/last_sale_price)/verified_ratio)<0.85
          then 0.35+((assessed_value::numeric/last_sale_price)/verified_ratio)*0.4
        when ((assessed_value::numeric/last_sale_price)/verified_ratio)>1.15
          then 1.15-((((assessed_value::numeric/last_sale_price)/verified_ratio)-1)*0.8)
        else 1
      end
    ))) as diagnostic_t
  from candidates
  where verified_ratio is not null
    and last_sale_price>=1000
    and last_sale_year between 1900 and extract(year from current_date)::int+1
    and assessed_value>0
    and (assessed_value::numeric/last_sale_price) between 0.05 and 5
    and (assessed_value::numeric/last_sale_price) between verified_ratio*0.12 and verified_ratio*8
)
select
  case
    when last_sale_year>=2024 then '2024-2026'
    when last_sale_year>=2020 then '2020-2023'
    when last_sale_year>=2015 then '2015-2019'
    when last_sale_year>=2010 then '2010-2014'
    when last_sale_year>=2000 then '2000-2009'
    else 'pre-2000'
  end as sale_bucket,
  count(*) as n,
  round(avg(diagnostic_t),2) as mean_t,
  percentile_cont(.5) within group(order by diagnostic_t) as median_t,
  min(diagnostic_t) as min_t,
  max(diagnostic_t) as max_t,
  round(avg(extract(year from current_date)::int-last_sale_year),1) as mean_sale_age_years
from scored
group by sale_bucket
order by min(last_sale_year) desc;

-- -----------------------------------------------------------------------------
-- 3. Strict governed Trajectory coverage from SR-1A subject sale evidence
-- -----------------------------------------------------------------------------
with latest as (
  select distinct on (o.pams_pin)
    o.pams_pin,o.inputs,o.observed_at
  from public.score_observations o
  where o.marker_id='watchdog.watchdog_score' and o.model_version='ROBUST-v1'
  order by o.pams_pin,o.observed_at desc
), base as (
  select l.pams_pin,l.inputs,p.assessed_value,p.block,p.lot,p.qualifier,
    nullif(l.inputs#>>'{components,burden,note,market_value}','')::numeric as market_value,
    l.inputs#>>'{components,burden,note,market_source}' as market_source
  from latest l left join public.property_lookups p using(pams_pin)
), payload as (
  select jsonb_agg(jsonb_build_object(
    'key',pams_pin,
    'district',left(regexp_replace(pams_pin,'\D','','g'),4),
    'block',upper(regexp_replace(regexp_replace(coalesce(block,''),'\s+','','g'),'^0+','')),
    'lot',upper(regexp_replace(regexp_replace(coalesce(lot,''),'\s+','','g'),'^0+','')),
    'qualifier',upper(regexp_replace(trim(coalesce(qualifier,'')),'\s+','','g'))
  )) as js
  from base
  where coalesce(block,'')<>'' and coalesce(lot,'')<>''
), matches as (
  select m.* from payload p
  cross join lateral public.lookup_sr1a_subject_evidence(p.js) m
), evidence as (
  select b.*,
    m.sale_price as subject_sale_price,
    m.sale_year as subject_sale_year,
    m.match_quality,
    case when b.market_source='verified' and b.market_value>0 and b.assessed_value>0
      then b.assessed_value::numeric/b.market_value end as verified_ratio
  from base b left join matches m on m.request_key=b.pams_pin
), strict_t as (
  select *,
    round(100*greatest(0::numeric,least(1::numeric,
      case
        when ((assessed_value::numeric/subject_sale_price)/verified_ratio)<0.85
          then 0.35+((assessed_value::numeric/subject_sale_price)/verified_ratio)*0.4
        when ((assessed_value::numeric/subject_sale_price)/verified_ratio)>1.15
          then 1.15-((((assessed_value::numeric/subject_sale_price)/verified_ratio)-1)*0.8)
        else 1
      end
    ))) as trajectory_score
  from evidence
  where verified_ratio is not null
    and subject_sale_price>=1000
    and subject_sale_year between 1900 and extract(year from current_date)::int+1
    and assessed_value>0
    and (assessed_value::numeric/subject_sale_price) between 0.05 and 5
    and (assessed_value::numeric/subject_sale_price) between verified_ratio*0.12 and verified_ratio*8
)
select
  count(*) as governed_t_properties,
  count(*) filter(where match_quality='exact') as exact_matches,
  count(*) filter(where match_quality='unique_parcel_fallback') as unique_parcel_fallback_matches,
  count(*) filter(where match_quality='compact_exact') as compact_exact_matches,
  count(*) filter(where match_quality='compact_unique_parcel_fallback') as compact_unique_parcel_fallback_matches,
  round(avg(trajectory_score),2) as mean_t,
  percentile_cont(.5) within group(order by trajectory_score) as median_t,
  min(trajectory_score) as min_t,
  max(trajectory_score) as max_t
from strict_t;

-- -----------------------------------------------------------------------------
-- 4. Whole property warehouse governed subject-evidence coverage
--    Compact matching is parcel-based only. Do not add sale-price/year matching here.
-- -----------------------------------------------------------------------------
with subjects as (
  select
    pams_pin,
    county,
    prop_class,
    left(regexp_replace(coalesce(pams_pin,''),'\D','','g'),4) as district,
    upper(regexp_replace(regexp_replace(coalesce(block,''),'\s+','','g'),'^0+','')) as block,
    upper(regexp_replace(regexp_replace(coalesce(lot,''),'\s+','','g'),'^0+','')) as lot,
    upper(regexp_replace(trim(coalesce(qualifier,'')),'\s+','','g')) as qualifier
  from public.property_lookups
  where coalesce(block,'')<>'' and coalesce(lot,'')<>''
), payload as (
  select jsonb_agg(jsonb_build_object(
    'key',pams_pin,
    'district',district,
    'block',block,
    'lot',lot,
    'qualifier',qualifier
  )) as js
  from subjects
), matches as (
  select m.* from payload p
  cross join lateral public.lookup_sr1a_subject_evidence(p.js) m
)
select
  (select count(*) from subjects) as warehouse_properties,
  count(*) as governed_subject_matches,
  count(*) filter(where match_quality='exact') as exact_matches,
  count(*) filter(where match_quality='unique_parcel_fallback') as unique_parcel_fallback_matches,
  count(*) filter(where match_quality='compact_exact') as compact_exact_matches,
  count(*) filter(where match_quality='compact_unique_parcel_fallback') as compact_unique_parcel_fallback_matches,
  count(distinct request_key) as unique_matched_properties,
  count(*)-count(distinct request_key) as duplicate_request_rows
from matches;

-- -----------------------------------------------------------------------------
-- 5. Latest statewide SR-1A subject-index health
--    A healthy source/index plane is required before unmatched parcels are treated as
--    genuine evidence absence rather than an ingestion failure.
-- -----------------------------------------------------------------------------
with latest_per_county as (
  select distinct on (county_code)
    county_code,
    status,
    source_record_count,
    indexed_parcel_count,
    rows_with_living_space,
    refreshed_at,
    updated_at,
    error_text
  from public.sr1a_subject_index_runs
  order by county_code,coalesce(refreshed_at,updated_at) desc nulls last
)
select
  count(*) as counties,
  count(*) filter(where status='ready' and error_text is null) as ready_no_error,
  sum(source_record_count) as source_records,
  sum(indexed_parcel_count) as indexed_parcels,
  sum(rows_with_living_space) as rows_with_living_space,
  min(refreshed_at) as oldest_latest_refresh,
  max(refreshed_at) as newest_latest_refresh
from latest_per_county;
