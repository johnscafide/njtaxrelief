-- Promote watchdog.njplus.affordable_supply_coverage only after authenticated production certification.
-- Canary request 1444, control parcel 0505_824.02_12 (Lower Township, Cape May County).
-- Exact result: 61 / max(0,1) = 61; provider_kind=derived_governed; zero assertion mismatches.

insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values (
  'watchdog.njplus.affordable_supply_coverage',
  array['property','town'],
  'watchdog-derived',
  'live',
  array['nj-dca-affordable-housing'],
  now(),
  'Exact governed ratio affordable_units_total / max(low_income_households, 1). Authenticated production derived_exact_v1 canary request 1444 verified Lower Township control parcel 0505_824.02_12 at value 61 with provider_kind derived_governed and zero assertion mismatches. Missing dependencies remain missing; the denominator floor is applied only to a published numeric denominator.',
  'derived_governed',
  array['njplus.nj-dca-affordable-housing.affordable_units_total','njplus.nj-dca-affordable-housing.low_income_households'],
  'watchdog-derived-v16-chapter123-fields',
  21600,
  'refresh_on_demand',
  false
)
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
