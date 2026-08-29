-- NJW-294: promote only after authenticated production canary request 4532 passed with zero mismatches.
insert into public.data_center_provider_coverage(
  marker_id,scopes,source_keys,source_fields,provider_key,provider_kind,calculation_key,value_status,last_verified_at,freshness_seconds,cache_policy,bulk_capable,notes
) values
(
  'watchdog.njplus.parcel_record_volatility',
  array['property']::text[],
  array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2']::text[],
  array['parcel_record_change_count','property_class_history']::text[],
  'workbench-derived','derived_governed','watchdog-derived-v24-njw294','live',now(),21600,'refresh_on_demand',false,
  'Authenticated production canary request 4532 certified exact 0.0 for Absecon from 0 changed records across 5 actual consecutive MOD-IV transitions. Gaps are skipped, no years are synthesized, and the marker is not a property-condition finding.'
),
(
  'watchdog.njplus.housing_program_record_freshness',
  array['municipality']::text[],
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge']::text[],
  array['affordable_housing_reporting_status','governed workbook release 2026-07-01','declared annual refresh cadence']::text[],
  'workbench-derived','derived_governed','watchdog-derived-v24-njw294','live',now(),21600,'refresh_on_demand',false,
  'Authenticated production canary request 4532 certified 83.8 on 2026-08-29 using 59 whole days since the governed 2026-07-01 DCA workbook release over a 365-day declared annual refresh horizon. Measures source-record currency only.'
),
(
  'watchdog.njplus.pilot_revenue_concentration',
  array['municipality']::text[],
  array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026','nj-dca-user-friendly-budget','nj-dca-ufb-2025-2025-10-23-v1']::text[],
  array['Summary By Town: Total PILOT Assessed Value','Net Debt · 3 Yr. Average Property Valuation']::text[],
  'workbench-derived','derived_governed','watchdog-derived-v24-njw294','live',now(),21600,'refresh_on_demand',false,
  'Legacy marker ID retained for compatibility. Authenticated production canary request 4532 certified 8.0412% for Atlantic City from $277,093,300 DCA aggregate PILOT assessed value / $3,445,913,284.3333335 DCA UFB 3-year average property valuation. This is an assessed-value concentration proxy, not PILOT revenue, revenue share, or a forecast. Historical PILOT provider regression was independently repaired and re-certified by request 4529.'
)
on conflict(marker_id) do update set
  scopes=excluded.scopes,
  source_keys=excluded.source_keys,
  source_fields=excluded.source_fields,
  provider_key=excluded.provider_key,
  provider_kind=excluded.provider_kind,
  calculation_key=excluded.calculation_key,
  value_status=excluded.value_status,
  last_verified_at=excluded.last_verified_at,
  freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable,
  notes=excluded.notes;
