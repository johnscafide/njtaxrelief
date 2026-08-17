-- Assessment Anomaly v3: remove reciprocal double-counting and require recent-sale relevance.
-- The model remains preview/uncalibrated. This migration improves the definition; it does not validate it.

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('watchdog.assessment_to_sale_ratio',2,'watchdog.assessment_to_sale_ratio','Assessment-to-sale anomaly with recent-sale guard','distance_from_target',null,null,
 '{"target":1,"full_attention_delta":0.35,"guard_source_key":"watchdog.years_since_last_sale","guard_max":3,"guard_reason":"Sale is older than the current review window"}'::jsonb,
 'higher_attention','preview','Scores the governed assessment-to-sale relationship only when the recorded sale is recent enough for this preview review signal. It is not a valuation or appeal determination.'),
('watchdog.sale_recency_confidence',1,'watchdog.years_since_last_sale','Sale recency confidence','numeric_decay',null,null,
 '{"breakpoints":[{"max":1,"score":100},{"max":2,"score":90},{"max":3,"score":75},{"max":4,"score":50},{"max":5,"score":30}],"older_score":10}'::jsonb,
 'higher_confidence','preview','Expresses how much confidence a recorded sale contributes to assessment/sale review based on its age. Older sales reduce confidence rather than becoming stronger signals.')
on conflict (feature_key,version) do nothing;

update public.intelligence_models
set version = 3,
    signal_config = jsonb_build_object(
      'signals', jsonb_build_array(
        jsonb_build_object('id','watchdog.assessment_to_sale_ratio','role','score','weight',0.70),
        jsonb_build_object('id','watchdog.tax_to_assessment_rate','role','score','weight',0.30),
        jsonb_build_object('id','watchdog.source_authority_coverage','role','confidence'),
        jsonb_build_object('id','watchdog.sale_recency_confidence','role','confidence')
      ),
      'minimum_evidence_coverage', 65,
      'recommended_actions', jsonb_build_array('review_evidence','add_to_case','create_report'),
      'requires_evidence', true,
      'input_contract', 'normalized_feature_scores_v1',
      'design_note', 'v3 removes reciprocal double-counting and guards assessment/sale anomaly scoring when the recorded sale is older than three years'
    ),
    calibration_state = 'uncalibrated',
    status = 'preview',
    scoring_notes = 'Preview v3. Sale-based anomaly is unavailable when the recorded sale is older than three years; historical/non-market sale quality still requires human evidence review.',
    updated_at = now()
where model_key = 'assessment_anomaly';

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes
from public.intelligence_models
where model_key = 'assessment_anomaly' and version = 3
on conflict (model_key,version) do nothing;

update public.intelligence_calibration_sets
set status = 'retired', completed_at = now()
where model_key = 'assessment_anomaly' and model_version = 2 and status in ('draft','reviewing');

insert into public.intelligence_calibration_sets
(model_key,model_version,name,description,source_kind,source_manifest,status,minimum_reviewed_cases,minimum_precision,minimum_recall,maximum_false_positive_rate)
values
('assessment_anomaly',3,'Assessment Anomaly v3 initial calibration',
 'Calibration for the corrected assessment model that removes reciprocal signal double-counting and applies a recent-sale relevance guard.',
 'governed_fixture','{"created_for":"watchdog-intelligence-v1","model_state":"preview_uncalibrated","priority_threshold":60}'::jsonb,
 'draft',25,0.7000,0.6000,0.3000);
