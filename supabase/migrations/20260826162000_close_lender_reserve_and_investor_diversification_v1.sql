-- Five-year authoritative tax-history evidence depth, used as a confidence input rather than a reserve-dollar estimate.
insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.tax_history_5y_completeness','watchdog-tax-history-v1','Percent of 2021-2025 official municipal general tax-rate fields present',array['tax.rate_2021','tax.rate_2022','tax.rate_2023','tax.rate_2024','tax.rate_2025'],'high','live','Evidence-depth score only. It does not forecast taxes or calculate a cash reserve.','completeness','{"requirements":["tax.rate_2021","tax.rate_2022","tax.rate_2023","tax.rate_2024","tax.rate_2025"]}'::jsonb,now()),
('watchdog.lender.tax_reserve_confidence','watchdog-tax-history-v1','65% five-year official tax-rate history completeness + 35% authoritative source coverage',array['watchdog.tax_history_5y_completeness','watchdog.source_authority_coverage'],'high','live','Narrowed v1 measures confidence in public tax-history evidence available for reserve planning. It does not recommend a reserve amount, underwrite a loan, or include borrower/escrow/insurance inputs.','weighted_scores','{"require_all":true,"items":[{"dep":"watchdog.tax_history_5y_completeness","weight":65,"transform":"identity"},{"dep":"watchdog.source_authority_coverage","weight":35,"transform":"identity"}]}'::jsonb,now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable) values
('watchdog.tax_history_5y_completeness',array['municipality'],'watchdog-derived','live',array['nj-municipal-reference-live-v1'],now(),'Completeness of official 2021-2025 municipal general tax-rate history.','derived_governed',array['tax.rate_2021','tax.rate_2022','tax.rate_2023','tax.rate_2024','tax.rate_2025'],'watchdog-tax-history-v1',86400,'refresh_on_demand',true),
('watchdog.lender.tax_reserve_confidence',array['property'],'watchdog-derived','live',array['nj-municipal-reference-live-v1','data_center_provider_coverage'],now(),'Public tax-history evidence confidence only; no reserve-dollar recommendation.','derived_governed',array['watchdog.tax_history_5y_completeness','watchdog.source_authority_coverage'],'watchdog-tax-history-v1',86400,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status='live',source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

-- User-scoped portfolio diversification from the user's actual saved-property municipality distribution.
with eligible as (
  select user_id,
         count(*) filter(where coalesce(nullif(trim(town),''),'') <> '')::int as portfolio_count,
         max(town_count)::int as largest_municipality_count
  from (
    select sp.user_id, sp.town,
           count(*) over(partition by sp.user_id, upper(trim(coalesce(sp.town,'')))) as town_count
    from public.saved_properties sp
  ) x
  group by user_id
  having count(*) filter(where coalesce(nullif(trim(town),''),'') <> '') >= 2
), scores as (
  select user_id, portfolio_count, largest_municipality_count,
         greatest(0, least(100, round(100 - (largest_municipality_count::numeric / nullif(portfolio_count,0) * 100))))::numeric as diversification_score
  from eligible
), targets as (
  select distinct sp.user_id, sp.pams_pin, s.portfolio_count, s.largest_municipality_count, s.diversification_score
  from public.saved_properties sp join scores s using(user_id)
  where sp.pams_pin is not null
)
insert into public.score_observations(user_id,pams_pin,marker_id,score,observed_on,observed_at,model_version,evidence_coverage,inputs,formula)
select user_id,pams_pin,'watchdog.investor.municipal_exposure_diversification',diversification_score,current_date,now(),'watchdog-portfolio-diversification-v1',100,
       jsonb_build_object('portfolio_count',portfolio_count,'largest_municipality_count',largest_municipality_count),
       '100 - largest municipality share of user saved-property portfolio; requires >=2 saved properties with municipality'
from targets
on conflict(user_id,pams_pin,marker_id,observed_on) do update set score=excluded.score,observed_at=excluded.observed_at,model_version=excluded.model_version,evidence_coverage=excluded.evidence_coverage,inputs=excluded.inputs,formula=excluded.formula;

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable) values
('watchdog.investor.municipal_exposure_diversification',array['property'],'score_observations','live',array['saved_properties'],now(),'User-scoped diversification from actual saved-property municipality concentration; requires at least two saved properties with municipality.','trusted_observation',array['saved_properties.town'],'watchdog-portfolio-diversification-v1',86400,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status='live',source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;