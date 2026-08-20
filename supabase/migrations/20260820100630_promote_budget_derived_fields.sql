-- Promote five municipality-level Watchdog budget calculations only after the
-- authenticated budget_derived_v1 production canary passed exact values and
-- provider_kind=derived_governed for every marker.
--
-- Evidence control: 0505_824.02_12 / Lower Township
-- levy_base_gap=0.027178, pressure_score=51, pressure_band=moderate,
-- structural_imbalance=0, structural_imbalance_share=0.

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'budget.levy_base_gap',array['municipality'],'workbench-hydrate','live',
  array['NJ DCA property-tax filings','Watchdog Municipal Budget Pressure v1.0'],now(),
  'Total levy CAGR minus organic ratable growth. Organic ratable growth excludes apparent revaluation resets before taking the median annual taxable-base change.',
  'derived_governed',array['trend.total_levy_cagr','trend.ratable_growth','trend.levy_base_gap'],
  'budget-pressure-v1.0',21600,'refresh_on_demand',true
),
(
  'budget.pressure_score',array['municipality'],'workbench-hydrate','live',
  array['NJ DCA property-tax filings','NJ DCA User-Friendly Budget filings','Watchdog Municipal Budget Pressure v1.0'],now(),
  'Relative statewide fiscal-pressure score. Available inputs are percentile-ranked and combined with fixed weights: levy/base gap 35%, levy growth 20%, budget growth 15%, debt-service share 10%, collection weakness 10%, structural-imbalance share 10%. Missing inputs reduce the available weight rather than receive synthetic values.',
  'derived_governed',array['trend.levy_base_gap','trend.total_levy_cagr','budget.appropriation_growth','budget.debt_service_share','budget.collection_rate','budget.structural_imbalance_share'],
  'budget-pressure-v1.0',21600,'refresh_on_demand',true
),
(
  'budget.pressure_band',array['municipality'],'workbench-hydrate','live',
  array['Watchdog Municipal Budget Pressure v1.0'],now(),
  'Deterministic label from the governed pressure score: low 0-34, moderate 35-54, elevated 55-74, high 75-100.',
  'derived_governed',array['budget.pressure_score'],
  'budget-pressure-v1.0',21600,'refresh_on_demand',true
),
(
  'budget.structural_imbalance',array['municipality'],'workbench-hydrate','live',
  array['NJ DCA User-Friendly Budget filings','Watchdog Municipal Budget Pressure v1.0'],now(),
  'Reported structural-imbalance dollars: revenues at risk plus non-recurring reductions plus future-year increases from the NJ DCA User-Friendly Budget workbook.',
  'derived_governed',array['budget.revenues_at_risk','budget.nonrecurring_reductions','budget.future_increases'],
  'budget-pressure-v1.0',21600,'refresh_on_demand',true
),
(
  'budget.structural_imbalance_share',array['municipality'],'workbench-hydrate','live',
  array['NJ DCA User-Friendly Budget filings','Watchdog Municipal Budget Pressure v1.0'],now(),
  'Reported structural-imbalance dollars divided by current total appropriation. Missing/invalid appropriations do not receive a synthetic share.',
  'derived_governed',array['budget.structural_imbalance','budget.current_appropriation'],
  'budget-pressure-v1.0',21600,'refresh_on_demand',true
)
on conflict(marker_id) do update set
  scopes=excluded.scopes,
  provider_key=excluded.provider_key,
  value_status=excluded.value_status,
  source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,
  notes=excluded.notes,
  provider_kind=excluded.provider_kind,
  source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;
