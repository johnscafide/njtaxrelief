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

A fresh deterministic parse of the official PDF on 2026-08-20 produced **564 district records**. Non-null segmented Class 2 COD coverage is:

| Year | Districts with published Class 2 COD | Statewide district records |
| --- | ---: | ---: |
| 2022 | 554 | 564 |
| 2023 | 555 | 564 |
| 2024 | 555 | 564 |
| 2025 | 553 | 564 |

The six district codes absent from the current `property/uniformity.json` convenience artifact are `0262`, `0402`, `0433`, `1326`, `1923`, and `2021`. In the official 2022–2025 publication, all six have `-` for segmented Class 2 COD in every year. Their absence therefore represents all-null rows, not lost published COD values. The canonical runtime still fails closed for those districts instead of synthesizing zero.

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

The stored `volatility` field is exactly reproducible as the **population standard deviation of all available, non-null annual COD values**, using JavaScript `Number` arithmetic and JavaScript-style rounding to two decimals. A statewide reconciliation reproduced the stored value for **558 / 558** districts that have at least one available COD value. The six all-null districts have no volatility dependency set and therefore must remain missing.

Example district `0101`: population SD of `[18.09, 18.94, 16.28, 16.71]` rounds to `1.06`. District `1345` is the binary-floating-point edge case: `[4.74, 5.27]` produces approximately `0.2649999999999997`, which JavaScript rounds to the stored `0.26` at two decimals.

`uniformity.volatility` is not promoted by formula reproduction alone. Production runtime must expose it as `provider_kind=derived_governed` and pass an authenticated exact-value canary before governance promotion. The existing `nj-cod` family currently classifies the stored field as `authoritative_reference`, so the marker remains blocked pending that runtime semantic correction.
