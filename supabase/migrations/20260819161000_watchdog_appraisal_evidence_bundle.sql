-- Watchdog appraisal / appeal evidence bundle.
-- Runtime prerequisite: workbench-derived-v10-appraisal-evidence.
-- Subject living area is sourced only from NJ Division of Taxation SR-1A usable sales matched by district/block/lot.
-- Chapter 123 support requires an independent public evidence anchor; no neutral fallback scores are permitted.

alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any (array[
      'year_delta','ratio','completeness','inverse','permit_closure','permit_activity',
      'weighted_signals','signal_count','signal_density','weighted_scores','max_scores',
      'tax_rate_position','municipal_cost_absorption','fiscal_resilience',
      'revaluation_pressure','transaction_tax_shock','investor_carry_volatility',
      'tax_reset_sensitivity','marketability_drag',
      'sr1a_subject_square_feet','comparable_evidence_reliability',
      'assessment_defensibility','appeal_evidence_strength','appeal_opportunity'
    ]::text[])
  );

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
values
(
  'property.square_feet','watchdog-derived-v10-appraisal-evidence',
  'Living-space square feet from the latest matched NJ Division of Taxation SR-1A verified usable sale record for the subject district/block/lot',
  array['property.pams_pin','property.block','property.lot'],
  'high','live',
  'Authoritative subject-detail projection from the privacy-minimized SR-1A usable-sale artifact. A parcel receives a value only when a verified usable sale record matches district, block, and lot and publishes positive living space; otherwise the field remains dependency_missing.',
  'sr1a_subject_square_feet','{}'::jsonb
),
(
  'watchdog.comparable_evidence_reliability','watchdog-derived-v10-appraisal-evidence',
  '45% verified-sale sample depth + 30% assessment-ratio dispersion stability + 15% source recency + 10% subject square-foot detail availability',
  array['sales.sample_size','sales.p25','sales.p75','property.square_feet'],
  'high','live',
  'Comparable-evidence reliability from NJ Division of Taxation SR-1A usable sales. Sample depth reaches 100 at 150 verified sales. Ratio-dispersion stability uses the established 0.35 p75-p25 full-risk span. Recency follows the established Watchdog scale: latest evidence year 2025 or newer = 100, 2024 = 75, older verified evidence = 45. Subject square-foot detail is an explicit availability component: present = 100, absent = 0, never a synthetic midpoint.',
  'comparable_evidence_reliability',
  '{"sample_size_dep":"sales.sample_size","p25_dep":"sales.p25","p75_dep":"sales.p75","square_feet_dep":"property.square_feet","depth_full_scale":150,"dispersion_full_risk":0.35}'::jsonb
),
(
  'watchdog.assessment_defensibility_score','watchdog-derived-v10-appraisal-evidence',
  '30% comparable evidence reliability + 25% COD-based assessment uniformity + 25% Chapter 123 within-range support + 20% independent-value-anchor availability',
  array['watchdog.comparable_evidence_reliability','property.assessed_value','uniformity.coefficient','property.square_feet'],
  'high','live',
  'Assessment defensibility screen. The independent public value anchor is municipality SR-1A median price per square foot multiplied by matched subject SR-1A living space. Chapter 123 within-range support compares the current assessment with that anchor multiplied by the official 2026 upper common-level ratio. Assessment uniformity uses an explicit IAAO-COD transform: COD at or below 15 is fully consistent and COD 35 or above is zero consistency. If the independent anchor or another required input is unavailable, the marker returns dependency_missing.',
  'assessment_defensibility',
  '{"comparable_dep":"watchdog.comparable_evidence_reliability","assessed_dep":"property.assessed_value","uniformity_dep":"uniformity.coefficient","square_feet_dep":"property.square_feet"}'::jsonb
),
(
  'watchdog.appeal_evidence_strength','watchdog-derived-v10-appraisal-evidence',
  '25% independent value anchor + 20% Chapter 123 margin + 18% verified comparable depth + 14% assessment-uniformity context + 10% county outcome context + 13% property-record completeness',
  array['property.assessed_value','sales.sample_size','uniformity.coefficient','appeals.latest_win_rate_filed','watchdog.appraisal_record_completeness','property.square_feet'],
  'high','live',
  'Appeal-evidence strength reproduces the published Watchdog evidence weights without browser fallback placeholders. The independent anchor is SR-1A municipal median price per square foot times matched subject SR-1A living space. Chapter 123 margin uses the official 2026 upper ratio. Comparable depth reaches 100 at 100 usable sales; uniformity context follows the established (COD - 10) / 15 evidence scale; county outcome uses the latest filed-appeal reduction rate; record completeness is the governed appraisal-record completeness score. Missing required evidence returns dependency_missing.',
  'appeal_evidence_strength',
  '{"assessed_dep":"property.assessed_value","sample_size_dep":"sales.sample_size","uniformity_dep":"uniformity.coefficient","appeal_outcome_dep":"appeals.latest_win_rate_filed","completeness_dep":"watchdog.appraisal_record_completeness","square_feet_dep":"property.square_feet"}'::jsonb
),
(
  'watchdog.appeal_opportunity_index','watchdog-derived-v10-appraisal-evidence',
  'Available-input normalized: 35% Chapter 123 position + 25% appeal evidence strength + 15% inverse assessment consistency + 10% county appeal outcome context + 15% estimated annual dollars at stake',
  array['property.assessed_value','property.annual_tax','uniformity.coefficient','appeals.latest_win_rate_filed','watchdog.appeal_evidence_strength','property.square_feet'],
  'high','live',
  'Appeal-opportunity triage follows the published available-input normalization rule: unavailable components are dropped and remaining weights are renormalized, while evidence coverage is returned separately in marker metadata. Chapter 123 position and annual dollars at stake are only included when a matched SR-1A subject living-space record supports an independent ppsf-based value anchor. Inverse assessment consistency uses explicit COD risk rather than an opaque fallback score. This is a screening priority, not legal advice or a probability of winning.',
  'appeal_opportunity',
  '{"assessed_dep":"property.assessed_value","tax_dep":"property.annual_tax","uniformity_dep":"uniformity.coefficient","appeal_outcome_dep":"appeals.latest_win_rate_filed","evidence_dep":"watchdog.appeal_evidence_strength","square_feet_dep":"property.square_feet"}'::jsonb
)
on conflict(marker_id) do update set
  engine_version=excluded.engine_version,
  formula=excluded.formula,
  dependencies=excluded.dependencies,
  confidence=excluded.confidence,
  status=excluded.status,
  explanation=excluded.explanation,
  operation=excluded.operation,
  config=excluded.config,
  updated_at=now();

-- Register the already-executable authoritative reference fields used by this bundle.
insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('sales.ratio',array['property','town'],'workbench-hydrate','live',array['NJ Division of Taxation SR-1A verified sales'],now(),'Municipal assessment-to-sale ratio from verified usable SR-1A sales; districts with fewer than 10 usable sales remain missing.','authoritative_reference',array['ratio'],'sr1a-reference-v1',21600,'refresh_on_demand',true),
('sales.sample_size',array['property','town'],'workbench-hydrate','live',array['NJ Division of Taxation SR-1A verified sales'],now(),'Count of verified usable SR-1A sales supporting the municipal reference statistics.','authoritative_reference',array['n'],'sr1a-reference-v1',21600,'refresh_on_demand',true),
('sales.p25',array['property','town'],'workbench-hydrate','live',array['NJ Division of Taxation SR-1A verified sales'],now(),'25th percentile assessment-to-sale ratio among verified usable SR-1A sales.','authoritative_reference',array['p25'],'sr1a-reference-v1',21600,'refresh_on_demand',true),
('sales.p75',array['property','town'],'workbench-hydrate','live',array['NJ Division of Taxation SR-1A verified sales'],now(),'75th percentile assessment-to-sale ratio among verified usable SR-1A sales.','authoritative_reference',array['p75'],'sr1a-reference-v1',21600,'refresh_on_demand',true),
('sales.ppsf',array['property','town'],'workbench-hydrate','live',array['NJ Division of Taxation SR-1A verified sales'],now(),'Municipal median verified-sale price per living square foot from usable SR-1A sales.','authoritative_reference',array['ppsf'],'sr1a-reference-v1',21600,'refresh_on_demand',true),
('uniformity.coefficient',array['property','town'],'workbench-hydrate','live',array['NJ Division of Taxation Measures of Property Assessment Uniformity'],now(),'Latest residential coefficient of deviation used for deterministic assessment-consistency transforms.','authoritative_reference',array['coefficient'],'uniformity-reference-v1',21600,'refresh_on_demand',true),
('appeals.latest_win_rate_filed',array['property','county'],'workbench-hydrate','live',array['NJ Division of Taxation property-tax appeal outcomes'],now(),'Latest county share of filed property-tax appeals resulting in assessment reductions; context only, not a forecast.','authoritative_reference',array['latest.win_rate_filed'],'appeals-reference-v1',21600,'refresh_on_demand',true),
('property.square_feet',array['property'],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified usable subject sales'],now(),'Living space from the latest verified usable SR-1A subject sale matched by district/block/lot. Missing when no matched usable sale publishes living space.','authoritative_reference',array['property.pams_pin','property.block','property.lot'],'watchdog-derived-v10-appraisal-evidence',21600,'refresh_on_demand',false),
('watchdog.comparable_evidence_reliability',array['property','town'],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified sales'],now(),'Governed comparable-evidence reliability with explicit sample-depth, ratio-dispersion, recency, and subject-detail components. Missing subject living area scores zero only for the explicit availability component.','derived_governed',array['sales.sample_size','sales.p25','sales.p75','property.square_feet'],'watchdog-derived-v10-appraisal-evidence',21600,'refresh_on_demand',false),
('watchdog.assessment_defensibility_score',array['property'],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation 2026 Chapter 123','NJ Division of Taxation Measures of Property Assessment Uniformity'],now(),'Governed assessment-defensibility screen requiring an independent SR-1A ppsf x subject-living-area anchor. Missing anchor returns dependency_missing.','derived_governed',array['watchdog.comparable_evidence_reliability','property.assessed_value','uniformity.coefficient','property.square_feet'],'watchdog-derived-v10-appraisal-evidence',21600,'refresh_on_demand',false),
('watchdog.appeal_evidence_strength',array['property'],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation 2026 Chapter 123','NJ Division of Taxation Measures of Property Assessment Uniformity','NJ Division of Taxation property-tax appeal outcomes','NJOGIS Parcels / MOD-IV Composite'],now(),'Governed appeal-evidence strength using only attributable public evidence. Missing required independent anchor or other required evidence returns dependency_missing.','derived_governed',array['property.assessed_value','sales.sample_size','uniformity.coefficient','appeals.latest_win_rate_filed','watchdog.appraisal_record_completeness','property.square_feet'],'watchdog-derived-v10-appraisal-evidence',21600,'refresh_on_demand',false),
('watchdog.appeal_opportunity_index',array['property'],'watchdog-derived','live',array['NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation 2026 Chapter 123','NJ Division of Taxation Measures of Property Assessment Uniformity','NJ Division of Taxation property-tax appeal outcomes','NJOGIS Parcels / MOD-IV Composite'],now(),'Governed available-input normalized appeal-priority screen. Marker metadata reports evidence coverage separately; no unavailable component is replaced by a neutral score.','derived_governed',array['property.assessed_value','property.annual_tax','uniformity.coefficient','appeals.latest_win_rate_filed','watchdog.appeal_evidence_strength','property.square_feet'],'watchdog-derived-v10-appraisal-evidence',21600,'refresh_on_demand',false)
on conflict(marker_id) do update set
  scopes=excluded.scopes,
  provider_key=excluded.provider_key,
  value_status=excluded.value_status,
  source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,
  notes=excluded.notes,
  provider_kind=excluded.provider_kind,
  source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;