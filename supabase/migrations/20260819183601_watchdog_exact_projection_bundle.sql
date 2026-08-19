insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.consumer.ownership_record_confidence',
    'watchdog-derived-v12-score-products',
    'parcel_identity_confidence * source_authority_coverage / 100',
    array['watchdog.parcel_identity_confidence','watchdog.source_authority_coverage']::text[],
    'high',
    'live',
    'Consumer-facing public-record confidence signal. It multiplies governed parcel identity confidence by governed authoritative-source coverage. Missing either dependency leaves the signal unavailable rather than substituting a neutral value.',
    'product_scores',
    '{"items":["watchdog.parcel_identity_confidence","watchdog.source_authority_coverage"]}'::jsonb,
    now()
  ),
  (
    'watchdog.attorney.appeal_evidence_gap',
    'watchdog-derived-v12-score-products',
    '100 - evidence_chain_completeness',
    array['watchdog.evidence_chain_completeness']::text[],
    'high',
    'live',
    'Attorney-facing evidence-gap indicator equal to the exact inverse of governed appeal evidence-chain completeness. It is a public-record workflow aid, not a legal conclusion.',
    'inverse',
    '{"dep":"watchdog.evidence_chain_completeness"}'::jsonb,
    now()
  ),
  (
    'watchdog.title.parcel_match_variance',
    'watchdog-derived-v12-score-products',
    '100 - parcel_identity_confidence',
    array['watchdog.parcel_identity_confidence']::text[],
    'high',
    'live',
    'Title-facing parcel-match variance equal to the exact inverse of governed parcel identity confidence. It flags public-record reconciliation need and is not a title determination.',
    'inverse',
    '{"dep":"watchdog.parcel_identity_confidence"}'::jsonb,
    now()
  ),
  (
    'watchdog.investor.revaluation_hold_sensitivity',
    'watchdog-derived-v12-score-products',
    'revaluation_reset_exposure',
    array['watchdog.revaluation_reset_exposure']::text[],
    'high',
    'live',
    'Investor-facing projection of the already governed revaluation reset exposure into holding-period screening context. It preserves the upstream score exactly and is not investment advice.',
    'weighted_scores',
    '{"items":[{"dep":"watchdog.revaluation_reset_exposure","weight":1,"transform":"identity"}],"require_all":true}'::jsonb,
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
    'watchdog.consumer.ownership_record_confidence',
    array[]::text[],
    'watchdog-derived',
    'live',
    array[]::text[],
    now(),
    'Exact governed product of parcel identity confidence and authoritative-source coverage; fail-closed on a missing dependency.',
    'derived_governed',
    array['watchdog.parcel_identity_confidence','watchdog.source_authority_coverage']::text[],
    'watchdog-derived-v12-score-products',
    null,
    'refresh_on_demand',
    true
  ),
  (
    'watchdog.attorney.appeal_evidence_gap',
    array[]::text[],
    'watchdog-derived',
    'live',
    array[]::text[],
    now(),
    'Exact inverse of governed appeal evidence-chain completeness; no fallback or substituted score.',
    'derived_governed',
    array['watchdog.evidence_chain_completeness']::text[],
    'watchdog-derived-v12-score-products',
    null,
    'refresh_on_demand',
    true
  ),
  (
    'watchdog.title.parcel_match_variance',
    array[]::text[],
    'watchdog-derived',
    'live',
    array[]::text[],
    now(),
    'Exact inverse of governed parcel identity confidence; no fallback or substituted score.',
    'derived_governed',
    array['watchdog.parcel_identity_confidence']::text[],
    'watchdog-derived-v12-score-products',
    null,
    'refresh_on_demand',
    true
  ),
  (
    'watchdog.investor.revaluation_hold_sensitivity',
    array[]::text[],
    'watchdog-derived',
    'live',
    array[]::text[],
    now(),
    'Exact identity projection of governed revaluation reset exposure into investor holding-period screening context.',
    'derived_governed',
    array['watchdog.revaluation_reset_exposure']::text[],
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