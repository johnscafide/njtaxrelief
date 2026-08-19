alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any (array[
      'year_delta'::text,
      'ratio'::text,
      'completeness'::text,
      'inverse'::text,
      'permit_closure'::text,
      'permit_activity'::text,
      'weighted_signals'::text,
      'signal_count'::text,
      'signal_density'::text,
      'weighted_scores'::text,
      'max_scores'::text,
      'product_scores'::text,
      'tax_rate_position'::text,
      'municipal_cost_absorption'::text,
      'fiscal_resilience'::text,
      'revaluation_pressure'::text,
      'transaction_tax_shock'::text,
      'investor_carry_volatility'::text,
      'tax_reset_sensitivity'::text,
      'marketability_drag'::text,
      'sr1a_subject_square_feet'::text,
      'comparable_evidence_reliability'::text,
      'assessment_defensibility'::text,
      'appeal_evidence_strength'::text,
      'appeal_opportunity'::text
    ])
  );

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.seller_appeal_opportunity_signal',
    'watchdog-derived-v12-score-products',
    'appeal_opportunity_index * evidence_chain_completeness / 100',
    array['watchdog.appeal_opportunity_index','watchdog.evidence_chain_completeness']::text[],
    'high',
    'live',
    'Agent-facing screening signal that discounts the governed appeal-opportunity score by the current verified evidence-chain coverage. It is not a legal or appeal outcome determination.',
    'product_scores',
    '{"items":["watchdog.appeal_opportunity_index","watchdog.evidence_chain_completeness"]}'::jsonb,
    now()
  ),
  (
    'watchdog.permit_collateral_completion',
    'watchdog-derived-v12-score-products',
    'permit_closure_confidence * source_authority_coverage / 100',
    array['watchdog.permit_closure_confidence','watchdog.source_authority_coverage']::text[],
    'high',
    'live',
    'Lender-facing screening signal that combines governed permit lifecycle completion with authoritative public-source coverage. It is not a lending, title, legal, or appraisal determination.',
    'product_scores',
    '{"items":["watchdog.permit_closure_confidence","watchdog.source_authority_coverage"]}'::jsonb,
    now()
  )
on conflict (marker_id) do update set
  engine_version = excluded.engine_version,
  formula = excluded.formula,
  dependencies = excluded.dependencies,
  confidence = excluded.confidence,
  status = excluded.status,
  explanation = excluded.explanation,
  operation = excluded.operation,
  config = excluded.config,
  updated_at = excluded.updated_at;

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'watchdog.seller_appeal_opportunity_signal',
    array[]::text[],
    'watchdog-derived',
    'live',
    array[]::text[],
    now(),
    'Governed agent screening signal: appeal opportunity multiplied by verified evidence-chain completeness; exact normalized score product and fail-closed on a missing dependency.',
    'derived_governed',
    array['watchdog.appeal_opportunity_index','watchdog.evidence_chain_completeness']::text[],
    'watchdog-derived-v12-score-products',
    null,
    'refresh_on_demand',
    true
  ),
  (
    'watchdog.permit_collateral_completion',
    array[]::text[],
    'watchdog-derived',
    'live',
    array[]::text[],
    now(),
    'Governed lender screening signal: permit closure confidence multiplied by authoritative source coverage; exact normalized score product and fail-closed on a missing dependency.',
    'derived_governed',
    array['watchdog.permit_closure_confidence','watchdog.source_authority_coverage']::text[],
    'watchdog-derived-v12-score-products',
    null,
    'refresh_on_demand',
    true
  )
on conflict (marker_id) do update set
  scopes = excluded.scopes,
  provider_key = excluded.provider_key,
  value_status = excluded.value_status,
  source_keys = excluded.source_keys,
  last_verified_at = excluded.last_verified_at,
  notes = excluded.notes,
  provider_kind = excluded.provider_kind,
  source_fields = excluded.source_fields,
  calculation_key = excluded.calculation_key,
  freshness_seconds = excluded.freshness_seconds,
  cache_policy = excluded.cache_policy,
  bulk_capable = excluded.bulk_capable;