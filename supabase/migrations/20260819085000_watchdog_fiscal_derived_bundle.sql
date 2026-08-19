-- Watchdog fiscal derived bundle.
-- Promotes only formulas whose upstream tax and municipal-finance inputs already resolve through governed providers.

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
values
(
  'watchdog.tax_trend_position','watchdog-derived-v6-fiscal',
  '100 - normalized positive CAGR across the available 2016-2025 NJ general-tax-rate series',
  array['tax.rate_2016','tax.rate_2017','tax.rate_2018','tax.rate_2019','tax.rate_2020','tax.rate_2021','tax.rate_2022','tax.rate_2023','tax.rate_2024','tax.rate_2025'],
  'high','live',
  'Municipal tax-rate stability score. Requires at least three positive annual general-tax-rate observations spanning at least two years; upward CAGR is normalized against a 5% annual reference and inverted so higher means more stable.',
  'tax_rate_position',
  '{"rate_deps":[{"dep":"tax.rate_2016","year":2016},{"dep":"tax.rate_2017","year":2017},{"dep":"tax.rate_2018","year":2018},{"dep":"tax.rate_2019","year":2019},{"dep":"tax.rate_2020","year":2020},{"dep":"tax.rate_2021","year":2021},{"dep":"tax.rate_2022","year":2022},{"dep":"tax.rate_2023","year":2023},{"dep":"tax.rate_2024","year":2024},{"dep":"tax.rate_2025","year":2025}]}'::jsonb
),
(
  'watchdog.municipal_cost_absorption_score','watchdog-derived-v6-fiscal',
  '70% inverse positive levy/ratable CAGR gap + 30% normalized tax-collection rate',
  array['budget.total_levy_cagr','budget.ratable_growth','budget.collection_rate'],
  'high','live',
  'Municipal capacity signal using reported levy growth, organic ratable-base growth and collection performance. All three inputs are required; missing fiscal data is not replaced with a neutral default.',
  'municipal_cost_absorption',
  '{"levy_dep":"budget.total_levy_cagr","ratable_dep":"budget.ratable_growth","collection_dep":"budget.collection_rate"}'::jsonb
),
(
  'watchdog.fiscal_resilience_score','watchdog-derived-v6-fiscal',
  '35% inverse municipal budget pressure + 30% municipal cost absorption + 20% normalized collection rate + 15% inverse debt-service burden',
  array['budget.pressure_score','watchdog.municipal_cost_absorption_score','budget.collection_rate','budget.debt_service_share'],
  'high','live',
  'Municipal fiscal resilience screening score. All four governed inputs are required so incomplete source coverage produces dependency_missing rather than a synthetic midpoint.',
  'fiscal_resilience',
  '{"pressure_dep":"budget.pressure_score","absorption_dep":"watchdog.municipal_cost_absorption_score","collection_dep":"budget.collection_rate","debt_dep":"budget.debt_service_share"}'::jsonb
)
on conflict (marker_id) do update
set engine_version=excluded.engine_version,
    formula=excluded.formula,
    dependencies=excluded.dependencies,
    confidence=excluded.confidence,
    status=excluded.status,
    explanation=excluded.explanation,
    operation=excluded.operation,
    config=excluded.config,
    updated_at=now();

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'watchdog.tax_trend_position',array['property','town'],'watchdog-derived','live',array['NJ Division of Taxation general tax rates'],now(),
  'Governed deterministic fiscal formula; missing rate history returns dependency_missing.',
  'derived_governed',array['tax.rate_2016','tax.rate_2017','tax.rate_2018','tax.rate_2019','tax.rate_2020','tax.rate_2021','tax.rate_2022','tax.rate_2023','tax.rate_2024','tax.rate_2025'],
  'watchdog-derived-v6-fiscal',null,'refresh_on_demand',true
),
(
  'watchdog.municipal_cost_absorption_score',array['property','town'],'watchdog-derived','live',array['NJ DCA municipal budget and property-tax filings'],now(),
  'Governed deterministic fiscal formula; requires levy CAGR, ratable growth and collection rate.',
  'derived_governed',array['budget.total_levy_cagr','budget.ratable_growth','budget.collection_rate'],
  'watchdog-derived-v6-fiscal',null,'refresh_on_demand',true
),
(
  'watchdog.fiscal_resilience_score',array['property','town'],'watchdog-derived','live',array['NJ DCA municipal budget and property-tax filings'],now(),
  'Governed deterministic fiscal formula; requires pressure, cost absorption, collection rate and debt-service share.',
  'derived_governed',array['budget.pressure_score','watchdog.municipal_cost_absorption_score','budget.collection_rate','budget.debt_service_share'],
  'watchdog-derived-v6-fiscal',null,'refresh_on_demand',true
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
