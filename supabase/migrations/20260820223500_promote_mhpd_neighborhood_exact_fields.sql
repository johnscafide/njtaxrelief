-- Promote eight municipality-level housing markers only after the authenticated
-- municipal_housing_profile_v1 production canary passed exact values and
-- provider_kind assertions on 0101_25.01_10 / Absecon.
--
-- Exact control:
-- housing_stock=3702, owner_occupied_share=79.35,
-- renter_occupied_share=20.65, vacancy_rate=4.51,
-- median_gross_rent=1807, median_home_value=286300,
-- housing_cost_burden_share=40.57, household_growth=27.48.
--
-- Source boundary: official NJ DCA 2026 Neighborhood Trends municipality
-- workbook. No Power BI scraping, ZIP-to-municipality conversion, eviction
-- inference, or housing-production alias is included.

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'njplus.nj-dca-municipal-housing-profile.housing_stock',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Official DCA 2020-24 municipality Housing Units value. Municipal Housing Profile-compatible fact sourced from the governed Neighborhood Trends workbook; no Power BI scraping or scope conversion.',
  'authoritative_reference',array['Housing Units · 2020-24 Estimate'],null,21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.owner_occupied_share',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Owner Occupied Units divided by Owner Occupied Units plus Renter-Occupied Units, multiplied by 100; cross-checked to the workbook published Homeownership Rate.',
  'derived_governed',array['Owner Occupied Units · 2020-24 Estimate','Renter-Occupied Units · 2020-24 Estimate','Homeownership Rate · 2020-24 Estimate'],
  'nj-dca-municipal-housing-profile-compat-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.renter_occupied_share',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Renter-Occupied Units divided by Owner Occupied Units plus Renter-Occupied Units, multiplied by 100.',
  'derived_governed',array['Owner Occupied Units · 2020-24 Estimate','Renter-Occupied Units · 2020-24 Estimate'],
  'nj-dca-municipal-housing-profile-compat-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.vacancy_rate',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Vacant Units divided by Housing Units, multiplied by 100, using the official 2020-24 municipality estimates.',
  'derived_governed',array['Vacant Units · 2020-24 Estimate','Housing Units · 2020-24 Estimate'],
  'nj-dca-municipal-housing-profile-compat-v1',21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.median_gross_rent',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Official DCA 2020-24 municipality Median Gross Rent, nominal dollars.',
  'authoritative_reference',array['Median Gross Rent · 2020-24 Estimate'],null,21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.median_home_value',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Official DCA 2020-24 municipality Median Home Value, nominal dollars.',
  'authoritative_reference',array['Median Home Value · 2020-24 Estimate'],null,21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.housing_cost_burden_share',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Official DCA published 2020-24 percent of municipality households housing cost-burdened.',
  'authoritative_reference',array['% of Households Housing Cost-Burdened · 2020-24 Estimate'],null,21600,'refresh_on_demand',true
),
(
  'njplus.nj-dca-municipal-housing-profile.household_growth',array['municipality'],'dca_housing_context_v1','live',
  array['NJ DCA 2026 Neighborhood Trends Database'],now(),
  'Percent change in municipality Households from 2000 to the 2020-24 estimate.',
  'derived_governed',array['Households · 2000','Households · 2020-24 Estimate'],
  'nj-dca-municipal-housing-profile-compat-v1',21600,'refresh_on_demand',true
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
