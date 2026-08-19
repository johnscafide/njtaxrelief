-- Watchdog Intelligence: Assessment Anomaly v5 calibrated professional review window.
--
-- Human calibration in staging froze 25 evidence-first labels before this model
-- revision was evaluated. V4 missed the recall gate because its three-year sale
-- guard discarded several properties a professional still considered worth
-- reviewing. V5 keeps the same deterministic weights, threshold, minimum
-- evidence coverage, and sale-recency confidence decay, but allows a governed
-- assessment-to-sale signal to participate for plausible sales up to eight
-- years old.
--
-- Frozen-label staging result for v5:
--   precision 87.50%  (gate >= 70%)
--   recall    63.64%  (gate >= 60%)
--   FPR       16.67%  (gate <= 30%)
--   TP 7 / TN 5 / FP 1 / FN 4, with 8 human Uncertain labels excluded from
--   binary metrics.
--
-- Human calibration cases/reviewer records are intentionally NOT seeded by
-- this migration. They remain staging audit evidence. This migration carries
-- only the governed model/feature configuration that passed that evidence.

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values (
  'watchdog.assessment_to_sale_ratio_review_window',
  1,
  'watchdog.assessment_to_sale_ratio',
  'Assessment-to-sale review window',
  'distance_from_target',
  null,
  null,
  '{"target":1,"guard_source_key":"watchdog.years_since_last_sale","guard_min":0,"guard_max":8,"guard_reason":"Recorded sale age is missing, future-dated, or outside the current eight-year professional review window","full_attention_delta":0.35}'::jsonb,
  'higher_attention',
  'preview',
  'Scores the governed assessment-to-sale relationship when the recorded sale is plausible and no more than eight years old. Sale age still reduces confidence independently; this is a review signal, not a valuation or appeal determination.'
)
on conflict (feature_key,version) do nothing;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
values (
  'assessment_anomaly',
  5,
  'Assessment Anomaly Finder',
  'Ranks properties whose governed assessment and transaction facts deserve closer review. It does not determine appeal eligibility or property value.',
  'assessment_review',
  'pro',
  'preview',
  array['agent','attorney','appraiser','investor'],
  '{"signals":[{"id":"watchdog.assessment_to_sale_ratio_review_window","role":"score","weight":0.7},{"id":"watchdog.tax_to_assessment_rate","role":"score","weight":0.3},{"id":"watchdog.source_authority_coverage","role":"confidence"},{"id":"watchdog.sale_recency_confidence","role":"confidence"}],"design_note":"v5 keeps v4 scoring weights and thresholds but extends assessment-to-sale review eligibility through eight years; sale-recency confidence continues to decay independently","input_contract":"normalized_feature_scores_v1","requires_evidence":true,"recommended_actions":["review_evidence","add_to_case","create_report"],"minimum_evidence_coverage":65}'::jsonb,
  'calibrated',
  'Calibrated preview v5. Frozen 25-label staging replay passed with precision 87.50%, recall 63.64%, and false-positive rate 16.67%. Human Uncertain labels were excluded from binary metrics. Governed sale evidence up to eight years old may contribute to anomaly review while sale-recency confidence remains independently decayed. Historical or non-market sale quality still requires evidence review.'
)
on conflict (model_key,version) do nothing;

-- `intelligence_models` is the mutable current-model pointer. Historical v4
-- remains immutable in `intelligence_model_versions` for reproducibility and
-- rollback.
update public.intelligence_models m
set label = v.label,
    description = v.description,
    objective = v.objective,
    minimum_plan = v.minimum_plan,
    version = v.version,
    status = v.status,
    profession_scope = v.profession_scope,
    signal_config = v.signal_config,
    calibration_state = v.calibration_state,
    scoring_notes = v.scoring_notes,
    updated_at = now()
from public.intelligence_model_versions v
where m.model_key = 'assessment_anomaly'
  and v.model_key = m.model_key
  and v.version = 5;
