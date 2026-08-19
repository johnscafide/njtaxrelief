-- Watchdog Intelligence: Closing Review v5 checked-zero permit semantics.
--
-- ADDITIVE / NON-PROMOTING ONLY.
-- v2 remains customer-facing. v3 remains a failed human-validation artifact.
-- v4 remains a structural-shadow artifact and is not mutated after its first shadow.
-- No human v3 labels are used as v5 calibration or promotion proof.
--
-- v4 proved the granular evidence layout is structurally discriminating, but also
-- exposed one evidence-state mismatch: a successful NJ DCA parcel permit lookup with
-- no rows is authoritative checked-no-value. For an OPEN PERMIT COUNT this state means
-- zero observed open permit records, not unknown. Workbench Derived already governs
-- that exact preflight convention by mapping source_checked_no_value to 0 before formula
-- evaluation. v5 uses that governed layer instead of asking the model adapter to invent
-- a raw-value fallback.

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
values (
  'watchdog.closing_open_permit_attention_v5',
  'closing-v5-open-permit-semantics-v1',
  'min(open_permit_count, 3) / 3 * 100; authoritative source_checked_no_value is governed as zero by Workbench Derived',
  array['preflight.open_permit_count']::text[],
  'medium',
  'live',
  'Closing v5 open-permit attention. A successful governed DCA lookup with no permit rows is zero observed open permits; dependency/provider failures remain unavailable. Three or more open permit records saturate attention. This is not a municipal code-clearance determination.',
  'weighted_scores',
  '{"items":[{"dep":"preflight.open_permit_count","weight":1,"transform":"count3"}],"require_all":true}'::jsonb,
  now()
)
on conflict (marker_id) do nothing;

insert into public.intelligence_feature_versions
(feature_key,version,source_key,label,transform_type,cohort_key,cohort_version,config,direction,status,explanation)
values
('watchdog.closing_open_permit_attention_v5',1,'watchdog.closing_open_permit_attention_v5','Open permit attention (v5)','identity_0_100',null,null,'{}'::jsonb,'higher_attention','draft','Draft v5 governed open-permit dimension. Uses the derived checked-zero convention so a successfully checked DCA parcel with no permit records is zero observed open permits, while provider/dependency failure remains unavailable.'),
('watchdog.closing_deed_notice_attention_v5',1,'preflight.deed_notice_hit','Deed notice attention (v5)','categorical_map',null,null,'{"true":100,"false":0}'::jsonb,'higher_attention','draft','Draft v5 direct governed deed-notice dimension. A mapped hit raises review attention but is not a title or contamination determination.'),
('watchdog.closing_cea_attention_v5',1,'preflight.cea_hit','Classification Exception Area attention (v5)','categorical_map',null,null,'{"true":100,"false":0}'::jsonb,'higher_attention','draft','Draft v5 direct governed Classification Exception Area screening dimension. A mapped hit raises due-diligence attention but is not an environmental or legal conclusion.'),
('watchdog.closing_contaminated_site_attention_v5',1,'preflight.contaminated_site_500m','Nearby contaminated-site attention (v5)','count_cap',null,null,'{"cap":3}'::jsonb,'higher_attention','draft','Draft v5 proximity dimension using the governed count of mapped contaminated sites within 500 meters. Proximity is not a contamination determination.'),
('watchdog.closing_ust_attention_v5',1,'preflight.ust_250m','Nearby UST attention (v5)','count_cap',null,null,'{"cap":3}'::jsonb,'higher_attention','draft','Draft v5 proximity dimension using the governed count of mapped underground-storage-tank records within 250 meters. Proximity is not a site-condition determination.'),
('watchdog.closing_tidelands_attention_v5',1,'preflight.tidelands_reference_hit','Tidelands reference attention (v5)','categorical_map',null,null,'{"true":100,"false":0}'::jsonb,'higher_attention','draft','Draft v5 direct governed tidelands-reference dimension. A mapped reference raises closing due-diligence attention but is not a title opinion.'),
('watchdog.closing_flood_environment_attention_v5',1,'watchdog.flood_environment_risk_score','Flood/environment attention (v5)','identity_0_100',null,null,'{}'::jsonb,'higher_attention','draft','Draft v5 governed flood/environment screening family. It remains a single non-overlapping family.')
on conflict (feature_key,version) do nothing;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select
  m.model_key,5,m.label,m.description,m.objective,m.minimum_plan,'draft',m.profession_scope,
  jsonb_build_object(
    'signals',jsonb_build_array(
      jsonb_build_object('id','watchdog.closing_open_permit_attention_v5','role','score','weight',0.24),
      jsonb_build_object('id','watchdog.closing_deed_notice_attention_v5','role','score','weight',0.16),
      jsonb_build_object('id','watchdog.closing_cea_attention_v5','role','score','weight',0.16),
      jsonb_build_object('id','watchdog.closing_contaminated_site_attention_v5','role','score','weight',0.12),
      jsonb_build_object('id','watchdog.closing_ust_attention_v5','role','score','weight',0.08),
      jsonb_build_object('id','watchdog.closing_tidelands_attention_v5','role','score','weight',0.10),
      jsonb_build_object('id','watchdog.closing_flood_environment_attention_v5','role','score','weight',0.14),
      jsonb_build_object('id','watchdog.transaction_diligence_completion','role','confidence')
    ),
    'minimum_evidence_coverage',100,
    'recommended_actions',jsonb_build_array('review_evidence','add_to_case','create_report'),
    'requires_evidence',true,
    'input_contract','closing_granular_checked_zero_permit_v5',
    'holdout_policy',jsonb_build_object(
      'fresh_independent_labels_required',true,
      'reuse_v2_labels_as_promotion_proof',false,
      'reuse_v3_labels_as_promotion_proof',false,
      'minimum_positive_cases',5,
      'minimum_negative_cases',5,
      'minimum_unique_feature_vectors',8,
      'structural_diversity_gate_required',true
    ),
    'design_note','Immutable v5 hypothesis created without new human labels. It retains v4 weights and granular families unchanged; the only semantic change is routing open-permit attention through a governed derived marker that explicitly maps an authoritative DCA checked-no-value result to zero observed open permits. Fresh unseen human labels remain mandatory before calibration or promotion.'
  ),
  'uncalibrated',
  'DRAFT v5 DESIGN ONLY. v2 remains customer-facing; v3 failed human validation; v4 exposed checked-no-value permit coverage loss. v5 changes only that governed evidence-state treatment and requires a new structural shadow plus fresh unseen human holdout before any promotion.'
from public.intelligence_models m
where m.model_key='closing_review'
on conflict (model_key,version) do nothing;

do $$
begin
  if not exists(select 1 from public.intelligence_model_versions where model_key='closing_review' and version=5 and status='draft' and calibration_state='uncalibrated') then
    raise exception 'Closing Review v5 draft was not created';
  end if;
  if exists(select 1 from public.intelligence_models where model_key='closing_review' and version<>2) then
    raise exception 'Closing Review v5 migration attempted to move the customer-facing model pointer';
  end if;
  if not exists(select 1 from public.intelligence_model_versions where model_key='closing_review' and version=4 and status='draft' and calibration_state='uncalibrated') then
    raise exception 'Closing Review v4 must remain the frozen structural artifact';
  end if;
end $$;
