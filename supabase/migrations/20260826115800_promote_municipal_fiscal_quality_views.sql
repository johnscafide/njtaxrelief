-- Promote municipal fiscal-quality views using only existing governed inputs and runtime transforms.
-- No new source facts are synthesized. All composites fail closed when a required dependency is missing.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.municipal.collection_resilience_context',
    'watchdog-derived-v16-municipal-quality',
    '50% normalized collection performance + 50% fiscal resilience score',
    array['budget.collection_rate','watchdog.fiscal_resilience_score']::text[],
    'high','live',
    'Municipal collection resilience combines the existing Watchdog 90%-100% collection-rate normalization with the governed Fiscal Resilience Score. Both inputs are required; missing evidence returns dependency_missing.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','budget.collection_rate','weight',50,'transform','collection90_100'),
      jsonb_build_object('dep','watchdog.fiscal_resilience_score','weight',50,'transform','identity')
    ),'require_all',true),
    now()
  ),
  (
    'watchdog.municipal.ratable_growth_quality',
    'watchdog-derived-v16-municipal-quality',
    '50% positive ratable-growth score + 50% inverse tax-base absorption risk',
    array['budget.ratable_growth','watchdog.tax_base_absorption_risk']::text[],
    'high','live',
    'Ratable Growth Quality uses the existing positive 5-percentage-point growth normalization and the exact inverse of governed Tax Base Absorption Risk. Both inputs are required and no alternate growth threshold is introduced.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','budget.ratable_growth','weight',50,'transform','positive_pct5'),
      jsonb_build_object('dep','watchdog.tax_base_absorption_risk','weight',50,'transform','inverse_identity')
    ),'require_all',true),
    now()
  ),
  (
    'watchdog.municipal.exemption_pressure_watch',
    'watchdog-derived-v16-municipal-quality',
    'equal-weight normalized exempt share + PILOT value share + abated share',
    array['exemption.exempt_share','exemption.pilot_value_share','abatement.abated_share']::text[],
    'high','live',
    'Exemption Pressure Watch averages three co-unit published tax-base shares after applying the existing Watchdog 35% share normalization. All three governed shares are required; the score is a screening context, not a fiscal conclusion.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','exemption.exempt_share','weight',1,'transform','share35'),
      jsonb_build_object('dep','exemption.pilot_value_share','weight',1,'transform','share35'),
      jsonb_build_object('dep','abatement.abated_share','weight',1,'transform','share35')
    ),'require_all',true),
    now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version, formula=excluded.formula, dependencies=excluded.dependencies,
  confidence=excluded.confidence, status=excluded.status, explanation=excluded.explanation,
  operation=excluded.operation, config=excluded.config, updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.municipal.collection_resilience_context',array['municipality']::text[],'watchdog-derived','live',array['NJ DCA municipal budget data']::text[],now(),'Fail-closed 50/50 composite using the existing collection-rate normalization and governed Fiscal Resilience Score.','derived_governed',array['budget.collection_rate','watchdog.fiscal_resilience_score']::text[],'watchdog-derived-v16-municipal-quality',21600,'refresh_on_demand',true),
  ('watchdog.municipal.ratable_growth_quality',array['municipality']::text[],'watchdog-derived','live',array['NJ DCA municipal budget and ratable data']::text[],now(),'Fail-closed 50/50 composite using existing positive_pct5 ratable-growth normalization and inverse governed Tax Base Absorption Risk.','derived_governed',array['budget.ratable_growth','watchdog.tax_base_absorption_risk']::text[],'watchdog-derived-v16-municipal-quality',21600,'refresh_on_demand',true),
  ('watchdog.municipal.exemption_pressure_watch',array['municipality']::text[],'watchdog-derived','live',array['NJ Division of Taxation Abstract of Ratables','NJ DCA PILOT data']::text[],now(),'Equal-weight tax-base share screen using the existing 35% share normalization; all three source shares are required.','derived_governed',array['exemption.exempt_share','exemption.pilot_value_share','abatement.abated_share']::text[],'watchdog-derived-v16-municipal-quality',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;
