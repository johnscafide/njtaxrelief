-- Promote uniformity.volatility only after authenticated production canary success.
-- Control: PAMS 0101_25.01_10 / Absecon City.
-- Expected and returned value: 1.06.
-- provider_kind: derived_governed.
-- Formula: population standard deviation over all available non-null annual
-- segmented Class 2 residential COD values, rounded with JavaScript Number
-- semantics via Math.round(sd * 100) / 100.
-- Same canary preserved uniformity.cod_2022=18.09 as authoritative_reference
-- and uniformity.cod_2016 as source_checked_no_value with no synthetic zero.

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'uniformity.volatility',array['property','town'],'workbench-hydrate','live',
  array['NJ Division of Taxation Measures of Property Assessment Uniformity'],now(),
  'Watchdog population standard deviation over the available non-null annual segmented Property Class 2 residential COD series. Statewide reproduction matched 558/558 districts with at least one available COD observation. Authenticated production canary uniformity_history_v1 verified Absecon City at 1.06 with derived_governed provenance; missing COD observations remain missing rather than receiving synthetic zero values.',
  'derived_governed',array['series.2022','series.2023','series.2024','series.2025'],
  'uniformity-volatility-population-sd-v1',21600,'refresh_on_demand',false
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
