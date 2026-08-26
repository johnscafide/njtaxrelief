-- Four-category hard intelligence batch: Title/Closing, Appraisal/Comparable,
-- Advanced Appeals, and Municipal Predictive Intelligence.
-- All formulas reuse live governed inputs and fail closed where weighted inputs are required.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.title_evidence_completeness',
    'watchdog-derived-v18-four-hard-categories',
    '40% municipal search scope + 30% recording-reference completeness + 30% parcel identity confidence',
    array['watchdog.title.municipal_search_scope','watchdog.title.recording_reference_completeness','watchdog.parcel_identity_confidence']::text[],
    'medium','live',
    'Title/closing public-evidence completeness score. It measures whether the defined municipal-search, recording-reference, and parcel-identity evidence is present; it is not a title opinion, lien clearance, or insurability determination. All three governed inputs are required.',
    'weighted_scores',
    '{"require_all":true,"items":[{"dep":"watchdog.title.municipal_search_scope","weight":40,"transform":"identity"},{"dep":"watchdog.title.recording_reference_completeness","weight":30,"transform":"identity"},{"dep":"watchdog.parcel_identity_confidence","weight":30,"transform":"identity"}]}'::jsonb,
    now()
  ),
  (
    'watchdog.closing_clearance_confidence',
    'watchdog-derived-v18-four-hard-categories',
    '45% title evidence completeness + 35% inverse closing exception priority + 20% parcel identity confidence',
    array['watchdog.title_evidence_completeness','watchdog.closing_exception_priority','watchdog.parcel_identity_confidence']::text[],
    'medium','live',
    'Public-record closing-clearance confidence for triage only. Higher values mean stronger defined public evidence and fewer governed exception signals; this does not certify clear title, municipal clearance, or legal sufficiency. All inputs are required.',
    'weighted_scores',
    '{"require_all":true,"items":[{"dep":"watchdog.title_evidence_completeness","weight":45,"transform":"identity"},{"dep":"watchdog.closing_exception_priority","weight":35,"transform":"inverse_identity"},{"dep":"watchdog.parcel_identity_confidence","weight":20,"transform":"identity"}]}'::jsonb,
    now()
  ),
  (
    'watchdog.comparable_evidence_quality',
    'watchdog-derived-v18-four-hard-categories',
    '70% governed comparable-evidence reliability + 30% appraisal public-record completeness',
    array['watchdog.comparable_evidence_reliability','watchdog.appraisal_record_completeness']::text[],
    'medium','live',
    'Public comparable-evidence quality v1. It combines the governed SR-1A comparable reliability model with subject appraisal-record completeness. Parcel-specific proximity/similarity selection is not inferred here and remains a future cohort enhancement. Both governed inputs are required.',
    'weighted_scores',
    '{"require_all":true,"items":[{"dep":"watchdog.comparable_evidence_reliability","weight":70,"transform":"identity"},{"dep":"watchdog.appraisal_record_completeness","weight":30,"transform":"identity"}]}'::jsonb,
    now()
  ),
  (
    'watchdog.tax_appeal_evidence_strength',
    'watchdog-derived-v18-four-hard-categories',
    'source_alias(watchdog.appeal_evidence_strength)',
    array['watchdog.appeal_evidence_strength']::text[],
    'high','live',
    'Canonical proprietary appeal-evidence marker reuses the existing governed Appeal Evidence Strength model exactly. That upstream model already incorporates independent value anchor, Chapter 123 margin, comparable depth, uniformity, county outcome context, and record completeness. No new legal or success-probability inference is introduced.',
    'source_alias',
    '{"dep":"watchdog.appeal_evidence_strength"}'::jsonb,
    now()
  ),
  (
    'watchdog.revenue_base_resilience',
    'watchdog-derived-v18-four-hard-categories',
    '40% ratable growth quality + 35% collection resilience + 25% inverse exemption pressure',
    array['watchdog.municipal.ratable_growth_quality','watchdog.municipal.collection_resilience_context','watchdog.municipal.exemption_pressure_watch']::text[],
    'medium','live',
    'Municipal revenue-base resilience screening score using governed growth quality, collection resilience, and inverse exemption/PILOT/abatement pressure. It is not a revenue forecast, credit rating, or concentration model. All three inputs are required.',
    'weighted_scores',
    '{"require_all":true,"items":[{"dep":"watchdog.municipal.ratable_growth_quality","weight":40,"transform":"identity"},{"dep":"watchdog.municipal.collection_resilience_context","weight":35,"transform":"identity"},{"dep":"watchdog.municipal.exemption_pressure_watch","weight":25,"transform":"inverse_identity"}]}'::jsonb,
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

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.title_evidence_completeness',array['property']::text[],'watchdog-derived','live',array['NJOGIS Parcels / MOD-IV Composite','NJ DCA zoning directory','Watchdog governed title evidence helpers']::text[],now(),'Public title/closing evidence completeness only; not a title opinion or clearance.','derived_governed',array['watchdog.title.municipal_search_scope','watchdog.title.recording_reference_completeness','watchdog.parcel_identity_confidence']::text[],'watchdog-derived-v18-four-hard-categories',21600,'refresh_on_demand',true),
  ('watchdog.closing_clearance_confidence',array['property']::text[],'watchdog-derived','live',array['Watchdog governed title evidence helpers','Watchdog governed closing exception priority']::text[],now(),'Public-record closing triage confidence; not legal/title clearance.','derived_governed',array['watchdog.title_evidence_completeness','watchdog.closing_exception_priority','watchdog.parcel_identity_confidence']::text[],'watchdog-derived-v18-four-hard-categories',21600,'refresh_on_demand',true),
  ('watchdog.comparable_evidence_quality',array['property','town']::text[],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified sales','NJOGIS Parcels / MOD-IV Composite']::text[],now(),'Public comparable-evidence quality v1; parcel-specific proximity/similarity remains cohort-gated.','derived_governed',array['watchdog.comparable_evidence_reliability','watchdog.appraisal_record_completeness']::text[],'watchdog-derived-v18-four-hard-categories',21600,'refresh_on_demand',true),
  ('watchdog.tax_appeal_evidence_strength',array['property','town','county']::text[],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation Chapter 123','NJ Division of Taxation assessment uniformity','NJ property-tax appeal outcomes']::text[],now(),'Canonical alias of the governed Appeal Evidence Strength model; not legal advice or appeal-success prediction.','derived_governed',array['watchdog.appeal_evidence_strength']::text[],'watchdog-derived-v18-four-hard-categories',21600,'refresh_on_demand',true),
  ('watchdog.revenue_base_resilience',array['municipality','town']::text[],'watchdog-derived','live',array['NJ DCA municipal budget and tax levy filings','NJ exemption/PILOT/abatement governed sources']::text[],now(),'Municipal revenue-base resilience screening context; not a revenue forecast or credit opinion.','derived_governed',array['watchdog.municipal.ratable_growth_quality','watchdog.municipal.collection_resilience_context','watchdog.municipal.exemption_pressure_watch']::text[],'watchdog-derived-v18-four-hard-categories',21600,'refresh_on_demand',true)
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
