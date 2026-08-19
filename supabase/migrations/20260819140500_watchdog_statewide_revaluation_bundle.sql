-- Watchdog statewide Chapter 123 / revaluation bundle.
-- Runtime prerequisite: chapter123-provider-v3 and workbench-derived-v7-revaluation.
-- Missing verified-sale or fiscal inputs fail closed as dependency_missing.

alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any (array[
      'year_delta','ratio','completeness','inverse','permit_closure','permit_activity',
      'weighted_signals','signal_count','signal_density','weighted_scores',
      'tax_rate_position','municipal_cost_absorption','fiscal_resilience',
      'revaluation_pressure','transaction_tax_shock','investor_carry_volatility'
    ]::text[])
  );

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
values
(
  'watchdog.revaluation_risk','watchdog-derived-v7-revaluation',
  'Available-input normalized: 45% low published Chapter 123 ratio + 25% positive published-to-verified-sale ratio drift + 30% residential COD pressure when COD is available; published ratios >=98% cap the score at 8',
  array['property.pams_pin','sales.ratio','uniformity.coefficient'],
  'high','live',
  'Revaluation/reset-pressure screening score using the official 2026 Chapter 123 common-level ratio and Watchdog verified-sale assessment ratio. Residential COD is optional and the remaining weights are renormalized when COD is unavailable. A verified-sale ratio is required; missing sales evidence returns dependency_missing. This is not a revaluation order or schedule.',
  'revaluation_pressure',
  '{"verified_ratio_dep":"sales.ratio","uniformity_dep":"uniformity.coefficient","chapter123_source":"nj-chapter123-2026","chapter123_provider":"chapter123-provider-v3"}'::jsonb
),
(
  'watchdog.transaction_tax_shock_index','watchdog-derived-v7-revaluation',
  '35% revaluation pressure + 25% municipal budget pressure + 25% positive general-tax-rate trend + 15% positive levy/ratable growth gap',
  array['watchdog.revaluation_risk','budget.pressure_score','watchdog.tax_trend_position','budget.total_levy_cagr','budget.ratable_growth'],
  'high','live',
  'Transaction tax-shock screening score. Tax-rate risk is the inverse of Watchdog Tax Trend Position; levy/base pressure is normalized against a 5% annual gap reference. All governed inputs are required and incomplete evidence returns dependency_missing.',
  'transaction_tax_shock',
  '{"reval_dep":"watchdog.revaluation_risk","pressure_dep":"budget.pressure_score","tax_stability_dep":"watchdog.tax_trend_position","levy_dep":"budget.total_levy_cagr","ratable_dep":"budget.ratable_growth"}'::jsonb
),
(
  'watchdog.investor_carry_cost_volatility','watchdog-derived-v7-revaluation',
  '32% municipal budget pressure + 24% positive levy/ratable growth gap + 22% revaluation pressure + 14% positive tax-rate trend + 8% exempt/PILOT exposure',
  array['budget.pressure_score','budget.total_levy_cagr','budget.ratable_growth','watchdog.revaluation_risk','watchdog.tax_trend_position','exemption.exempt_share'],
  'high','live',
  'Tax-driven carry-cost uncertainty score using the established Watchdog investor model. The exempt footprint is normalized against a 35% reference. All governed inputs are required and incomplete evidence returns dependency_missing; this is not an investment recommendation or a tax forecast.',
  'investor_carry_volatility',
  '{"pressure_dep":"budget.pressure_score","levy_dep":"budget.total_levy_cagr","ratable_dep":"budget.ratable_growth","reval_dep":"watchdog.revaluation_risk","tax_stability_dep":"watchdog.tax_trend_position","exempt_share_dep":"exemption.exempt_share"}'::jsonb
)
on conflict(marker_id) do update set
  engine_version=excluded.engine_version,
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
  'watchdog.revaluation_risk',array['property','town'],'watchdog-derived','live',
  array['NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation coefficients of deviation'],now(),
  'Deterministic revaluation/reset-pressure screen. Statewide Chapter 123 source is validated at 564 municipalities; verified-sale ratio remains required per municipality and missing evidence returns dependency_missing.',
  'derived_governed',array['property.pams_pin','sales.ratio','uniformity.coefficient'],'watchdog-derived-v7-revaluation',21600,'refresh_on_demand',true
),
(
  'watchdog.transaction_tax_shock_index',array['property','town'],'watchdog-derived','live',
  array['NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation general tax rates','NJ DCA municipal budget and ratable data'],now(),
  'Governed transaction tax-shock screen; all formula inputs are required and missing evidence returns dependency_missing.',
  'derived_governed',array['watchdog.revaluation_risk','budget.pressure_score','watchdog.tax_trend_position','budget.total_levy_cagr','budget.ratable_growth'],'watchdog-derived-v7-revaluation',21600,'refresh_on_demand',true
),
(
  'watchdog.investor_carry_cost_volatility',array['property','town'],'watchdog-derived','live',
  array['NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation general tax rates','NJ DCA municipal budget and ratable data','NJ Division of Taxation Abstract of Ratables','NJ DCA PILOT data'],now(),
  'Governed tax-driven carry-cost uncertainty screen; all formula inputs are required and missing evidence returns dependency_missing.',
  'derived_governed',array['budget.pressure_score','budget.total_levy_cagr','budget.ratable_growth','watchdog.revaluation_risk','watchdog.tax_trend_position','exemption.exempt_share'],'watchdog-derived-v7-revaluation',21600,'refresh_on_demand',true
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
