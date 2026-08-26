-- Close three remaining Data Center source-semantic gaps using exact live evidence.
-- No unlike field substitution: two markers are explicit cross-source aliases and
-- owner_name is repointed to the current Workbench parcel resolver that already
-- requests NJOGIS/MOD-IV OWNER_NAME for professional plans.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'njplus.nj-dca-municipal-housing-profile.housing_production',
    'watchdog-derived-v17-exact-source-aliases',
    'source_alias(njplus.nj-dca-development-trends.new_housing_units_authorized)',
    array['njplus.nj-dca-development-trends.new_housing_units_authorized']::text[],
    'high','live',
    'Municipal Housing Profile housing-production context is represented by the exact NJ DCA new-construction housing units authorized by building permits. This is an authorization/production indicator, not completed housing units.',
    'source_alias',
    jsonb_build_object('dep','njplus.nj-dca-development-trends.new_housing_units_authorized'),
    now()
  ),
  (
    'njplus.nj-dca-neighborhood-trends.real_estate_tax_median',
    'watchdog-derived-v17-exact-source-aliases',
    'source_alias(modiv_intel.median_annual_tax)',
    array['modiv_intel.median_annual_tax']::text[],
    'high','live',
    'Median real-estate-tax context reuses the governed 2026 MOD-IV municipal median annual-tax signal exactly. The source contract is Treasury/MOD-IV rather than the DCA Neighborhood Trends workbook because that workbook does not publish the requested median-tax field.',
    'source_alias',
    jsonb_build_object('dep','modiv_intel.median_annual_tax'),
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
  updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
   provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'njplus.nj-dca-municipal-housing-profile.housing_production',
    array['municipality']::text[],
    'watchdog-derived','live',
    array['nj-dca-development-trends']::text[],now(),
    'Exact alias of NJ DCA new-construction housing units authorized. This measures permitted new-housing production activity, not completions.',
    'derived_governed',
    array['njplus.nj-dca-development-trends.new_housing_units_authorized']::text[],
    'watchdog-derived-v17-exact-source-aliases',1800,'refresh_on_demand',true
  ),
  (
    'njplus.nj-dca-neighborhood-trends.real_estate_tax_median',
    array['municipality']::text[],
    'watchdog-derived','live',
    array['treasury-modiv-2026']::text[],now(),
    'Exact alias of the governed MOD-IV municipal median annual-tax signal. Source provenance is explicitly Treasury/MOD-IV because DCA Neighborhood Trends does not publish this field.',
    'derived_governed',
    array['modiv_intel.median_annual_tax']::text[],
    'watchdog-derived-v17-exact-source-aliases',21600,'refresh_on_demand',true
  ),
  (
    'property.owner_name',
    array['property']::text[],
    'workbench_resolver','live',
    array['nj-parcels-modiv']::text[],now(),
    'Professional-plan on-demand parcel resolver reads NJOGIS/MOD-IV OWNER_NAME where the statewide parcel source publishes a usable value. Missing owner values remain source_checked_no_value; no owner is inferred.',
    'authoritative_source',
    array['OWNER_NAME']::text[],
    null,21600,'refresh_on_demand',true
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
