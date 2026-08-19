-- Watchdog Intelligence: Assessment Anomaly v4 date-sanity correction.
-- Future or missing sale-age evidence must never qualify as a recent sale.

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
(
  'watchdog.assessment_to_sale_ratio',3,'watchdog.assessment_to_sale_ratio',
  'Assessment-to-sale anomaly with plausible recent-sale guard','distance_from_target',null,null,
  '{"target":1,"guard_source_key":"watchdog.years_since_last_sale","guard_min":0,"guard_max":3,"guard_reason":"Recorded sale age is missing, future-dated, or outside the current three-year review window","full_attention_delta":0.35}'::jsonb,
  'higher_attention','preview',
  'Scores the governed assessment-to-sale relationship only when the recorded sale age is plausible and within three years. It is not a valuation or appeal determination.'
),
(
  'watchdog.sale_recency_confidence',2,'watchdog.years_since_last_sale',
  'Plausible sale recency confidence','numeric_decay',null,null,
  '{"guard_source_key":"watchdog.years_since_last_sale","guard_min":0,"guard_reason":"Recorded sale age is missing or future-dated","breakpoints":[{"max":1,"score":100},{"max":2,"score":90},{"max":3,"score":75},{"max":4,"score":50},{"max":5,"score":30}],"older_score":10}'::jsonb,
  'higher_confidence','preview',
  'Expresses sale-recency confidence only for plausible non-future sale ages. Older valid sales reduce confidence rather than becoming stronger signals.'
)
on conflict (feature_key,version) do nothing;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
values (
  'assessment_anomaly',4,'Assessment Anomaly Finder',
  'Ranks properties whose governed assessment and transaction facts deserve closer review. It does not determine appeal eligibility or property value.',
  'assessment_review','pro','preview',array['agent','attorney','appraiser','investor'],
  '{"signals":[{"id":"watchdog.assessment_to_sale_ratio","role":"score","weight":0.7},{"id":"watchdog.tax_to_assessment_rate","role":"score","weight":0.3},{"id":"watchdog.source_authority_coverage","role":"confidence"},{"id":"watchdog.sale_recency_confidence","role":"confidence"}],"design_note":"v4 retains the v3 non-duplicative score design and adds explicit missing/future-date rejection for sale-age evidence","input_contract":"normalized_feature_scores_v1","requires_evidence":true,"recommended_actions":["review_evidence","add_to_case","create_report"],"minimum_evidence_coverage":65}'::jsonb,
  'uncalibrated',
  'Preview v4. Sale-based anomaly is unavailable when sale age is missing, future-dated, or older than three years. Historical/non-market sale quality still requires human evidence review.'
)
on conflict (model_key,version) do nothing;

update public.intelligence_models
set version=4,
    signal_config='{"signals":[{"id":"watchdog.assessment_to_sale_ratio","role":"score","weight":0.7},{"id":"watchdog.tax_to_assessment_rate","role":"score","weight":0.3},{"id":"watchdog.source_authority_coverage","role":"confidence"},{"id":"watchdog.sale_recency_confidence","role":"confidence"}],"design_note":"v4 retains the v3 non-duplicative score design and adds explicit missing/future-date rejection for sale-age evidence","input_contract":"normalized_feature_scores_v1","requires_evidence":true,"recommended_actions":["review_evidence","add_to_case","create_report"],"minimum_evidence_coverage":65}'::jsonb,
    calibration_state='uncalibrated',
    scoring_notes='Preview v4. Sale-based anomaly is unavailable when sale age is missing, future-dated, or older than three years. Historical/non-market sale quality still requires human evidence review.',
    updated_at=now()
where model_key='assessment_anomaly';

update public.intelligence_calibration_sets
set status='retired', completed_at=coalesce(completed_at,now())
where model_key='assessment_anomaly' and model_version=3 and status<>'retired';

insert into public.intelligence_calibration_sets
(model_key,model_version,name,description,source_kind,source_manifest,status,minimum_reviewed_cases,minimum_precision,minimum_recall,maximum_false_positive_rate)
select
  'assessment_anomaly',4,'Assessment Anomaly v4 initial calibration',
  'Calibration for the date-sane assessment model. Human labels and error review are required before promotion.',
  'governed_fixture',
  '{"created_for":"watchdog-intelligence-v1","model_state":"preview_uncalibrated","priority_threshold":60,"date_sanity":"future_or_missing_sale_age_rejected"}'::jsonb,
  'draft',25,0.70,0.60,0.30
where not exists (
  select 1 from public.intelligence_calibration_sets where model_key='assessment_anomaly' and model_version=4
);
