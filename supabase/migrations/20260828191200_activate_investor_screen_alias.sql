-- Promote the legacy Investor Screen marker as a governed compatibility alias.
-- Canonical executable score remains watchdog.investor.investment_diligence_priority.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.investor_screen',
    'watchdog-derived-v21-investor-screen-alias',
    'source_alias(watchdog.investor.investment_diligence_priority)',
    array['watchdog.investor.investment_diligence_priority']::text[],
    'high',
    'live',
    'Compatibility investor-screen marker that delegates to the governed Investment Diligence Priority score. Higher values mean greater public-record diligence priority; this is not investment advice, a return forecast, valuation, underwriting decision, or transaction recommendation.',
    'source_alias',
    jsonb_build_object('dep','watchdog.investor.investment_diligence_priority'),
    now()
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

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'watchdog.investor_screen',
    array['property']::text[],
    'watchdog-derived',
    'live',
    array['watchdog.investor.investment_diligence_priority']::text[],
    now(),
    'Legacy Investor Screen is a compatibility alias to the governed Investment Diligence Priority score: 40% carry-cost volatility + 30% asset constraint screen + 30% revaluation hold sensitivity, with all components required. Higher means more public-record diligence priority, not a better or worse investment.',
    'derived_governed',
    array['watchdog.investor.investment_diligence_priority']::text[],
    'watchdog-derived-v21-investor-screen-alias',
    21600,
    'refresh_on_demand',
    true
  )
on conflict (marker_id) do update set
  scopes = excluded.scopes,
  provider_key = excluded.provider_key,
  value_status = excluded.value_status,
  source_keys = excluded.source_keys,
  last_verified_at = excluded.last_verified_at,
  notes = excluded.notes,
  provider_kind = excluded.provider_kind,
  source_fields = excluded.source_fields,
  calculation_key = excluded.calculation_key,
  freshness_seconds = excluded.freshness_seconds,
  cache_policy = excluded.cache_policy,
  bulk_capable = excluded.bulk_capable;
