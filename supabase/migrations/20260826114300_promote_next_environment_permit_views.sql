-- Promote narrowed professional views over already-governed live risk/permit signals.
-- No synthetic source values are introduced. Each narrowing is documented explicitly.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.insurance.environmental_review_scope',
    'watchdog-derived-v16-narrowed-professional-views',
    'source_alias(watchdog.environmental_encumbrance_severity)',
    array['watchdog.environmental_encumbrance_severity']::text[],
    'high','live',
    'Insurance-facing environmental review scope reuses the governed environmental encumbrance severity exactly. The legacy environmental_site_proximity component remains undefined, so v1 is intentionally narrowed rather than assigning an arbitrary proximity model.',
    'source_alias', jsonb_build_object('dep','watchdog.environmental_encumbrance_severity'), now()
  ),
  (
    'watchdog.contractor.water_review_priority',
    'watchdog-derived-v16-narrowed-professional-views',
    'source_alias(watchdog.flood_environment_risk_score)',
    array['watchdog.flood_environment_risk_score']::text[],
    'high','live',
    'Contractor-facing water review priority reuses the governed flood/environment risk screen exactly. The broader legacy site-water and wellhead components remain undefined, so v1 is explicitly limited to the governed FEMA/tidal/wetlands evidence set.',
    'source_alias', jsonb_build_object('dep','watchdog.flood_environment_risk_score'), now()
  ),
  (
    'watchdog.contractor.permit_sequence_clarity',
    'watchdog-derived-v16-narrowed-professional-views',
    '50% permit activity score + 50% certificate closure rate',
    array['watchdog.permit_activity_score','watchdog.certificate_closure_rate']::text[],
    'medium','live',
    'Executable v1 of permit sequence clarity using the two governed permit lifecycle scores currently available. The legacy permitting_velocity input is not synthesized. Both dependencies are required and receive equal weight as coequal lifecycle activity/completion signals.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','watchdog.permit_activity_score','weight',50,'transform','identity'),
      jsonb_build_object('dep','watchdog.certificate_closure_rate','weight',50,'transform','identity')
    ),'require_all',true), now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version, formula=excluded.formula, dependencies=excluded.dependencies,
  confidence=excluded.confidence, status=excluded.status, explanation=excluded.explanation,
  operation=excluded.operation, config=excluded.config, updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.insurance.environmental_review_scope',array['property']::text[],'watchdog-derived','live',array['watchdog.environmental_encumbrance_severity']::text[],now(),'Exact narrowed professional view of governed environmental encumbrance severity; no synthetic proximity model.','derived_governed',array['watchdog.environmental_encumbrance_severity']::text[],'watchdog-derived-v16-narrowed-professional-views',21600,'refresh_on_demand',true),
  ('watchdog.contractor.water_review_priority',array['property']::text[],'watchdog-derived','live',array['watchdog.flood_environment_risk_score']::text[],now(),'Exact narrowed professional view of the governed FEMA/tidal/wetlands risk screen; broader undefined water layers are not substituted.','derived_governed',array['watchdog.flood_environment_risk_score']::text[],'watchdog-derived-v16-narrowed-professional-views',21600,'refresh_on_demand',true),
  ('watchdog.contractor.permit_sequence_clarity',array['property']::text[],'watchdog-derived','live',array['watchdog.permit_activity_score','watchdog.certificate_closure_rate']::text[],now(),'Fail-closed 50/50 composite of governed permit activity and certificate closure; no synthetic permitting velocity.','derived_governed',array['watchdog.permit_activity_score','watchdog.certificate_closure_rate']::text[],'watchdog-derived-v16-narrowed-professional-views',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;
