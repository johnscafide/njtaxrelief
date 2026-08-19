insert into public.derived_formula_registry (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
(
  'watchdog.parcel_identity_confidence',
  'watchdog-derived-v11-subject-index',
  'checked(address, municipality, block, lot, qualifier, PAMS_PIN) / 6 * 100',
  array['property.address','property.municipality','property.block','property.lot','property.qualifier','property.pams_pin']::text[],
  'high',
  'live',
  'Parcel identity evidence coverage across the six defined authoritative parcel identifiers. A source-checked blank qualifier counts as verified no-value rather than missing identity evidence.',
  'completeness',
  '{"mode":"checked"}'::jsonb,
  now()
),
(
  'watchdog.evidence_chain_completeness',
  'watchdog-derived-v11-subject-index',
  'verified required evidence source families / 5 * 100',
  array['property.pams_pin','sales.sample_size','uniformity.coefficient','appeals.latest_win_rate_filed','watchdog.chapter123_common_ratio']::text[],
  'high',
  'live',
  'Coverage of the five authoritative evidence families used by the governed appeal/appraisal evidence path: parcel identity, verified SR-1A sales, assessment uniformity, appeal outcomes, and Chapter 123.',
  'completeness',
  '{"mode":"checked","requirements":["property.pams_pin","sales.sample_size","uniformity.coefficient","appeals.latest_win_rate_filed","watchdog.chapter123_common_ratio"]}'::jsonb,
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

insert into public.data_center_provider_coverage (
  marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
  provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable
)
values
(
  'watchdog.parcel_identity_confidence',
  array[]::text[],
  'watchdog-derived',
  'live',
  array['NJ MOD-IV','NJOGIS Parcels']::text[],
  now(),
  'Governed parcel-identity evidence coverage using checked authoritative parcel fields; legitimate source-checked blank qualifiers are not penalized as missing.',
  'derived_governed',
  array['property.address','property.municipality','property.block','property.lot','property.qualifier','property.pams_pin']::text[],
  'watchdog-derived-v11-subject-index',
  null,
  'refresh_on_demand',
  true
),
(
  'watchdog.evidence_chain_completeness',
  array[]::text[],
  'watchdog-derived',
  'live',
  array['NJ MOD-IV / NJOGIS Parcels','NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation Measures of Property Assessment Uniformity','NJ Division of Taxation property-tax appeal outcomes','NJ Division of Taxation 2026 Chapter 123']::text[],
  now(),
  'Governed evidence-source completeness across the five required appeal/appraisal evidence families. Measures source support, not legal or appraisal sufficiency.',
  'derived_governed',
  array['property.pams_pin','sales.sample_size','uniformity.coefficient','appeals.latest_win_rate_filed','watchdog.chapter123_common_ratio']::text[],
  'watchdog-derived-v11-subject-index',
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