-- Property Change Intelligence v3
-- Removes generic delta_numeric scoring because unlike event units cannot be compared safely.
-- Adds event-type context and recent change density while keeping story confidence as confidence evidence only.

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('event.type_priority',1,'event.type_priority','Change type review priority','categorical_map',null,null,
 '{"appeal_deadline":100,"assessment_change":90,"tax_change":82,"permit_change":76,"deed_change":72,"evidence_change":70,"market_change":62,"municipal_change":55}'::jsonb,
 'higher_attention','preview','Maps a governed Watchdog change-event type to a review-priority context. This ranks review attention, not outcome probability.'),
('event.change_count_30d',1,'event.change_count_30d','Recent change density','count_cap',null,null,
 '{"cap":5}'::jsonb,
 'higher_attention','preview','Counts governed property update events observed in the prior 30 days, capped at five for normalization. It does not infer cause or owner intent.')
on conflict (feature_key,version) do nothing;

update public.intelligence_models
set version = 3,
    signal_config = jsonb_build_object(
      'signals', jsonb_build_array(
        jsonb_build_object('id','event.materiality','role','score','weight',0.35),
        jsonb_build_object('id','event.recency','role','score','weight',0.25),
        jsonb_build_object('id','event.type_priority','role','score','weight',0.25),
        jsonb_build_object('id','event.change_count_30d','role','score','weight',0.15),
        jsonb_build_object('id','watchdog.property_story_confidence','role','confidence')
      ),
      'minimum_evidence_coverage', 70,
      'recommended_actions', jsonb_build_array('review_change','watch_property','add_to_case','create_report'),
      'requires_evidence', true,
      'input_contract', 'normalized_feature_scores_v1',
      'event_window_days', 90,
      'density_window_days', 30,
      'design_note', 'v3 removes generic delta_numeric scoring and uses only unit-safe event attributes'
    ),
    calibration_state = 'uncalibrated',
    status = 'preview',
    scoring_notes = 'Preview v3. Ranks review attention from event materiality, recency, type and recent event density. Numeric deltas remain evidence context only until event-type-specific normalization exists.',
    updated_at = now()
where model_key = 'property_change_priority';

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes
from public.intelligence_models
where model_key='property_change_priority' and version=3
on conflict (model_key,version) do nothing;

update public.intelligence_calibration_sets
set status='retired', completed_at=now()
where model_key='property_change_priority' and model_version=2 and status in ('draft','reviewing');

insert into public.intelligence_calibration_sets
(model_key,model_version,name,description,source_kind,source_manifest,status,minimum_reviewed_cases,minimum_precision,minimum_recall,maximum_false_positive_rate)
values
('property_change_priority',3,'Property Change v3 initial calibration',
 'Calibration for the unit-safe change model using materiality, recency, event type and recent event density.',
 'governed_fixture','{"created_for":"watchdog-intelligence-v1","model_state":"preview_uncalibrated","priority_threshold":60}'::jsonb,
 'draft',25,0.7000,0.6000,0.3000);
