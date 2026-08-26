-- Promote low-risk evidence/confidence composites whose inputs are already governed live.
-- Each legacy formula declared weighted(...) but no weights. For these evidence-quality
-- markers, the v1 contract uses an explicit neutral 50/50 average because both inputs are
-- coequal 0-100 evidence/completeness scores. Missing either dependency fails closed.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.agent.listing_public_record_readiness',
    'watchdog-derived-v17-evidence-confidence',
    '50% property_story_confidence + 50% transaction_diligence_completion',
    array['watchdog.property_story_confidence','watchdog.transaction_diligence_completion']::text[],
    'high','live',
    'Listing public-record readiness averages two coequal governed 0-100 evidence signals: confidence in the public property story and completion of the governed transaction diligence set. This is a readiness/evidence score, not a transaction outcome.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','watchdog.property_story_confidence','weight',50,'transform','identity'),jsonb_build_object('dep','watchdog.transaction_diligence_completion','weight',50,'transform','identity')),'require_all',true),
    now()
  ),
  (
    'watchdog.attorney.municipal_record_reliance',
    'watchdog-derived-v17-evidence-confidence',
    '50% source_authority_coverage + 50% parcel_identity_confidence',
    array['watchdog.source_authority_coverage','watchdog.parcel_identity_confidence']::text[],
    'high','live',
    'Municipal record reliance averages authoritative-source coverage and parcel-identity confidence, two coequal governed 0-100 evidence-quality inputs. It supports first-pass record reliance and is not a legal conclusion.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','watchdog.source_authority_coverage','weight',50,'transform','identity'),jsonb_build_object('dep','watchdog.parcel_identity_confidence','weight',50,'transform','identity')),'require_all',true),
    now()
  ),
  (
    'watchdog.contractor.project_screening_confidence',
    'watchdog-derived-v17-evidence-confidence',
    '50% site_preflight_completeness + 50% source_authority_coverage',
    array['watchdog.contractor.site_preflight_completeness','watchdog.source_authority_coverage']::text[],
    'high','live',
    'Project screening confidence averages completeness of the governed site-preflight set and authoritative-source coverage. Both are evidence-quality measures on the same 0-100 scale; this is not a development feasibility conclusion.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','watchdog.contractor.site_preflight_completeness','weight',50,'transform','identity'),jsonb_build_object('dep','watchdog.source_authority_coverage','weight',50,'transform','identity')),'require_all',true),
    now()
  ),
  (
    'watchdog.appraiser.assessment_evidence_alignment',
    'watchdog-derived-v17-evidence-confidence',
    '50% assessment_defensibility_score + 50% comparable_evidence_reliability',
    array['watchdog.assessment_defensibility_score','watchdog.comparable_evidence_reliability']::text[],
    'high','live',
    'Assessment evidence alignment averages two coequal governed evidence scores: assessment defensibility and comparable-evidence reliability. It describes public-record evidence alignment and is not an appraisal or value conclusion.',
    'weighted_scores',
    jsonb_build_object('items',jsonb_build_array(jsonb_build_object('dep','watchdog.assessment_defensibility_score','weight',50,'transform','identity'),jsonb_build_object('dep','watchdog.comparable_evidence_reliability','weight',50,'transform','identity')),'require_all',true),
    now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,
  confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,
  operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('watchdog.agent.listing_public_record_readiness',array['property']::text[],'watchdog-derived','live',array['watchdog.property_story_confidence','watchdog.transaction_diligence_completion']::text[],now(),'Transparent 50/50 evidence-readiness composite over two governed live 0-100 inputs; require-all/fail-closed.','derived_governed',array['watchdog.property_story_confidence','watchdog.transaction_diligence_completion']::text[],'watchdog-derived-v17-evidence-confidence',21600,'refresh_on_demand',true),
  ('watchdog.attorney.municipal_record_reliance',array['property']::text[],'watchdog-derived','live',array['watchdog.source_authority_coverage','watchdog.parcel_identity_confidence']::text[],now(),'Transparent 50/50 evidence-quality composite over two governed live 0-100 inputs; require-all/fail-closed.','derived_governed',array['watchdog.source_authority_coverage','watchdog.parcel_identity_confidence']::text[],'watchdog-derived-v17-evidence-confidence',21600,'refresh_on_demand',true),
  ('watchdog.contractor.project_screening_confidence',array['property']::text[],'watchdog-derived','live',array['watchdog.contractor.site_preflight_completeness','watchdog.source_authority_coverage']::text[],now(),'Transparent 50/50 evidence-quality composite over two governed live 0-100 inputs; require-all/fail-closed.','derived_governed',array['watchdog.contractor.site_preflight_completeness','watchdog.source_authority_coverage']::text[],'watchdog-derived-v17-evidence-confidence',21600,'refresh_on_demand',true),
  ('watchdog.appraiser.assessment_evidence_alignment',array['property']::text[],'watchdog-derived','live',array['watchdog.assessment_defensibility_score','watchdog.comparable_evidence_reliability']::text[],now(),'Transparent 50/50 evidence-alignment composite over two governed live 0-100 inputs; require-all/fail-closed.','derived_governed',array['watchdog.assessment_defensibility_score','watchdog.comparable_evidence_reliability']::text[],'watchdog-derived-v17-evidence-confidence',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,
  source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,
  provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
