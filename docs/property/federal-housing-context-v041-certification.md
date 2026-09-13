# Federal housing context v0.41 certification

Date: 2026-09-13

Status: **source artifact certified; runtime promotion pending authenticated production canary**.

## Governed markers

- `njplus.nj-dca-affordable-housing.low_income_cost_burden`
- `njplus.nj-dca-affordable-housing.hud_subsidized_units`
- `njplus.nj-dca-neighborhood-trends.commute_mode_mix`

## Source contracts

### Low-income cost burden

Source: HUD CHAS 2018-2022, Table 8, New Jersey county subdivisions.

Watchdog stores the percentage together with the governed numerator and denominator. A missing or zero denominator remains source-checked-no-value. No broader ACS cost-burden field is substituted.

Certified source coverage: 564/564 municipalities mapped; 562 usable values; 2 source-checked-no-value.

### HUD-subsidized units

Source: HUD Picture of Subsidized Households FY2025 project extract.

Semantics: project-level public housing and multifamily assisted units with a public project location. Tenant-based vouchers without project locations are explicitly excluded. Repeated program/sub-program rows are deduplicated by HUD project code using the maximum published `total_units` value before municipal aggregation.

Certified source controls: 1,031 NJ source rows; 844 unique project codes; 187 duplicate-code groups; 78,877 deduplicated project units; all 844 project codes assigned to one canonical Watchdog municipality; 240 municipalities have one or more project units. A municipality with no mapped HUD project is a valid zero under this project-unit semantic.

### Commute-mode mix

Source: U.S. Census Bureau ACS 2024 5-Year B08301, summary level 060 (county subdivision), using the official bulk Variance Replicate Estimate file.

Compact mutually exclusive groups:

- drive = drove alone + carpooled
- transit = public transportation excluding taxicab
- walk/bike = bicycle + walked
- work from home = worked from home
- other = taxicab/ridehail + motorcycle + other means

Each group is divided by B08301 total workers and expressed as a percentage. Missing components or denominator fail closed.

Certified source coverage: 564/564 municipalities mapped; 563 usable mixes; 1 source-checked-no-value.

## Statewide reconciliation

The source-build audit passed all gates:

- canonical Watchdog town manifest = 564
- HUD CHAS mapped districts = 564
- ACS county-subdivision mapped districts = 564
- NJOGIS municipality boundary `MUN_CODE` coverage = 564
- every deduplicated NJ HUD project code assigned to exactly one Watchdog municipality
- tenant-based vouchers without project locations excluded

The generated source artifact is `property/data/federal-housing-context-v041.json`; its audit is `property/data/federal-housing-context-v041-audit.json`.

## Runtime candidate

`supabase/functions/workbench-hydrate/federal-housing-context-provider.ts` reads the immutable certified artifact at commit `37d3e87d85d818713dac31e6145fdd41a4447008` and applies release, 564-municipality, and positive-control validation before returning any value.

`production-federal-housing-context-bootstrap.ts` layers the provider around the immutable currently certified EPA-walkability production chain. No existing production provider is replaced.

## Promotion gate

Do **not** change `data_center_provider_coverage.value_status` from `unavailable` to `live` merely because this branch is merged. Promotion requires all of the following:

1. Deploy the candidate Hydrate bootstrap without weakening existing entitlement/auth gates.
2. Run authenticated structured canaries for at least one positive municipality and the known source-checked-no-value cases.
3. Verify exact values and provider metadata for all three marker IDs.
4. Verify an existing EPA walkability marker still resolves through the wrapped production chain.
5. Verify Free/Pro callers remain not entitled to these Pro+/Teams/Developer markers.
6. Only then add a separate provider-coverage promotion migration and production evidence note.

This preserves Watchdog's fail-closed rule: source certification and runtime implementation are necessary but not sufficient to claim a marker is live.
