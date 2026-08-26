-- Promote insurance-facing context views as exact aliases of already-governed helper families.
-- No new weighting, threshold, or source substitution is introduced.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.insurance.historic_constraint_context',
    'watchdog-derived-v16-insurance-context-aliases',
    'source_alias(watchdog.internal.landuse_historic_group_v1)',
    array['watchdog.internal.landuse_historic_group_v1']::text[],
    'medium','live',
    'Insurance-facing historic-resource context reuses the governed historic-resource family exactly. It reflects mapped public-resource context only and is not an insurance eligibility or property-condition determination.',
    'source_alias', jsonb_build_object('dep','watchdog.internal.landuse_historic_group_v1'), now()
  ),
  (
    'watchdog.insurance.water_protection_context',
    'watchdog-derived-v16-insurance-context-aliases',
    'source_alias(watchdog.internal.insurance_water_group_v1)',
    array['watchdog.internal.insurance_water_group_v1']::text[],
    'medium','live',
    'Insurance-facing water context reuses the governed water-context family exactly: Category 1 water proximity, flood-profile proximity, flood-plan locator, and surface/spring context. No extra water-protection semantics are inferred.',
    'source_alias', jsonb_build_object('dep','watchdog.internal.insurance_water_group_v1'), now()
  ),
  (
    'watchdog.insurance.geology_hazard_context',
    'watchdog-derived-v16-insurance-context-aliases',
    'source_alias(watchdog.internal.preconstruction_geology_group_v1)',
    array['watchdog.internal.preconstruction_geology_group_v1']::text[],
    'medium','live',
    'Insurance-facing geology context reuses the governed geology-screen family exactly: historic fill, acid-producing soil, bedrock outcrop, fault, landslide, abandoned mine, and quarry context. It is a mapped screening aid, not a hazard determination.',
    'source_alias', jsonb_build_object('dep','watchdog.internal.preconstruction_geology_group_v1'), now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version, formula=excluded.formula, dependencies=excluded.dependencies,
  confidence=excluded.confidence, status=excluded.status, explanation=excluded.explanation,
  operation=excluded.operation, config=excluded.config, updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.insurance.historic_constraint_context',array['property']::text[],'watchdog-derived','live',array['NJDEP/NJ historic-resource mapping']::text[],now(),'Exact alias of governed historic-resource family; no additional interpretation.','derived_governed',array['watchdog.internal.landuse_historic_group_v1']::text[],'watchdog-derived-v16-insurance-context-aliases',21600,'refresh_on_demand',true),
  ('watchdog.insurance.water_protection_context',array['property']::text[],'watchdog-derived','live',array['NJDEP water/flood mapping']::text[],now(),'Exact alias of governed water-context family; no additional water-protection assumptions.','derived_governed',array['watchdog.internal.insurance_water_group_v1']::text[],'watchdog-derived-v16-insurance-context-aliases',21600,'refresh_on_demand',true),
  ('watchdog.insurance.geology_hazard_context',array['property']::text[],'watchdog-derived','live',array['NJGS/NJDEP geology mapping']::text[],now(),'Exact alias of governed geology-screen family; no hazard or insurance conclusion.','derived_governed',array['watchdog.internal.preconstruction_geology_group_v1']::text[],'watchdog-derived-v16-insurance-context-aliases',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;
