-- Property Change v5 adapter-compatible structural discrimination repair.
-- The production adapter already emits event.materiality and event.change_count_30d.
-- Keep those stable raw IDs, introduce new normalization versions, and require a fresh holdout.

insert into public.intelligence_feature_versions
(feature_key,version,label,source_key,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('event.materiality',2,'Change materiality','event.materiality','categorical_map',null,null,
 '{"info":10,"watch":60,"action":100}'::jsonb,'higher_attention','preview',
 'Maps the governed Watchdog event severity vocabulary emitted by the production change adapter into bounded review attention. This ranks review attention only and does not infer urgency, intent, outcome, or value.'),
('event.change_count_30d',2,'30-day change count','event.change_count_30d','count_cap',null,null,
 '{"cap":20}'::jsonb,'higher_attention','preview',
 'Normalizes governed 30-day property update-event count with a wider cap to reduce early saturation. It does not infer cause or owner intent.')
on conflict (feature_key,version) do nothing;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select model_key,5,label,description,objective,minimum_plan,'preview',profession_scope,
 '{"signals":[{"id":"event.materiality","role":"score","weight":0.35},{"id":"event.recency","role":"score","weight":0.25},{"id":"event.type_priority","role":"score","weight":0.25},{"id":"event.change_count_30d","role":"score","weight":0.15},{"id":"watchdog.property_story_confidence","role":"confidence"}],"design_note":"v5 is the adapter-compatible discrimination repair: feature v2 maps the production info/watch/action severity vocabulary and feature v2 widens 30-day density normalization from cap 5 to cap 20; prior 50 labels are tuning evidence only","input_contract":"normalized_feature_scores_v1","event_window_days":90,"requires_evidence":true,"density_window_days":30,"recommended_actions":["review_change","watch_property","add_to_case","create_report"],"minimum_evidence_coverage":70}'::jsonb,
 'uncalibrated','Structural discrimination repair after v3 tuning review. Requires a fresh independent holdout; v3 cases may not be reused as promotion evidence.'
from public.intelligence_model_versions
where model_key='property_change_priority' and version=4
on conflict (model_key,version) do nothing;

update public.intelligence_models
set version=5,status='preview',calibration_state='uncalibrated',signal_config=
 '{"signals":[{"id":"event.materiality","role":"score","weight":0.35},{"id":"event.recency","role":"score","weight":0.25},{"id":"event.type_priority","role":"score","weight":0.25},{"id":"event.change_count_30d","role":"score","weight":0.15},{"id":"watchdog.property_story_confidence","role":"confidence"}],"design_note":"v5 is the adapter-compatible discrimination repair: feature v2 maps the production info/watch/action severity vocabulary and feature v2 widens 30-day density normalization from cap 5 to cap 20; prior 50 labels are tuning evidence only","input_contract":"normalized_feature_scores_v1","event_window_days":90,"requires_evidence":true,"density_window_days":30,"recommended_actions":["review_change","watch_property","add_to_case","create_report"],"minimum_evidence_coverage":70}'::jsonb
where model_key='property_change_priority';

update public.intelligence_calibration_sets
set status='rejected'
where model_key='property_change_priority' and model_version=4 and status in ('draft','reviewing');

insert into public.intelligence_calibration_sets
(name,model_key,model_version,source_kind,status,minimum_reviewed_cases,minimum_precision,minimum_recall,maximum_false_positive_rate,source_manifest)
select 'Property Change v5 fresh holdout','property_change_priority',5,'shadow_run','draft',25,0.70,0.60,0.30,
 '{"created_for":"watchdog-intelligence-v5-repair","model_state":"preview_uncalibrated","priority_threshold":60,"fresh_holdout_required":true,"do_not_reuse_prior_calibration_cases":true,"sampling_goal":"diverse event severity, type, density and score profiles"}'::jsonb
where not exists (select 1 from public.intelligence_calibration_sets where model_key='property_change_priority' and model_version=5);
