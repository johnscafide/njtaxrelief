-- Property cohort + percentile engine v1.
-- Uses only Watchdog-observed public parcel records in property_lookups.
-- Cohort fallback: municipality+class -> municipality -> county+class -> county -> statewide class -> statewide.
-- Minimum peer cohort = 10. Missing values remain missing.

create table if not exists public.property_cohort_metrics (
  pams_pin text primary key,
  town text,
  county text,
  prop_class text,
  cohort_level text not null,
  cohort_key text not null,
  cohort_size integer not null,
  sale_sample_size integer not null default 0,
  sale_sample_coverage_score numeric,
  sale_recency_score numeric,
  effective_tax_rate_percentile numeric,
  assessment_percentile numeric,
  sale_price_percentile numeric,
  assessment_to_sale_ratio_percentile numeric,
  improvement_share_percentile numeric,
  improvement_share_outlier_score numeric,
  sale_price_dispersion_score numeric,
  assessment_ratio_stability_score numeric,
  refreshed_at timestamptz not null default now()
);

alter table public.property_cohort_metrics enable row level security;
revoke all on table public.property_cohort_metrics from anon, authenticated;
grant select, insert, update, delete on table public.property_cohort_metrics to service_role;

create index if not exists property_cohort_metrics_town_class_idx
  on public.property_cohort_metrics (town, prop_class);
create index if not exists property_cohort_metrics_cohort_key_idx
  on public.property_cohort_metrics (cohort_level, cohort_key);

create or replace function public.refresh_property_cohort_metrics()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows integer;
begin
  delete from public.property_cohort_metrics;

  with base as (
    select
      pams_pin,
      nullif(btrim(town), '') as town,
      nullif(btrim(county), '') as county,
      nullif(btrim(prop_class), '') as prop_class,
      assessed_value::numeric as assessed_value,
      case when last_year_tax is not null and assessed_value > 0
        then (last_year_tax::numeric / assessed_value::numeric) * 100 end as effective_tax_rate,
      case when last_sale_price > 0 then last_sale_price::numeric end as sale_price,
      case when last_sale_price > 0 and assessed_value > 0
        then assessed_value::numeric / last_sale_price::numeric end as assessment_to_sale_ratio,
      case when assessed_value > 0 and improvement_value is not null
        then (improvement_value::numeric / assessed_value::numeric) * 100 end as improvement_share,
      case when last_sale_price > 0 and last_sale_year between 1800 and extract(year from current_date)::int
        then last_sale_year end as sale_year
    from public.property_lookups
    where pams_pin is not null
  ), counts as (
    select b.*,
      count(*) over (partition by town, prop_class) as town_class_n,
      count(*) over (partition by town) as town_n,
      count(*) over (partition by county, prop_class) as county_class_n,
      count(*) over (partition by county) as county_n,
      count(*) over (partition by prop_class) as state_class_n,
      count(*) over () as state_n
    from base b
  ), chosen as (
    select c.*,
      case
        when town is not null and prop_class is not null and town_class_n >= 10 then 'town_class'
        when town is not null and town_n >= 10 then 'town'
        when county is not null and prop_class is not null and county_class_n >= 10 then 'county_class'
        when county is not null and county_n >= 10 then 'county'
        when prop_class is not null and state_class_n >= 10 then 'state_class'
        else 'state'
      end as cohort_level,
      case
        when town is not null and prop_class is not null and town_class_n >= 10 then town || '|' || prop_class
        when town is not null and town_n >= 10 then town
        when county is not null and prop_class is not null and county_class_n >= 10 then county || '|' || prop_class
        when county is not null and county_n >= 10 then county
        when prop_class is not null and state_class_n >= 10 then 'NJ|' || prop_class
        else 'NJ'
      end as cohort_key
    from counts c
  ), scored as (
    select c.*,
      s.cohort_size,
      s.sale_sample_size,
      s.sale_sample_coverage_score,
      s.sale_recency_score,
      s.effective_tax_rate_percentile,
      s.assessment_percentile,
      s.sale_price_percentile,
      s.assessment_to_sale_ratio_percentile,
      s.improvement_share_percentile,
      least(100::numeric, greatest(0::numeric, abs(s.improvement_share_percentile - 50) * 2)) as improvement_share_outlier_score,
      case when s.sale_price_median > 0 and s.sale_price_p25 is not null and s.sale_price_p75 is not null
        then least(100::numeric, greatest(0::numeric, ((s.sale_price_p75 - s.sale_price_p25) / s.sale_price_median) * 100)) end as sale_price_dispersion_score,
      case when s.ratio_median > 0 and s.ratio_p25 is not null and s.ratio_p75 is not null
        then 100 - least(100::numeric, greatest(0::numeric, ((s.ratio_p75 - s.ratio_p25) / s.ratio_median) * 100)) end as assessment_ratio_stability_score
    from chosen c
    cross join lateral (
      select
        count(*)::int as cohort_size,
        count(*) filter (where x.sale_price is not null)::int as sale_sample_size,
        round(100.0 * count(*) filter (where x.sale_price is not null) / nullif(count(*),0), 1) as sale_sample_coverage_score,
        round(100.0 * count(*) filter (where x.sale_price is not null and x.sale_year >= extract(year from current_date)::int - 5)
          / nullif(count(*) filter (where x.sale_price is not null),0), 1) as sale_recency_score,
        case when c.effective_tax_rate is not null then round(100.0 * (
          count(*) filter (where x.effective_tax_rate < c.effective_tax_rate) +
          0.5 * count(*) filter (where x.effective_tax_rate = c.effective_tax_rate)
        ) / nullif(count(*) filter (where x.effective_tax_rate is not null),0), 1) end as effective_tax_rate_percentile,
        case when c.assessed_value is not null then round(100.0 * (
          count(*) filter (where x.assessed_value < c.assessed_value) +
          0.5 * count(*) filter (where x.assessed_value = c.assessed_value)
        ) / nullif(count(*) filter (where x.assessed_value is not null),0), 1) end as assessment_percentile,
        case when c.sale_price is not null then round(100.0 * (
          count(*) filter (where x.sale_price < c.sale_price) +
          0.5 * count(*) filter (where x.sale_price = c.sale_price)
        ) / nullif(count(*) filter (where x.sale_price is not null),0), 1) end as sale_price_percentile,
        case when c.assessment_to_sale_ratio is not null then round(100.0 * (
          count(*) filter (where x.assessment_to_sale_ratio < c.assessment_to_sale_ratio) +
          0.5 * count(*) filter (where x.assessment_to_sale_ratio = c.assessment_to_sale_ratio)
        ) / nullif(count(*) filter (where x.assessment_to_sale_ratio is not null),0), 1) end as assessment_to_sale_ratio_percentile,
        case when c.improvement_share is not null then round(100.0 * (
          count(*) filter (where x.improvement_share < c.improvement_share) +
          0.5 * count(*) filter (where x.improvement_share = c.improvement_share)
        ) / nullif(count(*) filter (where x.improvement_share is not null),0), 1) end as improvement_share_percentile,
        percentile_cont(0.25) within group (order by x.sale_price) filter (where x.sale_price is not null) as sale_price_p25,
        percentile_cont(0.50) within group (order by x.sale_price) filter (where x.sale_price is not null) as sale_price_median,
        percentile_cont(0.75) within group (order by x.sale_price) filter (where x.sale_price is not null) as sale_price_p75,
        percentile_cont(0.25) within group (order by x.assessment_to_sale_ratio) filter (where x.assessment_to_sale_ratio is not null) as ratio_p25,
        percentile_cont(0.50) within group (order by x.assessment_to_sale_ratio) filter (where x.assessment_to_sale_ratio is not null) as ratio_median,
        percentile_cont(0.75) within group (order by x.assessment_to_sale_ratio) filter (where x.assessment_to_sale_ratio is not null) as ratio_p75
      from base x
      where case c.cohort_level
        when 'town_class' then x.town = c.town and x.prop_class = c.prop_class
        when 'town' then x.town = c.town
        when 'county_class' then x.county = c.county and x.prop_class = c.prop_class
        when 'county' then x.county = c.county
        when 'state_class' then x.prop_class = c.prop_class
        else true
      end
    ) s
  )
  insert into public.property_cohort_metrics (
    pams_pin,town,county,prop_class,cohort_level,cohort_key,cohort_size,sale_sample_size,
    sale_sample_coverage_score,sale_recency_score,effective_tax_rate_percentile,assessment_percentile,
    sale_price_percentile,assessment_to_sale_ratio_percentile,improvement_share_percentile,
    improvement_share_outlier_score,sale_price_dispersion_score,assessment_ratio_stability_score,refreshed_at
  )
  select pams_pin,town,county,prop_class,cohort_level,cohort_key,cohort_size,sale_sample_size,
    sale_sample_coverage_score,sale_recency_score,effective_tax_rate_percentile,assessment_percentile,
    sale_price_percentile,assessment_to_sale_ratio_percentile,improvement_share_percentile,
    improvement_share_outlier_score,sale_price_dispersion_score,assessment_ratio_stability_score,now()
  from scored;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.refresh_property_cohort_metrics() from public, anon, authenticated;
grant execute on function public.refresh_property_cohort_metrics() to service_role;

create or replace function public.get_property_cohort_metrics(p_pams_pin text)
returns public.property_cohort_metrics
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.property_cohort_metrics where pams_pin = p_pams_pin;
$$;
revoke all on function public.get_property_cohort_metrics(text) from public, anon, authenticated;
grant execute on function public.get_property_cohort_metrics(text) to service_role;

select public.refresh_property_cohort_metrics();

-- Cohort-backed canonical/provider markers. These are SQL-backed and executable through
-- get_property_cohort_metrics; no user-entered or private financial data is required.
insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  ('watchdog.listing_tax_burden_percentile','watchdog-cohort-v1','percentile(effective_tax_rate within selected peer cohort)',array['cohort.effective_tax_rate_percentile']::text[],'medium','live','Observed effective-tax-rate percentile within the minimum-10 Watchdog peer cohort. Cohort fallback is municipality+class, municipality, county+class, county, statewide class, statewide.','source_alias',jsonb_build_object('dep','cohort.effective_tax_rate_percentile'),now()),
  ('watchdog.land_improvement_outlier','watchdog-cohort-v1','abs(improvement_share_percentile - 50) * 2',array['cohort.improvement_share_outlier_score']::text[],'medium','live','Symmetric assessment-composition outlier score from the parcel improvement-share percentile inside its selected peer cohort.','source_alias',jsonb_build_object('dep','cohort.improvement_share_outlier_score'),now()),
  ('watchdog.assessment_uniformity_reliability','watchdog-cohort-v1','100 - relative IQR of assessment-to-sale ratio',array['cohort.assessment_ratio_stability_score']::text[],'medium','live','Peer-cohort assessment-ratio stability from the inverse relative interquartile range of observed assessment-to-sale ratios.','source_alias',jsonb_build_object('dep','cohort.assessment_ratio_stability_score'),now()),
  ('watchdog.appraiser.sale_sample_recency','watchdog-cohort-v1','share of cohort sale records within trailing 5 years',array['cohort.sale_recency_score']::text[],'medium','live','Share of observed peer sale records whose last recorded sale falls within the trailing five years; this is public-record recency context, not MLS comp recency.','source_alias',jsonb_build_object('dep','cohort.sale_recency_score'),now()),
  ('watchdog.appraiser.sale_dispersion_watch','watchdog-cohort-v1','min(100, (sale_price_p75 - sale_price_p25) / sale_price_median * 100)',array['cohort.sale_price_dispersion_score']::text[],'medium','live','Relative IQR of observed peer sale prices, clamped to 0-100; higher means wider public-record sale dispersion and a stronger need for professional comparable review.','source_alias',jsonb_build_object('dep','cohort.sale_price_dispersion_score'),now()),
  ('watchdog.appraiser.assessment_composition_context','watchdog-cohort-v1','70% land/improvement outlier + 30% improvement-share percentile',array['cohort.improvement_share_outlier_score','cohort.improvement_share_percentile']::text[],'medium','live','Peer-relative assessment composition context. Higher scores indicate more unusual land/improvement composition within the selected observed cohort; not an appraisal conclusion.','weighted_scores',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','cohort.improvement_share_outlier_score','weight',70,'transform','identity'),jsonb_build_object('dep','cohort.improvement_share_percentile','weight',30,'transform','identity')),'require_all',true),now()),
  ('watchdog.appraiser.market_anchor_refresh','watchdog-cohort-v1','60% inverse market-anchor confidence + 40% inverse cohort sale recency',array['watchdog.market_anchor_confidence','cohort.sale_recency_score']::text[],'medium','live','Refresh priority for a public market anchor. Higher means current evidence confidence is weaker and/or the observed peer sale sample is older.','weighted_scores',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','watchdog.market_anchor_confidence','weight',60,'transform','inverse'),jsonb_build_object('dep','cohort.sale_recency_score','weight',40,'transform','inverse')),'require_all',true),now())
on conflict (marker_id) do update set
  engine_version=excluded.engine_version, formula=excluded.formula, dependencies=excluded.dependencies,
  confidence=excluded.confidence, status=excluded.status, explanation=excluded.explanation,
  operation=excluded.operation, config=excluded.config, updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.listing_tax_burden_percentile',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Observed peer-cohort percentile; service-role SQL provider, minimum cohort 10.','derived_cohort',array['cohort.effective_tax_rate_percentile']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true),
  ('watchdog.land_improvement_outlier',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Observed peer-cohort assessment-composition outlier; service-role SQL provider.','derived_cohort',array['cohort.improvement_share_outlier_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true),
  ('watchdog.assessment_uniformity_reliability',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Observed peer-cohort assessment-to-sale ratio stability; not a statutory COD calculation.','derived_cohort',array['cohort.assessment_ratio_stability_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true),
  ('watchdog.appraiser.sale_sample_recency',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Trailing-five-year share of observed peer public sale records; not MLS comp recency.','derived_cohort',array['cohort.sale_recency_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true),
  ('watchdog.appraiser.sale_dispersion_watch',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Relative IQR of observed peer public sale prices.','derived_cohort',array['cohort.sale_price_dispersion_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true),
  ('watchdog.appraiser.assessment_composition_context',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Peer-relative assessment composition using observed improvement-share distribution.','derived_cohort',array['cohort.improvement_share_outlier_score','cohort.improvement_share_percentile']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true),
  ('watchdog.appraiser.market_anchor_refresh',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups','watchdog.market_anchor_confidence']::text[],now(),'Fail-closed refresh priority from governed market-anchor confidence and peer sale recency.','derived_cohort',array['watchdog.market_anchor_confidence','cohort.sale_recency_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_source_change',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;
