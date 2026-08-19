-- Closing Review v6: direct actionable transaction exceptions only.
-- v5 failed fresh human validation and remains non-current. This migration is additive.

insert into public.derived_formula_registry
(marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
(
  'watchdog.closing_actionable_exception_attention_v6',
  'closing-actionable-v6',
  'max(inverse permit closure confidence, inverse recording-reference completeness, parcel-match variance); direct actionable transaction exceptions only',
  array['watchdog.permit_closure_confidence','watchdog.title.recording_reference_completeness','watchdog.title.parcel_match_variance'],
  'high', 'live',
  'Actionable Closing Review attention. Uses the strongest direct parcel-specific transaction follow-up signal. Environmental and proximity context cannot independently raise this marker.',
  'max_scores',
  jsonb_build_object('require_all',true,'items',jsonb_build_array(
    jsonb_build_object('dep','watchdog.permit_closure_confidence','transform','inverse_identity'),
    jsonb_build_object('dep','watchdog.title.recording_reference_completeness','transform','inverse_identity'),
    jsonb_build_object('dep','watchdog.title.parcel_match_variance','transform','identity')
  )), now()
),
(
  'watchdog.closing_actionable_evidence_coverage_v6',
  'closing-actionable-v6',
  'present(permit closure confidence, recording-reference completeness, parcel-match variance) / 3 * 100',
  array['watchdog.permit_closure_confidence','watchdog.title.recording_reference_completeness','watchdog.title.parcel_match_variance'],
  'high', 'live',
  'Coverage of the three direct actionable Closing Review evidence families. This is evidence coverage, not confidence that the recommendation is correct.',
  'completeness', '{}'::jsonb, now()
)
on conflict (marker_id) do update set
  engine_version=excluded.engine_version, formula=excluded.formula, dependencies=excluded.dependencies,
  confidence=excluded.confidence, status=excluded.status, explanation=excluded.explanation,
  operation=excluded.operation, config=excluded.config, updated_at=excluded.updated_at;

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,config,direction,status,explanation)
values
('watchdog.closing_actionable_exception_attention_v6',1,'watchdog.closing_actionable_exception_attention_v6','Actionable closing exception','identity_0_100','{}'::jsonb,'higher_attention','draft','Maximum direct parcel-specific transaction exception across permit/certificate lifecycle, recording references, and parcel identity.'),
('watchdog.closing_permit_lifecycle_exception_v6',1,'watchdog.permit_closure_confidence','Permit/certificate lifecycle exception','inverse_0_100','{}'::jsonb,'higher_attention','draft','Inverse of governed permit-record closure confidence. It is a DCA permit/certificate record-gap screen, not a legal determination that a permit is open.'),
('watchdog.closing_recording_reference_exception_v6',1,'watchdog.title.recording_reference_completeness','Recording-reference exception','inverse_0_100','{}'::jsonb,'higher_attention','draft','Missing or incomplete deed recording references in the authoritative parcel baseline create a concrete county-record follow-up.'),
('watchdog.closing_parcel_identity_exception_v6',1,'watchdog.title.parcel_match_variance','Parcel identity exception','identity_0_100','{}'::jsonb,'higher_attention','draft','Governed parcel-identity variance that warrants record matching before relying on a closing record.'),
('watchdog.closing_actionable_evidence_coverage_v6',1,'watchdog.closing_actionable_evidence_coverage_v6','Actionable evidence coverage','identity_0_100','{}'::jsonb,'higher_attention','draft','Coverage of direct actionable Closing Review evidence. This is source/evidence coverage and must never be presented as prediction confidence.')
on conflict (feature_key,version) do update set
  source_key=excluded.source_key, label=excluded.label, transform_type=excluded.transform_type,
  config=excluded.config, direction=excluded.direction, status=excluded.status, explanation=excluded.explanation;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
values
(
  'closing_review', 6, 'Closing Review v6 · Actionable Exceptions',
  'Draft Closing Review redesign that surfaces direct parcel-specific transaction exceptions instead of averaging generalized property risk context.',
  'Prioritize properties only when governed evidence identifies a concrete transaction follow-up in permit/certificate lifecycle, recording references, or parcel identity.',
  'pro_plus', 'draft', array['attorney','title','agent','lender'],
  jsonb_build_object(
    'input_contract','closing_actionable_exception_trigger_v6',
    'requires_evidence',true,
    'minimum_evidence_coverage',100,
    'aggregation','max_direct_exception',
    'signals',jsonb_build_array(
      jsonb_build_object('id','watchdog.closing_actionable_exception_attention_v6','role','score','weight',1.0),
      jsonb_build_object('id','watchdog.closing_permit_lifecycle_exception_v6','role','support'),
      jsonb_build_object('id','watchdog.closing_recording_reference_exception_v6','role','support'),
      jsonb_build_object('id','watchdog.closing_parcel_identity_exception_v6','role','support'),
      jsonb_build_object('id','watchdog.closing_actionable_evidence_coverage_v6','role','confidence')
    ),
    'supporting_context_policy',jsonb_build_object('environmental_flood_tidelands','context_only','may_independently_create_priority',false),
    'exception_actions',jsonb_build_object(
      'watchdog.closing_permit_lifecycle_exception_v6','verify permit/certificate status with the enforcing agency',
      'watchdog.closing_recording_reference_exception_v6','verify deed/recording references with the county clerk or title professional',
      'watchdog.closing_parcel_identity_exception_v6','reconcile parcel identity before relying on downstream records'
    ),
    'holdout_policy',jsonb_build_object(
      'development_sanity_review_first',true,
      'development_sanity_cases',10,
      'fresh_independent_labels_required',true,
      'structural_diversity_gate_required',true,
      'reuse_v5_labels_as_promotion_proof',false,
      'minimum_positive_cases',5,
      'minimum_negative_cases',5,
      'minimum_unique_feature_vectors',8
    ),
    'recommended_actions',jsonb_build_array('review_exception','verify_source','add_to_case','create_report')
  ),
  'uncalibrated',
  'DRAFT v6. Created after v5 human validation failed. v5 labels are diagnostic only and cannot validate v6. Do not create a new blind holdout until direct-action evidence passes structural testing and a small development sanity review.'
)
on conflict (model_key,version) do update set
  label=excluded.label, description=excluded.description, objective=excluded.objective,
  minimum_plan=excluded.minimum_plan, status=excluded.status, profession_scope=excluded.profession_scope,
  signal_config=excluded.signal_config, calibration_state=excluded.calibration_state, scoring_notes=excluded.scoring_notes;
