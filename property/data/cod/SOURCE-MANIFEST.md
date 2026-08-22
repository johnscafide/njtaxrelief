# NJ Assessment Uniformity COD source manifest

Captured: 2026-08-20
Updated: 2026-08-21

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

The 2026-08-20 audit did not recover an authoritative edition covering 2016–2021. A follow-up source audit on 2026-08-21 identified the State of New Jersey legacy URL `https://www.state.nj.us/treasury/taxation/pdf/lpt/CoefficientDeviations.pdf` in the public search index as an **Updated January 2024** official edition covering 2020, 2021, 2022, and 2023. Indexed rows use the same segmented Class 2 layout as the current publication; for example, district `0101` is indexed with segmented Class 2 COD 11.46 for 2020 and 12.51 for 2021.

That legacy URL now resolves to the current 2026 edition, however. The full January 2024 bytes have not been recovered into a reproducible governed artifact, so indexed snippets are discovery evidence only and are **not sufficient for statewide LIVE certification**. No value is copied from snippets into production. The current statistics page still exposes only the 2022–2025 deviation table.

Until the complete official edition for a missing year is recovered and parsed across all 564 districts, these markers remain unpromoted:

- `uniformity.cod_2016`
- `uniformity.cod_2017`
- `uniformity.cod_2018`
- `uniformity.cod_2019`
- `uniformity.cod_2020`
- `uniformity.cod_2021`

2016–2019 still have no recovered official COD edition. 2020–2021 now have an identified official historical edition, but not a reproducibly retrievable full publication. County reposts, third-party copies, interpolation, inferred values, and partial search-index snippets remain unacceptable certification evidence.

## Volatility boundary

The stored `volatility` field is exactly reproducible as the **population standard deviation of all available, non-null annual COD values**, using JavaScript `Number` arithmetic and JavaScript-style rounding to two decimals. A statewide reconciliation reproduced the stored value for **558 / 558** districts that have at least one available COD value. The six all-null districts have no volatility dependency set and therefore remain missing.

Example district `0101`: population SD of `[18.09, 18.94, 16.28, 16.71]` rounds to `1.06`. District `1345` is the binary-floating-point edge case: `[4.74, 5.27]` produces approximately `0.2649999999999997`, which JavaScript rounds to the stored `0.26` at two decimals.

`uniformity.volatility` was subsequently promoted on 2026-08-21 after production runtime classified it as `provider_kind=derived_governed` and an authenticated exact-value canary passed. Missing COD inputs are still not synthesized.


## January 2022 statewide historical recovery

- Official publication: State of New Jersey, Department of the Treasury, Division of Taxation, **Coefficients of Deviation - A Measure of Property Assessment Uniformity - 2021 Data**, updated January 2022.
- Preserved source PDF SHA-256: `b1be9418d34c111c81bdc14352053b63d049a4420659f47aa4ba94ead457ee52`.
- PDF metadata: 58 pages; title `2021 Coefficients of Deviation`; NJ Division of Taxation author; created 2022-01-27.
- Statewide contract: 564 four-digit C/D districts x 4 years (2018-2021) = 2,256 district-year rows.
- Canonical metric: **Segmented by Class / Property Class 2** coefficient of deviation.
- `0.00` is stored as null only when the official Class 2 sales count is zero. A published `0.00` with one or more Class 2 sales is preserved as a real zero.
- Absecon City (`0101`) control: 2018 `12.81`, 2019 `12.89`, 2020 `11.46`, 2021 `12.51`.
- Historical years are stored separately from the current 2022-2025 `series` so the already-certified current-period volatility marker does not silently change formula semantics.


## October 2017 county-table recovery for 2016-2017

- Official publisher: State of New Jersey, Department of the Treasury, Division of Taxation.
- Publication family: **Measures of Property Assessment Uniformity in New Jersey Taxing Districts - Coefficients of Deviation**.
- Source edition: 21 official county PDFs created October 2017 and covering 2014-2017.
- Canonical Watchdog metric: **Segmented by Class / Property Class 2 (Residential) coefficient of deviation**.
- Historical source plane: 565 municipality records. Current Watchdog identity plane: 564 districts.
- The sole retired historical identity is Pine Valley Borough, Camden County. Its 2014-2017 table is entirely blank, so it is excluded rather than merged into a current municipality.
- Missing rule: blank COD remains null. Printed `0.00` with zero Class 2 sales is null; printed `0.00` with positive Class 2 sales is preserved as an actual zero.
- 2016 current-district coverage: 550 published COD values / 564 districts; 14 source-missing.
- 2017 current-district coverage: 556 published COD values / 564 districts; 8 source-missing.
- Absecon City (`0101`) control: 2016 `14.02`, 2017 `14.45`.
- Hi-Nella Borough (`0419`) source-semantics control: 2016 is blank with one Class 2 sale and remains null; 2017 is printed `0.00` with one Class 2 sale and remains the real value `0.00`.
- The legacy 2016-2017 artifact is separate from both the January 2022 historical artifact and the current 2022-2025 series. `uniformity.volatility` therefore keeps its already-certified current-period formula semantics.

Source-file SHA-256:

- `devatl.pdf`: `900e8751e99eb34f5b3aa6bc24fd12fc289504e0833af0f2d03a447257aa13fc`
- `devber.pdf`: `676269e07ceaa773a70d35b4de7eb37fa5ee7177ba0ba288566716b23b093b45`
- `devbur.pdf`: `ff8ed6c37b62f728420582840a62f54b41bbae58f2b601c01539d5a7cc933bdb`
- `devcam.pdf`: `33a090bafb381b098d860ce70644593456bead758b467b04db5d13257f13db23`
- `devcap.pdf`: `b1b995579580b5302179c6a447685fdb25370011e84ee38b5a7baa824b7de5d3`
- `devcum.pdf`: `59de0b5db8fe7db5247129779ac58b5b877590bf43bf099a8da5cd38983a0605`
- `devess.pdf`: `ada1a039a7656fa62abf61d69b623815f2e14efa3158fa4416158dfd13876238`
- `devglo.pdf`: `789af10b09d3a0d4c79a4bd650412af24b8def356cfe85452294708686ce1f33`
- `devhud.pdf`: `92561e30690019d30f4052b74acd949de938ff04e8e235a96eea63784bf36831`
- `devhun.pdf`: `324e09d022d85303aed2b0ba2d21186e393589a2a4d2d9111482677b78324e61`
- `devmer.pdf`: `0cb23551699f936f60dfcb3f3d3dcbc38ebbaf1e2c4a36890ab82241bb9d1fc5`
- `devmid.pdf`: `eaee5172e613c009b175de78465fa39b55e48a24cf793b20103d475f898f8cab`
- `devmon.pdf`: `2350dd032c47637ae5183a193d55404ebde2abddc66ac2c64c48ac4bfc15dcac`
- `devmor.pdf`: `c1420ae154179e59ad566b168e08aa30b3dcc433d0340fa3fb058e9f83b630ad`
- `devoce.pdf`: `8473fc580f3b3206d9a7d0d03c3d0279f88b679a5acd49822dcdcae2ac8481f2`
- `devpas.pdf`: `d6f3771c23e57f1d8b64cc2e9baf5bc593bb4ed79b87bdf163260bc043db7a39`
- `devsal.pdf`: `446853eb6d9a05be51c952fbf8c0bded89e526934a6b5cea78c02fc4814dea9b`
- `devsom.pdf`: `384ac4f761b30908c2c6b1171a0050436387786cddc52b169ef551732c1fab6d`
- `devsus.pdf`: `3602e046f1b6ac1d227f0caed0b65602011d509b41f8f42f4f41659a712af760`
- `devuni.pdf`: `f0878e263f29f1b7bc9e3fa4645ead8fc54b2b6a5ff1a22ba4fedf457c5b8687`
- `devwar.pdf`: `c7947f9e7255ffa9bcd6f5a9839a4152171ebe01a5979b532de0711819a6fb86`
