-- Assessment vs. a recent sale, measured against the town's official
-- Chapter 123 range instead of 100% of market value.
--
-- v1 of watchdog.assessment_to_sale_ratio_review_window compared
-- assessed / sale price to a 1.0 target in both directions. NJ districts
-- assess at their own common level (often 40-90%), so ordinary homes looked
-- far "off", under-assessed homes were flagged as top concerns, and nominal
-- transfers ($1 deeds) produced ratios like 169,700%.
--
-- New derived marker (workbench-derived operation sale_chapter123_position):
--   excess = max(assessed / sale * 100 / Chapter 123 upper bound - 1, 0)
-- 0 means within or below the district range; 0.12 means 12% above it.
-- Sales under $1,000, or implying an assessment under 10% or over 300% of
-- the price, are treated as non-market transfers and give no value.
--
-- Feature v2 scores only the excess (target 0, full attention at 25% above
-- the upper bound) and keeps the eight-year sale-age guard. The shared
-- watchdog.assessment_to_sale_ratio marker is unchanged.

alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check,
  add constraint derived_formula_registry_operation_check check (operation is null or operation = any (array[
    'year_delta',
    'ratio',
    'completeness',
    'inverse',
    'permit_closure',
    'permit_activity',
    'weighted_signals',
    'signal_count',
    'signal_density',
    'weighted_scores',
    'max_scores',
    'product_scores',
    'tax_rate_position',
    'municipal_cost_absorption',
    'fiscal_resilience',
    'revaluation_pressure',
    'transaction_tax_shock',
    'investor_carry_volatility',
    'tax_reset_sensitivity',
    'marketability_drag',
    'sr1a_subject_square_feet',
    'comparable_evidence_reliability',
    'assessment_defensibility',
    'appeal_evidence_strength',
    'appeal_opportunity',
    'source_alias',
    'chapter123_field',
    'ordered_history',
    'history_metric',
    'chapter123_position',
    'assessment_component_shift',
    'parcel_record_volatility',
    'source_release_freshness',
    'sale_chapter123_position'
  ]));

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config)
values
  ('watchdog.assessment_above_chapter123_range',
   'watchdog-derived-v24-njw294',
   'max(property.assessed_value / property.sale_price * 100 / official 2026 Chapter 123 upper bound - 1, 0); sales under $1,000 or outside 10-300% of assessment excluded',
   array['property.assessed_value','property.sale_price'],
   'medium',
   'live',
   'How far a recorded sale puts the assessment above the top of the district''s official Chapter 123 common-level range. 0 means within or below the range. Screening position only; not appeal eligibility, legal advice, an appraisal, or a value conclusion.',
   'sale_chapter123_position',
   '{"assessed_dep":"property.assessed_value","sale_dep":"property.sale_price","min_sale":1000,"min_ratio_pct":10,"max_ratio_pct":300}'::jsonb)
on conflict (marker_id) do update set
  engine_version = excluded.engine_version,
  formula = excluded.formula,
  dependencies = excluded.dependencies,
  confidence = excluded.confidence,
  status = excluded.status,
  explanation = excluded.explanation,
  operation = excluded.operation,
  config = excluded.config,
  updated_at = now();

insert into public.intelligence_feature_versions
  (feature_key, version, source_key, label, transform_type, config, direction, status, explanation)
values
  ('watchdog.assessment_to_sale_ratio_review_window',
   2,
   'watchdog.assessment_above_chapter123_range',
   'Assessment above the town range, from a recent sale',
   'distance_from_target',
   '{"target":0,"full_attention_delta":0.25,"guard_min":0,"guard_max":8,"guard_source_key":"watchdog.years_since_last_sale","guard_reason":"Recorded sale age is missing, future-dated, or outside the current eight-year professional review window"}'::jsonb,
   'higher_attention',
   'preview',
   'Scores how far a recent (eight years or newer) market sale puts the assessment above the top of the district''s official Chapter 123 range. Within or below the range scores 0. Nominal transfers are excluded. This is a review signal, not a valuation or appeal determination.')
on conflict do nothing;
