-- NJW-143: certify the bounded NJ DCA Development Trends Viewer v0.38 batch.
-- Production canary development_trends_v038 request 3848 passed exact source/history/arithmetic/provenance assertions.

insert into public.dca_source_registry
  (source_id,source_status,source_url,source_vintage,geography_scope,join_strategy,refresh_cadence,authoritative,last_checked_at,notes)
values
  ('nj-dca-development-trends-annual-v038','live','https://www.nj.gov/dca/codes/reporter/Development_Trend_Viewer.xlsb',
   'Viewer as of 2025-08-21; latest published annual data year 2024',
   'municipality','4-digit municipality code -> governed 564-municipality annual source artifact','annual / source change monitored',true,now(),
   'Certified v0.38 annual Development Trends Viewer release. 2025 workbook columns are not treated as published annual observations because the workbook identifies 2024 as the latest data year. Current-municipality normalization excludes legacy Princeton Borough, Pine Valley and Pahaquarry; Princeton Township source row is emitted as current Princeton 1114. Existing rolling raw permit-feed coverage remains separate.')
on conflict (source_id) do update set
  source_status=excluded.source_status,source_url=excluded.source_url,source_vintage=excluded.source_vintage,
  geography_scope=excluded.geography_scope,join_strategy=excluded.join_strategy,refresh_cadence=excluded.refresh_cadence,
  authoritative=excluded.authoritative,last_checked_at=excluded.last_checked_at,notes=excluded.notes;

insert into public.derived_formula_registry
  (marker_id,engine_version,formula,dependencies,confidence,status,explanation,updated_at,operation,config)
values
  ('watchdog.njplus.rolling_5yr_housing_units_authorized','watchdog-dca-development-trends-window-v1','sum(njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024)',array['njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','sum','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.latest_yoy_housing_units_authorized_delta','watchdog-dca-development-trends-window-v1','2024(njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024) - 2023(njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024)',array['njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','latest_delta','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.rolling_5yr_new_housing_units_authorized','watchdog-dca-development-trends-window-v1','sum(njplus.nj-dca-development-trends.new_housing_units_authorized_history_2020_2024)',array['njplus.nj-dca-development-trends.new_housing_units_authorized_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','sum','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.latest_yoy_new_housing_units_authorized_delta','watchdog-dca-development-trends-window-v1','2024(njplus.nj-dca-development-trends.new_housing_units_authorized_history_2020_2024) - 2023(njplus.nj-dca-development-trends.new_housing_units_authorized_history_2020_2024)',array['njplus.nj-dca-development-trends.new_housing_units_authorized_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','latest_delta','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.rolling_5yr_construction_cost_authorized','watchdog-dca-development-trends-window-v1','sum(njplus.nj-dca-development-trends.construction_cost_authorized_history_2020_2024)',array['njplus.nj-dca-development-trends.construction_cost_authorized_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','sum','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.latest_yoy_construction_cost_authorized_delta','watchdog-dca-development-trends-window-v1','2024(njplus.nj-dca-development-trends.construction_cost_authorized_history_2020_2024) - 2023(njplus.nj-dca-development-trends.construction_cost_authorized_history_2020_2024)',array['njplus.nj-dca-development-trends.construction_cost_authorized_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','latest_delta','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.rolling_5yr_total_nonresidential_square_feet','watchdog-dca-development-trends-window-v1','sum(njplus.nj-dca-development-trends.total_nonresidential_square_feet_history_2020_2024)',array['njplus.nj-dca-development-trends.total_nonresidential_square_feet_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','sum','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.latest_yoy_total_nonresidential_square_feet_delta','watchdog-dca-development-trends-window-v1','2024(njplus.nj-dca-development-trends.total_nonresidential_square_feet_history_2020_2024) - 2023(njplus.nj-dca-development-trends.total_nonresidential_square_feet_history_2020_2024)',array['njplus.nj-dca-development-trends.total_nonresidential_square_feet_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','latest_delta','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.rolling_5yr_demolitions','watchdog-dca-development-trends-window-v1','sum(njplus.nj-dca-development-trends.demolitions_history_2020_2024)',array['njplus.nj-dca-development-trends.demolitions_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','sum','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.latest_yoy_demolitions_delta','watchdog-dca-development-trends-window-v1','2024(njplus.nj-dca-development-trends.demolitions_history_2020_2024) - 2023(njplus.nj-dca-development-trends.demolitions_history_2020_2024)',array['njplus.nj-dca-development-trends.demolitions_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','latest_delta','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.rolling_5yr_net_housing_unit_change','watchdog-dca-development-trends-window-v1','sum(njplus.nj-dca-development-trends.net_housing_unit_change_history_2020_2024)',array['njplus.nj-dca-development-trends.net_housing_unit_change_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','sum','years',jsonb_build_array(2020,2021,2022,2023,2024))),
  ('watchdog.njplus.latest_yoy_net_housing_unit_change_delta','watchdog-dca-development-trends-window-v1','2024(njplus.nj-dca-development-trends.net_housing_unit_change_history_2020_2024) - 2023(njplus.nj-dca-development-trends.net_housing_unit_change_history_2020_2024)',array['njplus.nj-dca-development-trends.net_housing_unit_change_history_2020_2024']::text[],'high','live','Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.',now(),'history_metric',jsonb_build_object('metric','latest_delta','years',jsonb_build_array(2020,2021,2022,2023,2024)))
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,
  confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,
  updated_at=excluded.updated_at,operation=excluded.operation,config=excluded.config;

with promoted(marker_id,provider_kind,source_field,calculation_key) as (
  values
  ('njplus.nj-dca-development-trends.latest_data_year','authoritative_reference','LATEST DATA YEAR',null),
  ('njplus.nj-dca-development-trends.latest_annual_housing_units_authorized','authoritative_reference','TOTAL HOUSING UNITS - BUILDING PERMITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_one_two_family_units_authorized','authoritative_reference','TOTAL 1&2 FAMILY HOUSING UNITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_multifamily_units_authorized','authoritative_reference','TOTAL MULTI-FAMILY HOUSING UNITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_mixed_use_units_authorized','authoritative_reference','TOTAL MIXED USE HOUSING UNITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_new_housing_units_authorized','authoritative_reference','TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_new_one_two_family_units_authorized','authoritative_reference','TOTAL 1&2 FAMILY HOUSING UNITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_new_multifamily_units_authorized','authoritative_reference','TOTAL MULTI-FAMILY HOUSING UNITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_new_mixed_use_units_authorized','authoritative_reference','TOTAL MIXED USE HOUSING UNITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_residential_addition_alteration_units_authorized','authoritative_reference','TOTAL RESIDENTIAL ADDITIONS/ALTERATIONS - BUILDING PERMITS',null),
  ('njplus.nj-dca-development-trends.latest_annual_construction_cost_authorized','authoritative_reference','All Construction Costs',null),
  ('njplus.nj-dca-development-trends.latest_annual_residential_new_construction_cost','authoritative_reference','Cost- Residential new construction',null),
  ('njplus.nj-dca-development-trends.latest_annual_residential_addition_alteration_cost','authoritative_reference','Cost- Residential additions and alterations',null),
  ('njplus.nj-dca-development-trends.latest_annual_nonresidential_new_construction_cost','authoritative_reference','Cost- Nonresidential new construction',null),
  ('njplus.nj-dca-development-trends.latest_annual_nonresidential_addition_alteration_cost','authoritative_reference','Cost- Nonresidential additions and alterations',null),
  ('njplus.nj-dca-development-trends.latest_annual_office_new_construction_square_feet','authoritative_reference','Office Space - New Constr. SF',null),
  ('njplus.nj-dca-development-trends.latest_annual_office_addition_square_feet','authoritative_reference','Office Space - Additions SF',null),
  ('njplus.nj-dca-development-trends.latest_annual_retail_new_construction_square_feet','authoritative_reference','Retail - New Constr. SF',null),
  ('njplus.nj-dca-development-trends.latest_annual_retail_addition_square_feet','authoritative_reference','Retail - Additions SF',null),
  ('njplus.nj-dca-development-trends.latest_annual_total_nonresidential_square_feet','authoritative_reference','Total Nonres. SF',null),
  ('njplus.nj-dca-development-trends.latest_annual_demolitions','authoritative_reference','TOTAL DEMOLITIONS',null),
  ('njplus.nj-dca-development-trends.latest_annual_one_two_family_demolitions','authoritative_reference','TOTAL DEMOLITIONS  - 1&2 Family Units',null),
  ('njplus.nj-dca-development-trends.latest_annual_multifamily_demolitions','authoritative_reference','TOTAL DEMOLITIONS  - Multifamily Units',null),
  ('njplus.nj-dca-development-trends.latest_annual_mixed_use_demolitions','authoritative_reference','TOTAL DEMOLITIONS  - Mixed Use Housing',null),
  ('njplus.nj-dca-development-trends.latest_annual_net_housing_unit_change','authoritative_reference','Net Change in Housing Units - TOTAL',null),
  ('njplus.nj-dca-development-trends.latest_annual_net_one_two_family_unit_change','authoritative_reference','Net Change in Housing Units - 1 & 2 Family',null),
  ('njplus.nj-dca-development-trends.latest_annual_net_multifamily_unit_change','authoritative_reference','Net Change in Housing Units - Multifamily',null),
  ('njplus.nj-dca-development-trends.latest_annual_net_mixed_use_unit_change','authoritative_reference','Net Change in Housing Units - Mixed-Use',null),
  ('njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024','authoritative_reference','TOTAL HOUSING UNITS - BUILDING PERMITS',null),
  ('njplus.nj-dca-development-trends.new_housing_units_authorized_history_2020_2024','authoritative_reference','TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS',null),
  ('njplus.nj-dca-development-trends.construction_cost_authorized_history_2020_2024','authoritative_reference','All Construction Costs',null),
  ('njplus.nj-dca-development-trends.total_nonresidential_square_feet_history_2020_2024','authoritative_reference','Total Nonres. SF',null),
  ('njplus.nj-dca-development-trends.demolitions_history_2020_2024','authoritative_reference','TOTAL DEMOLITIONS',null),
  ('njplus.nj-dca-development-trends.net_housing_unit_change_history_2020_2024','authoritative_reference','Net Change in Housing Units - TOTAL',null),
  ('watchdog.njplus.rolling_5yr_housing_units_authorized','derived_governed','TOTAL HOUSING UNITS - BUILDING PERMITS','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.latest_yoy_housing_units_authorized_delta','derived_governed','TOTAL HOUSING UNITS - BUILDING PERMITS','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.rolling_5yr_new_housing_units_authorized','derived_governed','TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.latest_yoy_new_housing_units_authorized_delta','derived_governed','TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.rolling_5yr_construction_cost_authorized','derived_governed','All Construction Costs','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.latest_yoy_construction_cost_authorized_delta','derived_governed','All Construction Costs','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.rolling_5yr_total_nonresidential_square_feet','derived_governed','Total Nonres. SF','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.latest_yoy_total_nonresidential_square_feet_delta','derived_governed','Total Nonres. SF','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.rolling_5yr_demolitions','derived_governed','TOTAL DEMOLITIONS','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.latest_yoy_demolitions_delta','derived_governed','TOTAL DEMOLITIONS','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.rolling_5yr_net_housing_unit_change','derived_governed','Net Change in Housing Units - TOTAL','watchdog-dca-development-trends-window-v1'),
  ('watchdog.njplus.latest_yoy_net_housing_unit_change_delta','derived_governed','Net Change in Housing Units - TOTAL','watchdog-dca-development-trends-window-v1')
)
insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select marker_id,array['municipality']::text[],'workbench-hydrate','live',
  array['nj-dca-development-trends','nj-dca-development-trends-2025-08-21-v1']::text[],now(),
  'Certified by authenticated production canary development_trends_v038 request 3848. Exact DCA annual source semantics; deterministic derived fields are only explicit five-year sums or 2024-minus-2023 deltas. No legal, zoning, code-compliance, appraisal, lending, insurance, eligibility, construction-completion, transaction, momentum, risk or priority inference.',
  provider_kind,array[source_field]::text[],calculation_key,21600,'refresh_on_demand',true
from promoted
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
