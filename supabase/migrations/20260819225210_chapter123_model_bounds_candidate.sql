alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any(array[
      'year_delta','ratio','completeness','inverse','permit_closure','permit_activity',
      'weighted_signals','signal_count','signal_density','weighted_scores','max_scores',
      'product_scores','tax_rate_position','municipal_cost_absorption','fiscal_resilience',
      'revaluation_pressure','transaction_tax_shock','investor_carry_volatility',
      'tax_reset_sensitivity','marketability_drag','sr1a_subject_square_feet',
      'comparable_evidence_reliability','assessment_defensibility','appeal_evidence_strength',
      'appeal_opportunity','source_alias','chapter123_field'
    ]::text[])
  );

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.improvement_ratio',
    'watchdog-derived-v16-chapter123-fields',
    'property.improvement_assessment / property.assessed_value * 100',
    array['property.improvement_assessment','property.assessed_value']::text[],
    'high',
    'live',
    'Improvement share of total assessment. Exact deterministic ratio over the authoritative parcel assessment components; no valuation inference.',
    'ratio',
    '{"num":"property.improvement_assessment","den":"property.assessed_value","scale":100,"precision":1}'::jsonb,
    now()
  ),
  (
    'watchdog.chapter123_lower_bound',
    'watchdog-derived-v16-chapter123-fields',
    'official 2026 Chapter 123 district lower common-level-range bound',
    array['property.pams_pin']::text[],
    'high',
    'live',
    'Source-preserving exposure of the official NJ Division of Taxation 2026 Chapter 123 lower common-level-range percentage for the property tax district.',
    'chapter123_field',
    '{"field":"lower"}'::jsonb,
    now()
  ),
  (
    'watchdog.chapter123_upper_bound',
    'watchdog-derived-v16-chapter123-fields',
    'official 2026 Chapter 123 district upper common-level-range bound',
    array['property.pams_pin']::text[],
    'high',
    'live',
    'Source-preserving exposure of the official NJ Division of Taxation 2026 Chapter 123 upper common-level-range percentage for the property tax district.',
    'chapter123_field',
    '{"field":"upper"}'::jsonb,
    now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,
  formula=excluded.formula,
  dependencies=excluded.dependencies,
  confidence=excluded.confidence,
  status=excluded.status,
  explanation=excluded.explanation,
  operation=excluded.operation,
  config=excluded.config,
  updated_at=excluded.updated_at;
