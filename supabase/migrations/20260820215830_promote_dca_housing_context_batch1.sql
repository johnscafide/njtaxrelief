-- Promote eight municipality-level DCA housing/context markers only after the
-- authenticated production customer-path canaries passed exact values.
--
-- Affordable Housing control: 0505_824.02_12 / Lower Township
-- affordable_trust_fund_balance=0, authoritative_reference.
--
-- Neighborhood Trends control: 0101_25.01_10 / Absecon City
-- population_change=20.06, housing_unit_change=26.39,
-- rental_cost_change=128.16, home_value_change=132.39,
-- household_income=73676, employment_density=513.33,
-- neighborhood_trend_year=2024.
--
-- Six other Affordable Housing fields are intentionally NOT promoted here.
-- The governed parser aggregates project-level rows and creates reporting_status,
-- so their runtime provider_kind must be corrected to derived_governed first.

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'njplus.nj-dca-affordable-housing.affordable_trust_fund_balance',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge'],now(),
  'Municipal Affordable Housing Trust Fund balance from the governed NJ DCA AHTF municipal table. Conflicting duplicate balances fail closed in the source parser instead of being picked or summed.',
  'authoritative_reference',array['affordable_trust_fund_balance'],null,21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.population_change',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Percent change from 2000 Census population to the 2020-24 ACS five-year estimate. This is a deterministic governed calculation over the cited DCA workbook fields, not a forecast.',
  'derived_governed',array['population_change'],'nj-dca-neighborhood-trends-2026-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.housing_unit_change',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Percent change from 2000 Census housing units to the 2020-24 ACS five-year estimate, calculated by the governed source builder.',
  'derived_governed',array['housing_unit_change'],'nj-dca-neighborhood-trends-2026-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.rental_cost_change',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Nominal percent change from 2000 median gross rent to the 2020-24 ACS five-year estimate. No inflation adjustment or affordability conclusion is implied.',
  'derived_governed',array['rental_cost_change'],'nj-dca-neighborhood-trends-2026-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.home_value_change',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Nominal percent change from 2000 median home value to the 2020-24 ACS five-year estimate. No appreciation forecast is implied.',
  'derived_governed',array['home_value_change'],'nj-dca-neighborhood-trends-2026-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.household_income',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  '2020-24 ACS five-year median household income as published in the governed NJ DCA 2026 Neighborhood Trends workbook.',
  'authoritative_reference',array['household_income'],null,21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.employment_density',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  '2023 total jobs divided by 2020 Census land area, expressed as jobs per square mile. Deterministic governed calculation; no employment-growth inference.',
  'derived_governed',array['employment_density'],'nj-dca-neighborhood-trends-2026-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-neighborhood-trends.neighborhood_trend_year',array['municipality'],'dca_housing_context_v1','live',
  array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database'],now(),
  '2024 endpoint year of the workbook current 2020-24 ACS estimate window. This records source vintage semantics rather than a modeled trend score.',
  'derived_governed',array['neighborhood_trend_year'],'nj-dca-neighborhood-trends-2026-v1',21600,'refresh_on_demand',true
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
