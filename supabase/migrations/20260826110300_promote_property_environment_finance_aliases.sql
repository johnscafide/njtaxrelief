-- Promote exact professional aliases over already-governed live signals.
-- These introduce no new weights, thresholds, or synthesized source values.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.contractor.jurisdiction_overlap_watch',
    'watchdog-derived-v16-safe-aliases',
    'source_alias(watchdog.regulatory_constraint_density)',
    array['watchdog.regulatory_constraint_density']::text[],
    'high', 'live',
    'Contractor-facing jurisdiction-overlap watch reuses the governed regulatory constraint density exactly. The legacy upstream regulatory_overlap_score remains undefined, so this marker is explicitly narrowed to density of currently governed statewide regulatory-screen layers rather than inventing weights.',
    'source_alias', jsonb_build_object('dep','watchdog.regulatory_constraint_density'), now()
  ),
  (
    'watchdog.investor.asset_constraint_screen',
    'watchdog-derived-v16-safe-aliases',
    'source_alias(watchdog.regulatory_constraint_density)',
    array['watchdog.regulatory_constraint_density']::text[],
    'high', 'live',
    'Investor-facing asset constraint screen reuses governed regulatory constraint density exactly. The broader legacy weighted formula depended on an undefined environmental_site_proximity model; no substitute value or arbitrary weight is introduced.',
    'source_alias', jsonb_build_object('dep','watchdog.regulatory_constraint_density'), now()
  ),
  (
    'watchdog.municipal.levy_alignment_score',
    'watchdog-derived-v16-safe-aliases',
    '100 - normalized_positive(abs(levy/base growth gap)); uses governed tax-base absorption risk inverse',
    array['watchdog.tax_base_absorption_risk']::text[],
    'high', 'live',
    'Municipal levy alignment is the exact inverse of the governed Tax Base Absorption Risk normalization: 100 means no positive levy/base growth gap and 0 means a gap at or above the existing 5 percentage-point full-risk threshold.',
    'inverse', jsonb_build_object('dep','watchdog.tax_base_absorption_risk'), now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version, formula=excluded.formula, dependencies=excluded.dependencies,
  confidence=excluded.confidence, status=excluded.status, explanation=excluded.explanation,
  operation=excluded.operation, config=excluded.config, updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.contractor.jurisdiction_overlap_watch', array['property']::text[], 'watchdog-derived', 'live', array['watchdog.regulatory_constraint_density']::text[], now(), 'Exact professional alias of governed regulatory constraint density; no new weighting.', 'derived_governed', array['watchdog.regulatory_constraint_density']::text[], 'watchdog-derived-v16-safe-aliases', 21600, 'refresh_on_demand', true),
  ('watchdog.investor.asset_constraint_screen', array['property']::text[], 'watchdog-derived', 'live', array['watchdog.regulatory_constraint_density']::text[], now(), 'Narrowed to exact governed regulatory constraint density because the broader legacy environmental proximity component lacks an executable definition.', 'derived_governed', array['watchdog.regulatory_constraint_density']::text[], 'watchdog-derived-v16-safe-aliases', 21600, 'refresh_on_demand', true),
  ('watchdog.municipal.levy_alignment_score', array['municipality']::text[], 'watchdog-derived', 'live', array['watchdog.tax_base_absorption_risk']::text[], now(), 'Exact inverse of governed Tax Base Absorption Risk using the existing levy/base gap normalization.', 'derived_governed', array['watchdog.tax_base_absorption_risk']::text[], 'watchdog-derived-v16-safe-aliases', 21600, 'refresh_on_demand', true)
on conflict (marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;
