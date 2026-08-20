-- Promote the six governed NJ DCA Affordable Housing municipality markers that
-- are created by Watchdog's v3 project/trust parser rather than copied as direct
-- municipal source fields. The direct trust-fund balance was promoted separately.
--
-- Production authenticated control: 0505_824.02_12 / Lower Township
-- reporting_status=reported, units_for_sale=61, units_rental=0,
-- units_total=61, low_income_households=0, moderate_income_households=24.
-- Canary requires provider_kind=derived_governed for all six and passed with
-- zero missing, value mismatches, or provider-kind mismatches.

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'njplus.nj-dca-affordable-housing.affordable_housing_reporting_status',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Governed parser status indicating that at least one NJ DCA Affordable Housing source row resolved to the municipality. This is parser-created status, not a DCA categorical determination beyond source reporting presence.',
  'derived_governed',array['reporting_status'],'dca-affordable-housing-v3-reporting-status',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-affordable-housing.affordable_units_for_sale',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Municipality total of resolved NJ DCA project-level affordable for-sale units. Rows are summed only after governed municipality identity resolution; missing values are not invented.',
  'derived_governed',array['affordable_units_for_sale'],'dca-affordable-housing-v3-project-aggregate',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-affordable-housing.affordable_units_rental',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Municipality total of resolved NJ DCA project-level affordable rental units. Rows are summed only after governed municipality identity resolution; missing values are not invented.',
  'derived_governed',array['affordable_units_rental'],'dca-affordable-housing-v3-project-aggregate',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-affordable-housing.affordable_units_total',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Municipality total of resolved NJ DCA project-level affordable units. This is a governed aggregation of source rows, not an independently published municipal total.',
  'derived_governed',array['affordable_units_total'],'dca-affordable-housing-v3-project-aggregate',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-affordable-housing.low_income_households',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Municipality aggregate of the resolved NJ DCA project-level low-income household/unit field exposed by the governed parser. No broader municipality household-share inference is made.',
  'derived_governed',array['low_income_households'],'dca-affordable-housing-v3-project-aggregate',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-affordable-housing.moderate_income_households',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Municipality aggregate of the resolved NJ DCA project-level moderate-income household/unit field exposed by the governed parser. No broader municipality household-share inference is made.',
  'derived_governed',array['moderate_income_households'],'dca-affordable-housing-v3-project-aggregate',21600,'refresh_on_demand',true
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
