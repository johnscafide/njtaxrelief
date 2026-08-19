insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values (
  'watchdog.njplus.housing_supply_delivery_ratio',
  'watchdog-derived-v13-ratio-floor',
  'certificates_of_occupancy / max(housing_units_authorized, 1)',
  array['njplus.nj-dca-development-trends.certificate_of_occupancy_count','njplus.nj-dca-development-trends.housing_units_authorized']::text[],
  'high',
  'live',
  'Municipal NJ DCA development-delivery ratio using the published formula exactly. The denominator is floored at 1 only because the governed catalog explicitly defines max(housing_units_authorized, 1); missing source dependencies remain missing.',
  'ratio',
  '{"num":"njplus.nj-dca-development-trends.certificate_of_occupancy_count","den":"njplus.nj-dca-development-trends.housing_units_authorized","den_min":1,"scale":1,"precision":3}'::jsonb,
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
values (
  'watchdog.njplus.housing_supply_delivery_ratio',
  array[]::text[],
  'watchdog-derived',
  'live',
  array['nj-dca-development-trends']::text[],
  now(),
  'Exact ratio of NJ DCA certificate-of-occupancy count to max(housing units authorized, 1). Registered non-bulk until a production bulk certification is observed.',
  'derived_governed',
  array['njplus.nj-dca-development-trends.certificate_of_occupancy_count','njplus.nj-dca-development-trends.housing_units_authorized']::text[],
  'watchdog-derived-v13-ratio-floor',
  1800,
  'refresh_on_demand',
  false
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