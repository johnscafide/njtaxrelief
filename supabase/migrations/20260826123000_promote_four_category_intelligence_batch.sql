-- Promote a four-category governed intelligence batch using only already-live inputs.
-- Categories: Appeals, Permits/Home Improvement, Development/Construction, Environmental/Risk.
-- All composites fail closed when a required dependency is missing.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.attorney.appeal_evidence_gap',
    'watchdog-derived-v17-four-category-batch',
    '100 - watchdog.evidence_chain_completeness',
    array['watchdog.evidence_chain_completeness']::text[],
    'high','live',
    'Appeal Evidence Gap is the exact inverse of the governed Evidence Chain Completeness score. It measures missing defined public appeal-support evidence and is not a legal conclusion about appeal merit.',
    'inverse', jsonb_build_object('dep','watchdog.evidence_chain_completeness'), now()
  ),
  (
    'watchdog.consumer.appeal_readiness',
    'watchdog-derived-v17-four-category-batch',
    '50% governed appeal evidence strength + 50% evidence chain completeness',
    array['watchdog.appeal_evidence_strength','watchdog.evidence_chain_completeness']::text[],
    'medium','live',
    'Homeowner/buyer appeal-readiness context combining evidence quality and evidence completeness. Both governed inputs are required. This is not a prediction of success, legal advice, or a filing recommendation.',
    'weighted_scores', jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','watchdog.appeal_evidence_strength','weight',50,'transform','identity'),
      jsonb_build_object('dep','watchdog.evidence_chain_completeness','weight',50,'transform','identity')
    ),'require_all',true), now()
  ),
  (
    'watchdog.consumer.home_improvement_followup',
    'watchdog-derived-v17-four-category-batch',
    '50% permit activity + 50% permit closure confidence',
    array['watchdog.permit_activity_score','watchdog.permit_closure_confidence']::text[],
    'medium','live',
    'Home-improvement public-record follow-up context combining the amount of observed permit activity with permit-record closure confidence. Both inputs are required; the score does not determine code compliance or whether work was legally completed.',
    'weighted_scores', jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','watchdog.permit_activity_score','weight',50,'transform','identity'),
      jsonb_build_object('dep','watchdog.permit_closure_confidence','weight',50,'transform','identity')
    ),'require_all',true), now()
  ),
  (
    'watchdog.contractor.site_approval_complexity',
    'watchdog-derived-v17-four-category-batch',
    '40% regulatory constraint density + 35% environmental encumbrance severity + 25% normalized title/public-land constraint stack',
    array['watchdog.regulatory_constraint_density','watchdog.environmental_encumbrance_severity','watchdog.title_constraint_stack']::text[],
    'medium','live',
    'Site Approval Complexity is a public-record screening score for overlapping review contexts. It combines mapped regulatory density, environmental encumbrance severity, and the six-signal title/public-land constraint stack. All inputs are required. It is not a buildability, zoning, permitting, or legal determination.',
    'weighted_scores', jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','watchdog.regulatory_constraint_density','weight',40,'transform','identity'),
      jsonb_build_object('dep','watchdog.environmental_encumbrance_severity','weight',35,'transform','identity'),
      jsonb_build_object('dep','watchdog.title_constraint_stack','weight',25,'transform','count6')
    ),'require_all',true), now()
  ),
  (
    'watchdog.insurance.risk_context_consistency',
    'watchdog-derived-v17-four-category-batch',
    'Equal-weight flood/environment + water-protection + geology-hazard + environmental-review context',
    array['watchdog.flood_environment_risk_score','watchdog.insurance.water_protection_context','watchdog.insurance.geology_hazard_context','watchdog.insurance.environmental_review_scope']::text[],
    'medium','live',
    'Risk Context Consistency summarizes four already-governed public mapped-risk contexts with equal transparent weighting. All four inputs are required. It is a first-pass evidence context only and does not determine insurance eligibility, pricing, contamination, or site safety.',
    'weighted_scores', jsonb_build_object('items',jsonb_build_array(
      jsonb_build_object('dep','watchdog.flood_environment_risk_score','weight',25,'transform','identity'),
      jsonb_build_object('dep','watchdog.insurance.water_protection_context','weight',25,'transform','identity'),
      jsonb_build_object('dep','watchdog.insurance.geology_hazard_context','weight',25,'transform','identity'),
      jsonb_build_object('dep','watchdog.insurance.environmental_review_scope','weight',25,'transform','identity')
    ),'require_all',true), now()
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
  ('watchdog.attorney.appeal_evidence_gap',array['property']::text[],'watchdog-derived','live',array['Watchdog governed appeal evidence chain']::text[],now(),'Exact inverse of governed evidence-chain completeness; not appeal-merit advice.','derived_governed',array['watchdog.evidence_chain_completeness']::text[],'watchdog-derived-v17-four-category-batch',21600,'refresh_on_demand',true),
  ('watchdog.consumer.appeal_readiness',array['property']::text[],'watchdog-derived','live',array['NJ Division of Taxation Chapter 123','NJ Division of Taxation SR-1A verified sales','Watchdog governed appeal evidence chain']::text[],now(),'Fail-closed 50/50 evidence-strength and evidence-completeness context.','derived_governed',array['watchdog.appeal_evidence_strength','watchdog.evidence_chain_completeness']::text[],'watchdog-derived-v17-four-category-batch',21600,'refresh_on_demand',true),
  ('watchdog.consumer.home_improvement_followup',array['property']::text[],'watchdog-derived','live',array['Governed public permit records']::text[],now(),'Fail-closed permit activity and closure-confidence follow-up context; not code-clearance determination.','derived_governed',array['watchdog.permit_activity_score','watchdog.permit_closure_confidence']::text[],'watchdog-derived-v17-four-category-batch',21600,'refresh_on_demand',true),
  ('watchdog.contractor.site_approval_complexity',array['property']::text[],'watchdog-derived','live',array['NJDEP mapped environmental sources','FEMA mapped flood context','NJ public land-use screens']::text[],now(),'Fail-closed public-record screening complexity score; not buildability or approval prediction.','derived_governed',array['watchdog.regulatory_constraint_density','watchdog.environmental_encumbrance_severity','watchdog.title_constraint_stack']::text[],'watchdog-derived-v17-four-category-batch',21600,'refresh_on_demand',true),
  ('watchdog.insurance.risk_context_consistency',array['property']::text[],'watchdog-derived','live',array['FEMA','NJDEP mapped environmental and water sources','NJ public geology sources']::text[],now(),'Equal-weight four-context public mapped-risk screen; not underwriting or hazard determination.','derived_governed',array['watchdog.flood_environment_risk_score','watchdog.insurance.water_protection_context','watchdog.insurance.geology_hazard_context','watchdog.insurance.environmental_review_scope']::text[],'watchdog-derived-v17-four-category-batch',21600,'refresh_on_demand',true)
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
