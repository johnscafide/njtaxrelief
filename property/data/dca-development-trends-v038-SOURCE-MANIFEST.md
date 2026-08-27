# NJ DCA Development Trends Viewer v0.38 source manifest

## Source identity

- Source: New Jersey Department of Community Affairs, Development Trends Viewer
- Source SHA-256: `2ab94e5880e9ee9cd90bed18ef21a7af3c999245b1454c1513cdc35d6239b5ac`
- Workbook cover date: **As of 8/21/2025**
- Governed source release: `nj-dca-development-trends-2025-08-21-v1`
- Latest published annual data year used by Watchdog: **2024**
- Governed sheet: `Source Data`
- Municipality coverage: **564 current municipalities**

The workbook contains a 2025 column, but its active-viewer metadata identifies 2024 as the latest data year. Watchdog does not present 2025 zero placeholders as published annual observations.

## Source glossary preserved

The workbook defines housing units as dwelling units authorized by construction permits; new construction as permits authorizing a new structure; net new housing units as new-construction units authorized less units demolished; and square feet as estimated building area reported on permits for new construction and additions. Preliminary figures are monthly-reported sums subject to revision after adjusted annual totals.

Watchdog does not convert these facts into a legal, zoning, code-compliance, appraisal, lending, insurance, eligibility, construction-completion, or transaction determination.

## Municipality normalization

1. Princeton Borough `1109` is excluded.
2. Princeton Township source row `1110` is emitted as current Princeton `1114`.
3. Pine Valley `0429` is excluded because the workbook directs users to Pine Hill.
4. Pahaquarry `2118` is excluded because the NJ Division of Taxation Assessors Handbook confirms it was dissolved and incorporated into Hardwick Township in 1997.
5. `9999` State Buildings is excluded because it is not a municipality.

No other municipality remapping is inferred.

## Certified direct 2024 fields

- `latest_annual_housing_units_authorized` — TOTAL HOUSING UNITS - BUILDING PERMITS (category code 100000)
- `latest_annual_one_two_family_units_authorized` — TOTAL 1&2 FAMILY HOUSING UNITS (category code 200000)
- `latest_annual_multifamily_units_authorized` — TOTAL MULTI-FAMILY HOUSING UNITS (category code 300000)
- `latest_annual_mixed_use_units_authorized` — TOTAL MIXED USE HOUSING UNITS (category code 400000)
- `latest_annual_new_housing_units_authorized` — TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS (category code 600000)
- `latest_annual_new_one_two_family_units_authorized` — TOTAL 1&2 FAMILY HOUSING UNITS (category code 700000)
- `latest_annual_new_multifamily_units_authorized` — TOTAL MULTI-FAMILY HOUSING UNITS (category code 800000)
- `latest_annual_new_mixed_use_units_authorized` — TOTAL MIXED USE HOUSING UNITS (category code 900000)
- `latest_annual_residential_addition_alteration_units_authorized` — TOTAL RESIDENTIAL ADDITIONS/ALTERATIONS - BUILDING PERMITS (category code 1000000)
- `latest_annual_construction_cost_authorized` — All Construction Costs (category code 1400000)
- `latest_annual_residential_new_construction_cost` — Cost- Residential new construction (category code 1500000)
- `latest_annual_residential_addition_alteration_cost` — Cost- Residential additions and alterations (category code 1600000)
- `latest_annual_nonresidential_new_construction_cost` — Cost- Nonresidential new construction (category code 1700000)
- `latest_annual_nonresidential_addition_alteration_cost` — Cost- Nonresidential additions and alterations (category code 1800000)
- `latest_annual_office_new_construction_square_feet` — Office Space - New Constr. SF (category code 1900000)
- `latest_annual_office_addition_square_feet` — Office Space - Additions SF (category code 2000000)
- `latest_annual_retail_new_construction_square_feet` — Retail - New Constr. SF (category code 2100000)
- `latest_annual_retail_addition_square_feet` — Retail - Additions SF (category code 2200000)
- `latest_annual_total_nonresidential_square_feet` — Total Nonres. SF (category code 1850000)
- `latest_annual_demolitions` — TOTAL DEMOLITIONS (category code 3600000)
- `latest_annual_one_two_family_demolitions` — TOTAL DEMOLITIONS  - 1&2 Family Units (category code 3700000)
- `latest_annual_multifamily_demolitions` — TOTAL DEMOLITIONS  - Multifamily Units (category code 3800000)
- `latest_annual_mixed_use_demolitions` — TOTAL DEMOLITIONS  - Mixed Use Housing (category code 3900000)
- `latest_annual_net_housing_unit_change` — Net Change in Housing Units - TOTAL (category code 4000000)
- `latest_annual_net_one_two_family_unit_change` — Net Change in Housing Units - 1 & 2 Family (category code 4100000)
- `latest_annual_net_multifamily_unit_change` — Net Change in Housing Units - Multifamily (category code 4200000)
- `latest_annual_net_mixed_use_unit_change` — Net Change in Housing Units - Mixed-Use (category code 4300000)

`latest_data_year = 2024` is exposed from the workbook metadata.

## Certified 2020–2024 source series

- `housing_units_authorized` — TOTAL HOUSING UNITS - BUILDING PERMITS
- `new_housing_units_authorized` — TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS
- `construction_cost_authorized` — All Construction Costs
- `total_nonresidential_square_feet` — Total Nonres. SF
- `demolitions` — TOTAL DEMOLITIONS
- `net_housing_unit_change` — Net Change in Housing Units - TOTAL

The six history markers may support only deterministic governed arithmetic such as explicit five-year sums and latest-year deltas. Weighted or qualitative momentum, priority, risk, or compliance scores are not certified by this source contract.

## Quality gates

- All 27 selected 2024 numeric measures are numeric for all 564 normalized municipalities.
- All six retained 2020–2024 annual series are numeric for all 564 normalized municipalities.
- Missing source observations remain missing; runtime providers must not substitute synthetic zero.
- Existing property-level permit/certificate facts from the raw DCA permit provider remain separate and are not replaced by this annual municipality source.
