insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'watchdog.improvement_ratio',
    array['property']::text[],
    'watchdog-derived',
    'live',
    array['nj-parcels-modiv']::text[],
    now(),
    'Exact deterministic improvement-assessment share: improvement assessment divided by total assessed value, expressed as a percentage. No valuation or condition inference.',
    'derived_governed',
    array['property.improvement_assessment','property.assessed_value']::text[],
    'watchdog-derived-v16-chapter123-fields',
    21600,
    'refresh_on_demand',
    false
  ),
  (
    'watchdog.chapter123_lower_bound',
    array['property']::text[],
    'chapter123-provider-v3',
    'live',
    array['nj-chapter123-2026']::text[],
    now(),
    'Official NJ Division of Taxation 2026 Chapter 123 lower common-level-range percentage for the property tax district, exposed without transformation.',
    'authoritative_reference',
    array['lower']::text[],
    'watchdog-derived-v16-chapter123-fields',
    21600,
    'refresh_on_demand',
    false
  ),
  (
    'watchdog.chapter123_upper_bound',
    array['property']::text[],
    'chapter123-provider-v3',
    'live',
    array['nj-chapter123-2026']::text[],
    now(),
    'Official NJ Division of Taxation 2026 Chapter 123 upper common-level-range percentage for the property tax district, exposed without transformation.',
    'authoritative_reference',
    array['upper']::text[],
    'watchdog-derived-v16-chapter123-fields',
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
