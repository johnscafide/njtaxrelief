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
      'appeal_opportunity','source_alias'
    ]::text[])
  );

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values (
  'njplus.nj-dca-pilot-forecast.pilot_project_assessment',
  'watchdog-derived-v14-source-alias',
  'pilot_assessed_value',
  array['exemption.pilot_assessed_value']::text[],
  'high',
  'live',
  'Source-preserving semantic alias for the NJ DCA 2026 PILOT Summary By Town assessed-value field already carried by the governed PILOT aggregate. The value is passed through without transformation; missing upstream evidence remains dependency_missing.',
  'source_alias',
  '{"dep":"exemption.pilot_assessed_value"}'::jsonb,
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

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values (
  'njplus.nj-dca-pilot-forecast.pilot_project_assessment',
  array['municipality']::text[],
  'watchdog-derived',
  'live',
  array['nj-dca-pilot-forecast','nj-abstract-pilot']::text[],
  now(),
  'Exact source-preserving alias to the governed NJ DCA 2026 PILOT assessed-value field. No transformation or inferred financial denominator. Bulk remains uncertified until a production batch test passes.',
  'authoritative_reference',
  array['exemption.pilot_assessed_value']::text[],
  'watchdog-derived-v14-source-alias',
  21600,
  'refresh_on_demand',
  false
)
on conflict (marker_id) do update set
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