-- Property Change v4 structural discrimination repair.
-- This migration records the first repair pass discovered from the completed v3 tuning labels.
-- v4 is intentionally superseded by v5 in the next migration because the production adapter
-- emits the legacy raw feature IDs. Keep this migration for production-history reproducibility.

insert into public.intelligence_feature_versions
(feature_key,version,label,source_key,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('event.severity_attention',1,'Change severity attention','event.severity_attention','categorical_map',null,null,
 '{"info":10,"watch":60,"action":100}'::jsonb,'higher_attention','preview',
 'Maps Watchdog governed change-event severity into review attention. This ranks review attention only and does not infer urgency, intent, outcome, or value.'),
('event.change_density_30d',1,'30-day change density','event.change_density_30d','count_cap',null,null,
 '{"cap":20}'::jsonb,'higher_attention','preview',
 'Normalizes the count of governed property update events in the prior 30 days with a wider cap to avoid early score saturation. It does not infer cause or owner intent.')
on conflict (feature_key,version) do nothing;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select model_key,4,label,description,objective,minimum_plan,'preview',profession_scope,
 '{"signals":[{"id":"event.severity_attention","role":"score","weight":0.35},{"id":"event.recency","role":"score","weight":0.25},{"id":"event.type_priority","role":"score","weight":0.25},{"id":"event.change_density_30d","role":"score","weight":0.15},{"id":"watchdog.property_story_confidence","role":"confidence"}],"design_note":"v4 repairs the v3 severity category mismatch and replaces the cap-5 density feature with a wider cap-20 density feature so governed event evidence can discriminate before any threshold calibration","input_contract":"normalized_feature_scores_v1","event_window_days":90,"requires_evidence":true,"density_window_days":30,"recommended_actions":["review_change","watch_property","add_to_case","create_report"],"minimum_evidence_coverage":70}'::jsonb,
 'uncalibrated','Structural discrimination repair after v3 tuning review; requires a fresh independent holdout and may not reuse v3 calibration cases.'
from public.intelligence_model_versions
where model_key='property_change_priority' and version=3
on conflict (model_key,version) do nothing;

update public.intelligence_models
set version=4,status='preview',calibration_state='uncalibrated',signal_config=
 '{"signals":[{"id":"event.severity_attention","role":"score","weight":0.35},{"id":"event.recency","role":"score","weight":0.25},{"id":"event.type_priority","role":"score","weight":0.25},{"id":"event.change_density_30d","role":"score","weight":0.15},{"id":"watchdog.property_story_confidence","role":"confidence"}],"design_note":"v4 repairs the v3 severity category mismatch and replaces the cap-5 density feature with a wider cap-20 density feature so governed event evidence can discriminate before any threshold calibration","input_contract":"normalized_feature_scores_v1","event_window_days":90,"requires_evidence":true,"density_window_days":30,"recommended_actions":["review_change","watch_property","add_to_case","create_report"],"minimum_evidence_coverage":70}'::jsonb
where model_key='property_change_priority';

update public.intelligence_calibration_sets
set status='rejected'
where model_key='property_change_priority' and model_version=3 and status in ('draft','reviewing');

insert into public.intelligence_calibration_sets
(name,model_key,model_version,source_kind,status,minimum_reviewed_cases,minimum_precision,minimum_recall,maximum_false_positive_rate,source_manifest)
select 'Property Change v4 fresh holdout','property_change_priority',4,'shadow_run','draft',25,0.70,0.60,0.30,
 '{"created_for":"watchdog-intelligence-v4-repair","model_state":"preview_uncalibrated","priority_threshold":60,"fresh_holdout_required":true,"do_not_reuse_prior_calibration_cases":true,"sampling_goal":"diverse event severity, type, density and score profiles"}'::jsonb
where not exists (select 1 from public.intelligence_calibration_sets where model_key='property_change_priority' and model_version=4);
