-- Promote the legacy watchdog.score marker to an exact alias of the canonical
-- ROBUST Watchdog Score. This removes a sparse trusted-observation dependency
-- without creating a second score model or changing score math.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status,
   explanation, operation, config)
values
  (
    'watchdog.score',
    'watchdog-derived-v15',
    'source_alias(watchdog.watchdog_score)',
    array['watchdog.watchdog_score']::text[],
    'high',
    'live',
    'Legacy Watchdog score alias. Returns the canonical ROBUST Watchdog Score without changing score math or substituting a second model.',
    'source_alias',
    jsonb_build_object('dep', 'watchdog.watchdog_score')
  )
on conflict (marker_id) do update set
  engine_version = excluded.engine_version,
  formula = excluded.formula,
  dependencies = excluded.dependencies,
  confidence = excluded.confidence,
  status = excluded.status,
  explanation = excluded.explanation,
  operation = excluded.operation,
  config = excluded.config,
  updated_at = now();

update public.data_center_provider_coverage
set provider_key = 'watchdog-derived',
    provider_kind = 'derived_governed',
    value_status = 'live',
    source_keys = array['Watchdog Score powered by the ROBUST Framework']::text[],
    source_fields = array['watchdog.watchdog_score']::text[],
    calculation_key = 'watchdog-derived-v15-source-alias',
    freshness_seconds = 21600,
    cache_policy = 'refresh_on_demand',
    bulk_capable = true,
    last_verified_at = now(),
    notes = 'Legacy Watchdog score field is an exact alias of the canonical live watchdog.watchdog_score (ROBUST-v1). No alternate score model or historical-observation fallback is used.'
where marker_id = 'watchdog.score';
