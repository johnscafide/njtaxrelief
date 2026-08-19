-- Watchdog Intelligence preview scoring configuration.
-- These weights operate only on server-normalized 0-100 feature scores.
-- They are explicitly uncalibrated and must not be presented as validated/predictive.

update public.intelligence_models
set signal_config = jsonb_build_object(
  'signals', jsonb_build_array(
    jsonb_build_object('id','watchdog.assessment_to_sale_ratio','role','score','weight',0.45),
    jsonb_build_object('id','watchdog.sale_to_assessment_ratio','role','score','weight',0.35),
    jsonb_build_object('id','watchdog.tax_to_assessment_rate','role','score','weight',0.20),
    jsonb_build_object('id','watchdog.source_authority_coverage','role','confidence')
  ),
  'minimum_evidence_coverage', 60,
  'recommended_actions', jsonb_build_array('review_evidence','add_to_case','create_report'),
  'requires_evidence', true,
  'input_contract', 'normalized_feature_scores_v1'
),
updated_at = now()
where model_key = 'assessment_anomaly';

update public.intelligence_models
set signal_config = jsonb_build_object(
  'signals', jsonb_build_array(
    jsonb_build_object('id','watchdog.closing_exception_priority','role','score','weight',0.45),
    jsonb_build_object('id','watchdog.due_diligence_signal_count','role','score','weight',0.20),
    jsonb_build_object('id','watchdog.permit_closure_confidence','role','score','weight',0.15),
    jsonb_build_object('id','watchdog.title_constraint_stack','role','score','weight',0.20),
    jsonb_build_object('id','watchdog.transaction_diligence_completion','role','confidence')
  ),
  'minimum_evidence_coverage', 60,
  'recommended_actions', jsonb_build_array('review_evidence','add_to_case','create_report'),
  'requires_evidence', true,
  'input_contract', 'normalized_feature_scores_v1'
),
updated_at = now()
where model_key = 'closing_review';

update public.intelligence_models
set signal_config = jsonb_build_object(
  'signals', jsonb_build_array(
    jsonb_build_object('id','event.materiality','role','score','weight',0.45),
    jsonb_build_object('id','event.recency','role','score','weight',0.35),
    jsonb_build_object('id','event.delta_numeric','role','score','weight',0.20),
    jsonb_build_object('id','watchdog.property_story_confidence','role','confidence')
  ),
  'minimum_evidence_coverage', 50,
  'recommended_actions', jsonb_build_array('review_change','watch_property','create_report'),
  'requires_evidence', true,
  'input_contract', 'normalized_feature_scores_v1'
),
updated_at = now()
where model_key = 'property_change_priority';
