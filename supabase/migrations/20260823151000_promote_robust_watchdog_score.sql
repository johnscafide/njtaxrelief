-- NJW-144: reconcile the canonical Watchdog Score with the Data Center provider plane.
-- Promotion is gated on the exact governed ROBUST-v1 formula contract and the
-- authenticated production canary completed on 2026-08-23 (request 2252).

do $$
declare
  v_formula public.derived_formula_registry%rowtype;
begin
  select * into v_formula
  from public.derived_formula_registry
  where marker_id = 'watchdog.watchdog_score';

  if not found then
    raise exception 'watchdog.watchdog_score formula registry row is missing';
  end if;

  if v_formula.status <> 'live'
     or v_formula.engine_version <> 'ROBUST-v1'
     or v_formula.operation <> 'weighted_scores'
     or coalesce(v_formula.config->>'framework','') <> 'ROBUST'
     or coalesce(v_formula.config->>'model_version','') <> 'ROBUST-v1'
     or coalesce(v_formula.config->>'missing_component_policy','') <> 'omit_and_renormalize'
     or coalesce(v_formula.config->>'protected_characteristics_policy','') <> 'excluded_from_core_score'
     or coalesce((v_formula.config->'weights'->>'recourse')::numeric,-1) <> 10
     or coalesce((v_formula.config->'weights'->>'fairness')::numeric,-1) <> 20
     or coalesce((v_formula.config->'weights'->>'burden')::numeric,-1) <> 30
     or coalesce((v_formula.config->'weights'->>'uniformity')::numeric,-1) <> 15
     or coalesce((v_formula.config->'weights'->>'stability')::numeric,-1) <> 15
     or coalesce((v_formula.config->'weights'->>'trajectory')::numeric,-1) <> 10 then
    raise exception 'watchdog.watchdog_score ROBUST-v1 governance contract does not match the certified formula';
  end if;

  insert into public.data_center_provider_coverage (
    marker_id,
    scopes,
    provider_key,
    value_status,
    source_keys,
    last_verified_at,
    notes,
    provider_kind,
    source_fields,
    calculation_key,
    freshness_seconds,
    cache_policy,
    bulk_capable
  ) values (
    'watchdog.watchdog_score',
    array['property']::text[],
    'workbench-score',
    'live',
    array[
      'Watchdog ROBUST-v1 governed score',
      'NJ Division of Taxation SR-1A verified sales',
      'NJ Division of Taxation assessment uniformity',
      'NJ published equalization ratios',
      'NJ county tax appeal statistics',
      'NJ property tax rates'
    ]::text[],
    now(),
    'Canonical Watchdog Score powered by the ROBUST Framework. Authenticated production canary request 2252 passed on 2026-08-23: workbench-score returned an available numeric score with provider_kind canonical_watchdog_score, ROBUST-v1 provenance, evidence coverage, and a matching persisted observation. Missing ROBUST components remain omitted and remaining weights are renormalized; evidence coverage is reported separately.',
    'canonical_watchdog_score',
    array[
      'property.pams_pin',
      'property.assessed_value',
      'property.annual_tax',
      'property.sale_price',
      'sales.ratio',
      'uniformity.coefficient',
      'appeals.latest_win_rate_filed',
      'watchdog.revaluation_risk'
    ]::text[],
    'ROBUST-v1',
    21600,
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
end $$;
