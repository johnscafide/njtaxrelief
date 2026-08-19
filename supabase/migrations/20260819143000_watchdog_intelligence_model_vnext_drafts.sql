-- Watchdog Intelligence model-vNext repair drafts.
-- ADDITIVE ONLY: this migration does not move public.intelligence_models current pointers,
-- does not change any customer-visible model status, and does not create a calibration set.
-- These immutable draft definitions capture the evidence/discrimination repair plan discovered
-- from the completed human calibration review and aggregate production evidence diagnostics.

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('watchdog.closing_exception_attention_vnext',1,'watchdog.closing_exception_priority','Closing exception attention (vNext)','count_cap',null,null,
 '{"cap":30}'::jsonb,'higher_attention','draft',
 'Draft vNext normalization candidate. Expands the currently observed low-range governed closing-exception score for calibration research only; not validated and not used by the active Closing Review model.'),
('watchdog.environmental_encumbrance_attention_vnext',1,'watchdog.environmental_encumbrance_severity','Environmental encumbrance attention (vNext)','identity_0_100',null,null,
 '{}'::jsonb,'higher_attention','draft',
 'Draft vNext direct environmental due-diligence dimension. Uses the governed derived 0-100 severity and remains a screening signal, not a contamination determination.'),
('watchdog.flood_environment_attention_vnext',1,'watchdog.flood_environment_risk_score','Flood/environment attention (vNext)','identity_0_100',null,null,
 '{}'::jsonb,'higher_attention','draft',
 'Draft vNext direct flood/environment screening dimension. It is not a flood determination, insurance conclusion, or legal conclusion.'),
('watchdog.permit_closure_gap_vnext',1,'watchdog.permit_closure_confidence','Permit closure gap (vNext)','inverse_0_100',null,null,
 '{}'::jsonb,'higher_attention','draft',
 'Draft vNext permit-record gap dimension. Lower governed permit-closure confidence creates higher review attention; it does not certify code or permit status.'),
('watchdog.title_constraint_attention_vnext',1,'watchdog.title_constraint_stack','Title/public-record constraint attention (vNext)','count_cap',null,null,
 '{"cap":4}'::jsonb,'higher_attention','draft',
 'Draft vNext bounded count of governed title/public-record constraint signals. It is not a title opinion.'),
('event.materiality_vnext',1,'event.materiality','Decision-material change band (vNext)','categorical_map',null,null,
 '{"critical":100,"high":85,"medium":60,"low":35,"info":15,"watch":20}'::jsonb,'higher_attention','draft',
 'Draft vNext event materiality map. The operational watch band is intentionally low and cannot by itself create a priority finding.'),
('event.recency_vnext',1,'event.occurred_at','Decision-material change recency (vNext)','recency_decay',null,null,
 '{"breakpoints":[{"days":7,"score":100},{"days":30,"score":80},{"days":90,"score":55},{"days":180,"score":30},{"days":365,"score":15}],"older_score":5}'::jsonb,
 'higher_attention','draft','Draft vNext recency feature using the actual governed occurred-at source key. This repairs the v3 adapter/registry source-key mismatch without modifying v3.'),
('event.type_priority_vnext',1,'event.type_priority','Decision-material change type (vNext)','categorical_map',null,null,
 '{"source_refresh":0,"appeal_deadline":100,"assessment_change":90,"tax_change":82,"permit_change":76,"deed_change":72,"evidence_change":70,"market_change":62,"municipal_change":55}'::jsonb,
 'higher_attention','draft','Draft vNext event-type attention. Operational source_refresh is explicitly zero-weight evidence and must not seed a calibration holdout.'),
('event.material_event_count_90d_vnext',1,'event.material_event_count_90d','Material change count, 90 days (vNext)','count_cap',null,null,
 '{"cap":6}'::jsonb,'higher_attention','draft','Draft vNext count of non-operational governed change events in the prior 90 days, capped for normalization.'),
('event.distinct_type_count_90d_vnext',1,'event.distinct_type_count_90d','Distinct material change types, 90 days (vNext)','count_cap',null,null,
 '{"cap":4}'::jsonb,'higher_attention','draft','Draft vNext count of distinct non-operational governed change-event types in the prior 90 days.')
on conflict (feature_key,version) do nothing;

-- Closing Review v3 draft. Current customer-visible pointer remains Closing Review v2 Preview.
insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select
  m.model_key,
  3,
  m.label,
  m.description,
  m.objective,
  m.minimum_plan,
  'draft',
  m.profession_scope,
  jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object('id','watchdog.closing_exception_attention_vnext','role','score','weight',0.20),
      jsonb_build_object('id','watchdog.environmental_encumbrance_attention_vnext','role','score','weight',0.25),
      jsonb_build_object('id','watchdog.flood_environment_attention_vnext','role','score','weight',0.20),
      jsonb_build_object('id','watchdog.permit_closure_gap_vnext','role','score','weight',0.20),
      jsonb_build_object('id','watchdog.title_constraint_attention_vnext','role','score','weight',0.15),
      jsonb_build_object('id','watchdog.transaction_diligence_completion','role','confidence')
    ),
    'minimum_evidence_coverage', 70,
    'recommended_actions', jsonb_build_array('review_evidence','add_to_case','create_report'),
    'requires_evidence', true,
    'input_contract', 'normalized_feature_scores_v1',
    'holdout_policy', jsonb_build_object(
      'fresh_independent_labels_required', true,
      'reuse_v2_labels_as_promotion_proof', false,
      'minimum_positive_cases', 5,
      'minimum_negative_cases', 5,
      'minimum_unique_feature_vectors', 8,
      'structural_diversity_gate_required', true
    ),
    'design_note', 'Draft repair removes zero-only duplicated dimensions from the primary score and exposes independent governed exception families directly. Weights are hypotheses for fresh calibration, not validated probabilities.'
  ),
  'uncalibrated',
  'DRAFT v3 DESIGN ONLY. Do not run or promote as calibrated. Requires fresh representative holdout and independent labels after structural diversity passes.'
from public.intelligence_models m
where m.model_key='closing_review'
on conflict (model_key,version) do nothing;

-- Property Change Priority v4 draft. Current customer-visible pointer remains Property Change Priority v3 Preview.
insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select
  m.model_key,
  4,
  m.label,
  m.description,
  m.objective,
  m.minimum_plan,
  'draft',
  m.profession_scope,
  jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object('id','event.type_priority_vnext','role','score','weight',0.35),
      jsonb_build_object('id','event.recency_vnext','role','score','weight',0.25),
      jsonb_build_object('id','event.materiality_vnext','role','score','weight',0.15),
      jsonb_build_object('id','event.material_event_count_90d_vnext','role','score','weight',0.15),
      jsonb_build_object('id','event.distinct_type_count_90d_vnext','role','score','weight',0.10),
      jsonb_build_object('id','watchdog.property_story_confidence','role','confidence')
    ),
    'minimum_evidence_coverage', 70,
    'recommended_actions', jsonb_build_array('review_change','watch_property','add_to_case','create_report'),
    'requires_evidence', true,
    'input_contract', 'decision_material_change_events_v2',
    'event_window_days', 90,
    'excluded_event_types', jsonb_build_array('source_refresh'),
    'holdout_policy', jsonb_build_object(
      'fresh_independent_labels_required', true,
      'reuse_v3_labels_as_promotion_proof', false,
      'minimum_positive_cases', 5,
      'minimum_negative_cases', 5,
      'minimum_distinct_event_types', 3,
      'minimum_non_operational_events', 25,
      'minimum_unique_feature_vectors', 8,
      'structural_diversity_gate_required', true
    ),
    'design_note', 'Draft repair excludes operational source-refresh noise, repairs recency source-key alignment in the vNext input contract, and measures diversity of material event types rather than saturated all-event counts.'
  ),
  'uncalibrated',
  'DRAFT v4 DESIGN ONLY. Do not run or promote as calibrated. Current production event pool is not yet representative enough for a fresh promotion holdout.'
from public.intelligence_models m
where m.model_key='property_change_priority'
on conflict (model_key,version) do nothing;

-- Hard assertion: the draft migration must never move the customer-visible current-model pointer.
do $$
begin
  if exists (
    select 1 from public.intelligence_models
    where (model_key='closing_review' and version<>2)
       or (model_key='property_change_priority' and version<>3)
  ) then
    raise exception 'vNext draft migration attempted to move an active Intelligence model pointer';
  end if;
end $$;