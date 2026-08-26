-- Promote Tax Base Absorption Risk using an already-governed fiscal input and
-- an existing Watchdog normalization. No new weighting or threshold is introduced.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status,
   explanation, operation, config, updated_at)
values
  (
    'watchdog.tax_base_absorption_risk',
    'watchdog-derived-v16-chapter123-fields',
    'normalized positive gap between total levy CAGR and organic ratable growth; 5 percentage-point positive gap = 100 risk',
    array['budget.levy_base_gap']::text[],
    'high',
    'live',
    'Uses the governed budget.levy_base_gap contract and the same positive 5-point normalization already used by Watchdog fiscal derived operations. Negative or zero gaps score 0; positive gaps scale linearly to 100 at 5 percentage points and clamp thereafter.',
    'weighted_scores',
    jsonb_build_object(
      'items', jsonb_build_array(
        jsonb_build_object('dep','budget.levy_base_gap','weight',1,'transform','positive_pct5')
      ),
      'require_all', true
    ),
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
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at,
   notes, provider_kind, source_fields, calculation_key, freshness_seconds,
   cache_policy, bulk_capable)
values
  (
    'watchdog.tax_base_absorption_risk',
    array['municipality']::text[],
    'watchdog-derived',
    'live',
    array['budget.pressure_score']::text[],
    now(),
    'Deterministic derived signal over governed budget.levy_base_gap: max(0, levy CAGR - organic ratable growth) normalized linearly to 100 at a 5 percentage-point positive gap. Reuses the existing Watchdog positive_pct5 fiscal normalization; no new threshold was invented.',
    'derived_governed',
    array['budget.levy_base_gap']::text[],
    'watchdog-derived-v16-tax-base-absorption-risk',
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
