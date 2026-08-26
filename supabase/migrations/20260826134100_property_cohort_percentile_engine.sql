-- Governed property cohort + percentile engine v1.
-- Observed public parcel universe only. Minimum peer cohort = 10.
-- Fallback: municipality+class -> municipality -> county+class -> county -> statewide class -> statewide.

create table if not exists public.property_cohort_metrics (
  pams_pin text primary key,
  town text, county text, prop_class text,
  cohort_level text not null, cohort_key text not null,
  cohort_size integer not null, sale_sample_size integer not null default 0,
  sale_sample_coverage_score numeric, sale_recency_score numeric,
  effective_tax_rate_percentile numeric, assessment_percentile numeric, sale_price_percentile numeric,
  assessment_to_sale_ratio_percentile numeric, improvement_share_percentile numeric,
  improvement_share_outlier_score numeric, sale_price_dispersion_score numeric,
  assessment_ratio_stability_score numeric,
  refreshed_at timestamptz not null default now()
);
alter table public.property_cohort_metrics enable row level security;
revoke all on public.property_cohort_metrics from anon, authenticated;
grant select, insert, update, delete on public.property_cohort_metrics to service_role;
create index if not exists property_cohort_metrics_town_class_idx on public.property_cohort_metrics(town,prop_class);
create index if not exists property_cohort_metrics_cohort_key_idx on public.property_cohort_metrics(cohort_level,cohort_key);

create or replace function public.refresh_property_cohort_metrics()
returns integer language plpgsql security invoker set search_path=public as $$
declare v_rows integer;
begin
  delete from public.property_cohort_metrics;
  with base as (
    select pams_pin,nullif(btrim(town),'') town,nullif(btrim(county),'') county,nullif(btrim(prop_class),'') prop_class,
      assessed_value::numeric assessed_value,
      case when last_year_tax is not null and assessed_value>0 then last_year_tax::numeric/assessed_value::numeric*100 end effective_tax_rate,
      case when last_sale_price>0 then last_sale_price::numeric end sale_price,
      case when last_sale_price>0 and assessed_value>0 then assessed_value::numeric/last_sale_price::numeric end assessment_to_sale_ratio,
      case when assessed_value>0 and improvement_value is not null then improvement_value::numeric/assessed_value::numeric*100 end improvement_share,
      case when last_sale_price>0 and last_sale_year between 1800 and extract(year from current_date)::int then last_sale_year end sale_year
    from public.property_lookups where pams_pin is not null
  ), counts as (
    select b.*,
      count(*) over(partition by town,prop_class) tc_n,count(*) over(partition by town) t_n,
      count(*) over(partition by county,prop_class) cc_n,count(*) over(partition by county) c_n,
      count(*) over(partition by prop_class) sc_n,count(*) over() s_n
    from base b
  ), chosen as (
    select c.*,
      case when town is not null and prop_class is not null and tc_n>=10 then 'town_class'
           when town is not null and t_n>=10 then 'town'
           when county is not null and prop_class is not null and cc_n>=10 then 'county_class'
           when county is not null and c_n>=10 then 'county'
           when prop_class is not null and sc_n>=10 then 'state_class' else 'state' end cohort_level,
      case when town is not null and prop_class is not null and tc_n>=10 then town||'|'||prop_class
           when town is not null and t_n>=10 then town
           when county is not null and prop_class is not null and cc_n>=10 then county||'|'||prop_class
           when county is not null and c_n>=10 then county
           when prop_class is not null and sc_n>=10 then 'NJ|'||prop_class else 'NJ' end cohort_key
    from counts c
  ), scored as (
    select c.*,s.cohort_size,s.sale_sample_size,s.sale_coverage,s.sale_recency,s.tax_pct,s.assessment_pct,s.sale_pct,s.ratio_pct,s.improvement_pct,
      least(100::numeric,greatest(0::numeric,abs(s.improvement_pct-50)*2)) improvement_outlier,
      case when s.sale_med>0 and s.sale_p25 is not null and s.sale_p75 is not null then least(100::numeric,greatest(0::numeric,(s.sale_p75-s.sale_p25)/s.sale_med*100)) end sale_dispersion,
      case when s.ratio_med>0 and s.ratio_p25 is not null and s.ratio_p75 is not null then 100-least(100::numeric,greatest(0::numeric,(s.ratio_p75-s.ratio_p25)/s.ratio_med*100)) end ratio_stability
    from chosen c cross join lateral (
      select count(*)::int cohort_size,count(*) filter(where x.sale_price is not null)::int sale_sample_size,
        round(100.0*count(*) filter(where x.sale_price is not null)/nullif(count(*),0),1) sale_coverage,
        round(100.0*count(*) filter(where x.sale_price is not null and x.sale_year>=extract(year from current_date)::int-5)/nullif(count(*) filter(where x.sale_price is not null),0),1) sale_recency,
        case when c.effective_tax_rate is not null then round(100.0*(count(*) filter(where x.effective_tax_rate<c.effective_tax_rate)+0.5*count(*) filter(where x.effective_tax_rate=c.effective_tax_rate))/nullif(count(*) filter(where x.effective_tax_rate is not null),0),1) end tax_pct,
        case when c.assessed_value is not null then round(100.0*(count(*) filter(where x.assessed_value<c.assessed_value)+0.5*count(*) filter(where x.assessed_value=c.assessed_value))/nullif(count(*) filter(where x.assessed_value is not null),0),1) end assessment_pct,
        case when c.sale_price is not null then round(100.0*(count(*) filter(where x.sale_price<c.sale_price)+0.5*count(*) filter(where x.sale_price=c.sale_price))/nullif(count(*) filter(where x.sale_price is not null),0),1) end sale_pct,
        case when c.assessment_to_sale_ratio is not null then round(100.0*(count(*) filter(where x.assessment_to_sale_ratio<c.assessment_to_sale_ratio)+0.5*count(*) filter(where x.assessment_to_sale_ratio=c.assessment_to_sale_ratio))/nullif(count(*) filter(where x.assessment_to_sale_ratio is not null),0),1) end ratio_pct,
        case when c.improvement_share is not null then round(100.0*(count(*) filter(where x.improvement_share<c.improvement_share)+0.5*count(*) filter(where x.improvement_share=c.improvement_share))/nullif(count(*) filter(where x.improvement_share is not null),0),1) end improvement_pct,
        percentile_cont(.25) within group(order by x.sale_price) filter(where x.sale_price is not null) sale_p25,
        percentile_cont(.5) within group(order by x.sale_price) filter(where x.sale_price is not null) sale_med,
        percentile_cont(.75) within group(order by x.sale_price) filter(where x.sale_price is not null) sale_p75,
        percentile_cont(.25) within group(order by x.assessment_to_sale_ratio) filter(where x.assessment_to_sale_ratio is not null) ratio_p25,
        percentile_cont(.5) within group(order by x.assessment_to_sale_ratio) filter(where x.assessment_to_sale_ratio is not null) ratio_med,
        percentile_cont(.75) within group(order by x.assessment_to_sale_ratio) filter(where x.assessment_to_sale_ratio is not null) ratio_p75
      from base x where case c.cohort_level when 'town_class' then x.town=c.town and x.prop_class=c.prop_class when 'town' then x.town=c.town when 'county_class' then x.county=c.county and x.prop_class=c.prop_class when 'county' then x.county=c.county when 'state_class' then x.prop_class=c.prop_class else true end
    ) s
  )
  insert into public.property_cohort_metrics
  select pams_pin,town,county,prop_class,cohort_level,cohort_key,cohort_size,sale_sample_size,sale_coverage,sale_recency,tax_pct,assessment_pct,sale_pct,ratio_pct,improvement_pct,improvement_outlier,sale_dispersion,ratio_stability,now() from scored;
  get diagnostics v_rows=row_count; return v_rows;
end $$;
revoke all on function public.refresh_property_cohort_metrics() from public,anon,authenticated;
grant execute on function public.refresh_property_cohort_metrics() to service_role;

create or replace function public.get_property_cohort_metrics(p_pams_pin text)
returns public.property_cohort_metrics language sql stable security invoker set search_path=public as $$
  select * from public.property_cohort_metrics where pams_pin=p_pams_pin
$$;
revoke all on function public.get_property_cohort_metrics(text) from public,anon,authenticated;
grant execute on function public.get_property_cohort_metrics(text) to service_role;
select public.refresh_property_cohort_metrics();

insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.listing_tax_burden_percentile','watchdog-cohort-v1','percentile(effective tax rate within selected peer cohort)',array['cohort.effective_tax_rate_percentile']::text[],'medium','live','Observed effective-tax-rate percentile within the minimum-10 Watchdog peer cohort.','source_alias',jsonb_build_object('dep','cohort.effective_tax_rate_percentile'),now()),
('watchdog.land_improvement_outlier','watchdog-cohort-v1','abs(improvement share percentile - 50) * 2',array['cohort.improvement_share_outlier_score']::text[],'medium','live','Symmetric peer assessment-composition outlier score.','source_alias',jsonb_build_object('dep','cohort.improvement_share_outlier_score'),now()),
('watchdog.assessment_uniformity_reliability','watchdog-cohort-v1','100 - relative IQR of assessment-to-sale ratio',array['cohort.assessment_ratio_stability_score']::text[],'medium','live','Peer assessment-ratio stability; not statutory COD.','source_alias',jsonb_build_object('dep','cohort.assessment_ratio_stability_score'),now()),
('watchdog.appraiser.sale_sample_recency','watchdog-cohort-v1','share of cohort sale records within trailing 5 years',array['cohort.sale_recency_score']::text[],'medium','live','Observed public-record cohort sale recency; not MLS comp recency.','source_alias',jsonb_build_object('dep','cohort.sale_recency_score'),now()),
('watchdog.appraiser.sale_dispersion_watch','watchdog-cohort-v1','min(100, relative sale-price IQR * 100)',array['cohort.sale_price_dispersion_score']::text[],'medium','live','Relative peer public-sale dispersion.','source_alias',jsonb_build_object('dep','cohort.sale_price_dispersion_score'),now()),
('watchdog.appraiser.assessment_composition_context','watchdog-cohort-v1','70% improvement-share outlier + 30% improvement-share percentile',array['cohort.improvement_share_outlier_score','cohort.improvement_share_percentile']::text[],'medium','live','Peer-relative assessment composition; not appraisal conclusion.','weighted_scores',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','cohort.improvement_share_outlier_score','weight',70,'transform','identity'),jsonb_build_object('dep','cohort.improvement_share_percentile','weight',30,'transform','identity')),'require_all',true),now()),
('watchdog.appraiser.market_anchor_refresh','watchdog-cohort-v1','60% inverse market-anchor confidence + 40% inverse cohort sale recency',array['watchdog.market_anchor_confidence','cohort.sale_recency_score']::text[],'medium','live','Higher means public market evidence should be refreshed.','weighted_scores',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','watchdog.market_anchor_confidence','weight',60,'transform','inverse'),jsonb_build_object('dep','cohort.sale_recency_score','weight',40,'transform','inverse')),'require_all',true),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable) values
('watchdog.listing_tax_burden_percentile',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Minimum-10 observed peer cohort.','derived_cohort',array['cohort.effective_tax_rate_percentile']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true),
('watchdog.land_improvement_outlier',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Peer assessment-composition outlier.','derived_cohort',array['cohort.improvement_share_outlier_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true),
('watchdog.assessment_uniformity_reliability',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Peer assessment-ratio stability; not statutory COD.','derived_cohort',array['cohort.assessment_ratio_stability_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true),
('watchdog.appraiser.sale_sample_recency',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Public-record peer sale recency.','derived_cohort',array['cohort.sale_recency_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true),
('watchdog.appraiser.sale_dispersion_watch',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Relative public-sale IQR.','derived_cohort',array['cohort.sale_price_dispersion_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true),
('watchdog.appraiser.assessment_composition_context',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups']::text[],now(),'Peer-relative improvement-share context.','derived_cohort',array['cohort.improvement_share_outlier_score','cohort.improvement_share_percentile']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true),
('watchdog.appraiser.market_anchor_refresh',array['property']::text[],'watchdog-cohort-v1','live',array['property_lookups','watchdog.market_anchor_confidence']::text[],now(),'Fail-closed market evidence refresh priority.','derived_cohort',array['watchdog.market_anchor_confidence','cohort.sale_recency_score']::text[],'watchdog-cohort-v1',86400,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
