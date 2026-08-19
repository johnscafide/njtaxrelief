alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any (array[
      'year_delta'::text,
      'ratio'::text,
      'completeness'::text,
      'inverse'::text,
      'permit_closure'::text,
      'permit_activity'::text,
      'weighted_signals'::text,
      'signal_count'::text,
      'signal_density'::text,
      'weighted_scores'::text,
      'tax_rate_position'::text,
      'municipal_cost_absorption'::text,
      'fiscal_resilience'::text,
      'revaluation_pressure'::text,
      'transaction_tax_shock'::text,
      'investor_carry_volatility'::text,
      'tax_reset_sensitivity'::text
    ])
  );

insert into public.derived_formula_registry
(marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
(
 'watchdog.listing_friction_index',
 'watchdog-derived-v8-reset-conversation',
 '23% municipal budget pressure + 23% revaluation pressure + 18% COD-based assessment unevenness + 18% positive tax-rate trend risk + 18% county decided-appeal reduction rate',
 array['budget.pressure_score','watchdog.revaluation_risk','uniformity.coefficient','watchdog.tax_trend_position','appeals.latest_win_rate_decided'],
 'high','live',
 'Transparent broker-intelligence score preserving the shipped Watchdog 23/23/18/18/18 weighting. All five governed inputs are required; missing evidence returns dependency_missing.',
 'weighted_scores',
 '{"require_all":true,"items":[{"dep":"budget.pressure_score","weight":0.23,"transform":"identity"},{"dep":"watchdog.revaluation_risk","weight":0.23,"transform":"identity"},{"dep":"uniformity.coefficient","weight":0.18,"transform":"cod_risk"},{"dep":"watchdog.tax_trend_position","weight":0.18,"transform":"inverse_identity"},{"dep":"appeals.latest_win_rate_decided","weight":0.18,"transform":"identity"}]}'::jsonb,
 now()
),
(
 'watchdog.revaluation_conversation_risk',
 'watchdog-derived-v8-reset-conversation',
 '70% revaluation pressure + 30% COD-based assessment unevenness',
 array['watchdog.revaluation_risk','uniformity.coefficient'],
 'high','live',
 'How strongly the current sourced revaluation and assessment-uniformity evidence warrants a client conversation. Both governed inputs are required.',
 'weighted_scores',
 '{"require_all":true,"items":[{"dep":"watchdog.revaluation_risk","weight":0.70,"transform":"identity"},{"dep":"uniformity.coefficient","weight":0.30,"transform":"cod_risk"}]}'::jsonb,
 now()
),
(
 'watchdog.assessment_surprise_index',
 'watchdog-derived-v8-reset-conversation',
 '40% revaluation pressure + 30% county decided-appeal reduction rate + 15% positive tax-rate trend risk + 15% municipal budget pressure',
 array['watchdog.revaluation_risk','appeals.latest_win_rate_decided','watchdog.tax_trend_position','budget.pressure_score'],
 'high','live',
 'Transaction-facing assessment surprise screen built only from governed revaluation, appeal-outcome, tax-trend and budget inputs. All four inputs are required.',
 'weighted_scores',
 '{"require_all":true,"items":[{"dep":"watchdog.revaluation_risk","weight":0.40,"transform":"identity"},{"dep":"appeals.latest_win_rate_decided","weight":0.30,"transform":"identity"},{"dep":"watchdog.tax_trend_position","weight":0.15,"transform":"inverse_identity"},{"dep":"budget.pressure_score","weight":0.15,"transform":"identity"}]}'::jsonb,
 now()
),
(
 'watchdog.buyer_tax_reset_exposure',
 'watchdog-derived-v8-reset-conversation',
 '100% Watchdog Transaction Tax Shock Index',
 array['watchdog.transaction_tax_shock_index'],
 'high','live',
 'Buyer-facing presentation of the same governed transaction tax-shock evidence. No separate opaque score is introduced.',
 'weighted_scores',
 '{"require_all":true,"items":[{"dep":"watchdog.transaction_tax_shock_index","weight":1.0,"transform":"identity"}]}'::jsonb,
 now()
),
(
 'watchdog.collateral_tax_reset_sensitivity',
 'watchdog-derived-v8-reset-conversation',
 'transaction_tax_shock_index × normalized absolute gap between the subject assessment-to-sale ratio and the official 2026 Chapter 123 municipal common ratio',
 array['watchdog.transaction_tax_shock_index','watchdog.assessment_to_sale_ratio','property.pams_pin'],
 'high','live',
 'Property-specific collateral sensitivity. The ratio-gap component reaches 100 at a 20 percentage-point absolute difference from the official municipal common ratio. Missing sale, assessment or Chapter 123 evidence returns dependency_missing.',
 'tax_reset_sensitivity',
 '{"base_dep":"watchdog.transaction_tax_shock_index","ratio_dep":"watchdog.assessment_to_sale_ratio","gap_full_scale":0.20,"chapter123_source":"nj-chapter123-2026","chapter123_provider":"chapter123-provider-v3"}'::jsonb,
 now()
),
(
 'watchdog.revaluation_reset_exposure',
 'watchdog-derived-v8-reset-conversation',
 'revaluation_risk × normalized absolute gap between the subject assessment-to-sale ratio and the official 2026 Chapter 123 municipal common ratio',
 array['watchdog.revaluation_risk','watchdog.assessment_to_sale_ratio','property.pams_pin'],
 'high','live',
 'Property-specific revaluation reset exposure. The ratio-gap component reaches 100 at a 20 percentage-point absolute difference from the official municipal common ratio. Missing sale, assessment or Chapter 123 evidence returns dependency_missing.',
 'tax_reset_sensitivity',
 '{"base_dep":"watchdog.revaluation_risk","ratio_dep":"watchdog.assessment_to_sale_ratio","gap_full_scale":0.20,"chapter123_source":"nj-chapter123-2026","chapter123_provider":"chapter123-provider-v3"}'::jsonb,
 now()
)
on conflict (marker_id) do update set
 engine_version=excluded.engine_version,
 formula=excluded.formula,
 dependencies=excluded.dependencies,
 confidence=excluded.confidence,
 status=excluded.status,
 explanation=excluded.explanation,
 operation=excluded.operation,
 config=excluded.config,
 updated_at=excluded.updated_at;

insert into public.data_center_provider_coverage
(marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
(
 'watchdog.listing_friction_index', array['property'], 'watchdog-derived', 'live',
 array['NJ DCA municipal budget and ratable data','NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation coefficients of deviation','NJ Division of Taxation general tax rates','NJ Division of Taxation property-tax appeal outcomes'],
 now(), 'Governed 23/23/18/18/18 broker-intelligence formula. All required inputs must resolve; missing evidence returns dependency_missing.',
 'derived_governed', array['budget.pressure_score','watchdog.revaluation_risk','uniformity.coefficient','watchdog.tax_trend_position','appeals.latest_win_rate_decided'],
 'watchdog-derived-v8-reset-conversation', 21600, 'refresh_on_demand', true
),
(
 'watchdog.revaluation_conversation_risk', array['property'], 'watchdog-derived', 'live',
 array['NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation coefficients of deviation'],
 now(), 'Governed revaluation conversation screen. Both revaluation pressure and COD-based unevenness are required.',
 'derived_governed', array['watchdog.revaluation_risk','uniformity.coefficient'],
 'watchdog-derived-v8-reset-conversation', 21600, 'refresh_on_demand', true
),
(
 'watchdog.assessment_surprise_index', array['property'], 'watchdog-derived', 'live',
 array['NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation property-tax appeal outcomes','NJ Division of Taxation general tax rates','NJ DCA municipal budget and ratable data'],
 now(), 'Governed assessment-surprise screen. Revaluation, appeal, tax-trend and budget inputs are all required.',
 'derived_governed', array['watchdog.revaluation_risk','appeals.latest_win_rate_decided','watchdog.tax_trend_position','budget.pressure_score'],
 'watchdog-derived-v8-reset-conversation', 21600, 'refresh_on_demand', true
),
(
 'watchdog.buyer_tax_reset_exposure', array['property'], 'watchdog-derived', 'live',
 array['NJ Division of Taxation 2026 Chapter 123','NJ SR1A verified sales','NJ Division of Taxation general tax rates','NJ DCA municipal budget and ratable data'],
 now(), 'Buyer-facing governed alias of Transaction Tax Shock Index. No duplicate opaque model is introduced.',
 'derived_governed', array['watchdog.transaction_tax_shock_index'],
 'watchdog-derived-v8-reset-conversation', 21600, 'refresh_on_demand', true
),
(
 'watchdog.collateral_tax_reset_sensitivity', array['property'], 'watchdog-derived', 'live',
 array['NJ Division of Taxation 2026 Chapter 123','NJ MOD-IV parcel assessment and sale records','NJ SR1A verified sales','NJ Division of Taxation general tax rates','NJ DCA municipal budget and ratable data'],
 now(), 'Governed property-specific tax-reset sensitivity. Requires transaction shock, a subject assessment-to-sale ratio, and the official municipal Chapter 123 ratio.',
 'derived_governed', array['watchdog.transaction_tax_shock_index','watchdog.assessment_to_sale_ratio','property.pams_pin'],
 'watchdog-derived-v8-reset-conversation', 21600, 'refresh_on_demand', true
),
(
 'watchdog.revaluation_reset_exposure', array['property'], 'watchdog-derived', 'live',
 array['NJ Division of Taxation 2026 Chapter 123','NJ MOD-IV parcel assessment and sale records','NJ SR1A verified sales','NJ Division of Taxation coefficients of deviation'],
 now(), 'Governed property-specific revaluation reset exposure. Requires revaluation pressure, a subject assessment-to-sale ratio, and the official municipal Chapter 123 ratio.',
 'derived_governed', array['watchdog.revaluation_risk','watchdog.assessment_to_sale_ratio','property.pams_pin'],
 'watchdog-derived-v8-reset-conversation', 21600, 'refresh_on_demand', true
)
on conflict (marker_id) do update set
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
