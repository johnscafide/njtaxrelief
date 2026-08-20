# NJ Assessment Uniformity COD source manifest

Captured: 2026-08-20

## Canonical metric

Watchdog `uniformity.cod_YYYY` represents the **segmented coefficient of deviation for Property Class 2 (Residential)**, keyed by the four-digit New Jersey taxing-district code.

The official NJ Division of Taxation table places the fields after YEAR in this order:

1. GENERAL COEFF
2. STRATIFIED BY CLASS: 1, 2, 4
3. SEGMENTED BY CLASS: 1, 2, 4
4. NUMBER OF SALES: class 1, 2, 4, total

Therefore the canonical Class 2 segmented COD is the sixth numeric/dash token after YEAR (zero-based token index 5 in `parse-cod-pdf.js`). Missing values printed as `-` remain `null`; they are never converted to zero.

## Authoritative source currently recovered

- Publisher: New Jersey Division of Taxation
- Publication: **Measures of Property Assessment Uniformity in New Jersey Taxing Districts — Coefficients of Deviation**
- Publication date printed in source: 2026-01-29
- Covered years in this edition: 2022, 2023, 2024, 2025
- Source index: https://www.nj.gov/treasury/taxation/lpt/statdata.shtml
- PDF: https://www.nj.gov/treasury/taxation/pdf/lpt/CoefficientDeviations.pdf

Control row, Absecon City district `0101`:

| Year | Segmented Class 2 COD |
| --- | ---: |
| 2022 | 18.09 |
| 2023 | 18.94 |
| 2024 | 16.28 |
| 2025 | 16.71 |

These values reproduce the Watchdog `property/uniformity.json` series for district `0101`.

## Historical-source boundary

No authoritative NJ Division of Taxation edition covering 2016–2021 was recovered during the 2026-08-20 source audit. The current state statistics page exposes the 2022–2025 deviation table. County reposts, third-party copies, adjacent editions, interpolation, and inferred values are not accepted as certification evidence.

Until an official NJ Division publication for a missing year is recovered and parsed, these markers remain unpromoted:

- `uniformity.cod_2016`
- `uniformity.cod_2017`
- `uniformity.cod_2018`
- `uniformity.cod_2019`
- `uniformity.cod_2020`
- `uniformity.cod_2021`

## Volatility boundary

The stored `volatility` field was independently reproduced across a broad Atlantic County sample as the population standard deviation of the available annual COD series, rounded to two decimal places. Example district `0101`: `pstdev([18.09, 18.94, 16.28, 16.71]) = 1.06` after two-decimal rounding.

`uniformity.volatility` is not promoted by this source manifest alone. Production runtime must expose it as `provider_kind=derived_governed` and pass an authenticated exact-value canary before governance promotion. The existing `nj-cod` family currently classifies the stored field as `authoritative_reference`, so the marker remains blocked pending that runtime semantic correction.
