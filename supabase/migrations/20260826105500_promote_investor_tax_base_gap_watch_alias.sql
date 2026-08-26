insert into public.derived_formula_registry (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values (
  'watchdog.investor.tax_base_gap_watch',
  'watchdog-derived-v16-tax-base-gap-watch',
  'source_alias(watchdog.tax_base_absorption_risk)',
  array['watchdog.tax_base_absorption_risk']::text[],
  'high',
  'live',
  'Professional semantic alias of the governed Tax Base Absorption Risk. No additional transformation, weighting, or threshold is applied.',
  'source_alias',
  jsonb_build_object('dep','watchdog.tax_base_absorption_risk'),
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
  updated_at=now();

insert into public.data_center_provider_coverage (marker_id, provider_key, provider_kind, value_status, source_keys, source_fields, calculation_key, notes, cache_policy, bulk_capable, freshness_seconds, last_verified_at)
values (
  'watchdog.investor.tax_base_gap_watch',
  'watchdog-derived',
  'derived_governed',
  'live',
  array['watchdog.tax_base_absorption_risk']::text[],
  array[]::text[],
  'watchdog-derived-v16-tax-base-gap-watch',
  'Investor-facing semantic alias of live Watchdog Tax Base Absorption Risk; preserves the exact upstream score.',
  'refresh_on_demand',
  true,
  21600,
  now()
)
on conflict (marker_id) do update set
  provider_key=excluded.provider_key,
  provider_kind=excluded.provider_kind,
  value_status=excluded.value_status,
  source_keys=excluded.source_keys,
  source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,
  notes=excluded.notes,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable,
  freshness_seconds=excluded.freshness_seconds,
  last_verified_at=now();
