-- Watchdog Intelligence: Closing Review v4 granular-evidence draft.
--
-- ADDITIVE / NON-PROMOTING ONLY.
-- v2 remains customer-facing. v3 remains frozen as the failed fresh-holdout artifact.
-- v3 labels were used only to diagnose information loss in the v3 aggregate feature vector;
-- they are explicitly ineligible as v4 promotion proof.
--
-- Design goal: remove overlapping aggregate dimensions and restore the governed source
-- distinctions that v3 collapsed together. Every primary score dimension below maps to a
-- distinct due-diligence family. Missing provider/dependency evidence remains missing, and
-- v4 requires 100% weighted evidence coverage before a candidate is considered scorable.

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
(
  'watchdog.closing_open_permit_attention_v4', 1, 'preflight.open_permit_count',
  'Open permit attention (v4)', 'count_cap', null, null,
  '{"cap":3}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 direct governed open-permit dimension. Three or more published open-permit records saturate attention. This is a screening signal, not a municipal code-clearance determination.'
),
(
  'watchdog.closing_deed_notice_attention_v4', 1, 'preflight.deed_notice_hit',
  'Deed notice attention (v4)', 'categorical_map', null, null,
  '{"true":100,"false":0}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 direct governed deed-notice dimension. A mapped hit raises review attention but is not a title or contamination determination.'
),
(
  'watchdog.closing_cea_attention_v4', 1, 'preflight.cea_hit',
  'Classification Exception Area attention (v4)', 'categorical_map', null, null,
  '{"true":100,"false":0}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 direct governed Classification Exception Area screening dimension. A mapped hit raises due-diligence attention but is not an environmental or legal conclusion.'
),
(
  'watchdog.closing_contaminated_site_attention_v4', 1, 'preflight.contaminated_site_500m',
  'Nearby contaminated-site attention (v4)', 'count_cap', null, null,
  '{"cap":3}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 proximity dimension using the governed count of mapped contaminated sites within 500 meters. Proximity is not a contamination determination.'
),
(
  'watchdog.closing_ust_attention_v4', 1, 'preflight.ust_250m',
  'Nearby UST attention (v4)', 'count_cap', null, null,
  '{"cap":3}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 proximity dimension using the governed count of mapped underground-storage-tank records within 250 meters. Proximity is not a site-condition determination.'
),
(
  'watchdog.closing_tidelands_attention_v4', 1, 'preflight.tidelands_reference_hit',
  'Tidelands reference attention (v4)', 'categorical_map', null, null,
  '{"true":100,"false":0}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 direct governed tidelands-reference dimension. A mapped reference raises closing due-diligence attention but is not a title opinion.'
),
(
  'watchdog.closing_flood_environment_attention_v4', 1, 'watchdog.flood_environment_risk_score',
  'Flood/environment attention (v4)', 'identity_0_100', null, null,
  '{}'::jsonb, 'higher_attention', 'draft',
  'Draft v4 governed flood/environment screening family. It is retained as one non-overlapping family rather than being counted again through the v3 title/environment aggregates.'
)
on conflict (feature_key,version) do nothing;

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
      jsonb_build_object('id','watchdog.closing_open_permit_attention_v4','role','score','weight',0.24),
      jsonb_build_object('id','watchdog.closing_deed_notice_attention_v4','role','score','weight',0.16),
      jsonb_build_object('id','watchdog.closing_cea_attention_v4','role','score','weight',0.16),
      jsonb_build_object('id','watchdog.closing_contaminated_site_attention_v4','role','score','weight',0.12),
      jsonb_build_object('id','watchdog.closing_ust_attention_v4','role','score','weight',0.08),
      jsonb_build_object('id','watchdog.closing_tidelands_attention_v4','role','score','weight',0.10),
      jsonb_build_object('id','watchdog.closing_flood_environment_attention_v4','role','score','weight',0.14),
      jsonb_build_object('id','watchdog.transaction_diligence_completion','role','confidence')
    ),
    'minimum_evidence_coverage', 100,
    'recommended_actions', jsonb_build_array('review_evidence','add_to_case','create_report'),
    'requires_evidence', true,
    'input_contract', 'closing_granular_governed_evidence_v4',
    'holdout_policy', jsonb_build_object(
      'fresh_independent_labels_required', true,
      'reuse_v2_labels_as_promotion_proof', false,
      'reuse_v3_labels_as_promotion_proof', false,
      'minimum_positive_cases', 5,
      'minimum_negative_cases', 5,
      'minimum_unique_feature_vectors', 8,
      'structural_diversity_gate_required', true
    ),
    'design_note',
      'Immutable v4 hypothesis. v3 fresh-holdout labels were used only to diagnose aggregate feature collisions before this definition was frozen. v4 removes the overlapping closing-exception/environment/title stack from the primary score and instead scores distinct governed permit, recorded-constraint, proximity, and flood/environment families. v4 requires fresh unseen human labels for any calibration or promotion claim.'
  ),
  'uncalibrated',
  'DRAFT v4 DESIGN ONLY. v3 is a frozen failed-validation artifact. Do not tune or validate v4 on v3 labels. Run a representative structural shadow, freeze any threshold before labels, then use a new unseen independent holdout.'
from public.intelligence_models m
where m.model_key='closing_review'
on conflict (model_key,version) do nothing;

-- Fail closed if this additive draft ever moves the customer pointer or changes the expected
-- immutable state of the predecessor under test.
do $$
begin
  if not exists (
    select 1 from public.intelligence_model_versions
    where model_key='closing_review' and version=4 and status='draft' and calibration_state='uncalibrated'
  ) then
    raise exception 'Closing Review v4 draft was not created';
  end if;

  if exists (
    select 1 from public.intelligence_models
    where model_key='closing_review' and version<>2
  ) then
    raise exception 'Closing Review v4 draft migration attempted to move the customer-facing model pointer';
  end if;

  if not exists (
    select 1 from public.intelligence_model_versions
    where model_key='closing_review' and version=3 and status='draft' and calibration_state='uncalibrated'
  ) then
    raise exception 'Closing Review v3 predecessor is no longer the frozen draft artifact expected by v4';
  end if;
end $$;
