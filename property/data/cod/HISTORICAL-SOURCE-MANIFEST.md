# Historical COD source manifest

## Canonical metric

Watchdog's historical uniformity field is the **NJ Division of Taxation segmented coefficient of deviation for Property Class 2 (residential)**. It is not the general coefficient, the stratified Class 2 coefficient, a locally recomputed coefficient, or an equalization ratio.

A blank/dash official cell remains `null`. It is never converted to zero.

## 2016–2017: directly recoverable from State-hosted county tables

The Division of Taxation continues to host its legacy county deviation tables under `https://www.nj.gov/treasury/taxation/pdf/lpt/dev<county>.pdf`. The 21 source files are:

`devatl.pdf`, `devber.pdf`, `devbur.pdf`, `devcam.pdf`, `devcap.pdf`, `devcum.pdf`, `devess.pdf`, `devglo.pdf`, `devhud.pdf`, `devhun.pdf`, `devmer.pdf`, `devmid.pdf`, `devmon.pdf`, `devmor.pdf`, `devoce.pdf`, `devpas.pdf`, `devsal.pdf`, `devsom.pdf`, `devsus.pdf`, `devuni.pdf`, `devwar.pdf`.

These tables publish 2014–2017 rows and explicitly retain separate STRATIFIED and SEGMENTED columns by classes 1, 2 and 4. Watchdog extracts only the **SEGMENTED / Class 2** column for 2016 and 2017.

The legacy PDFs identify municipalities by county/name rather than current four-digit C/D code. `build_historical_cod_2016_2017.py` therefore reconciles those names to the current `property/uniformity.json` district map. Reconciliation is exact after documented punctuation/type normalization. Fuzzy matching is prohibited. The former Pine Valley Borough row is permitted only as a legacy-only source row and is never reassigned to another current taxing district.

A release is acceptable only when all 564 current districts have an identified source row for both years (1,128 district-year identities), with zero unmatched current municipalities, zero duplicate assignments and zero ambiguous/fuzzy assignments.

### Control

Official Atlantic County table, Absecon City:
- 2016 segmented Class 2 COD: **14.02**
- 2017 segmented Class 2 COD: **14.45**

These are hard workflow controls, not hand-entered production values.

## 2020–2021: authoritative historical edition discovered, bytes not yet retained

Search indexing preserves evidence of the Division's **January 2024 statewide Coefficients of Deviation edition**, which contained years 2020–2023. The live URL is reused by the State and now serves the January 2026 edition (2022–2025), so the historical 2024 bytes must be recovered from an authoritative archive or supplied by the Division before 2020/2021 are promoted.

The search-index discovery is evidence that the publication existed; it is **not** itself a governed statewide data artifact. Watchdog must not populate statewide 2020/2021 values from search snippets.

## 2018–2019: source still unresolved

No complete authoritative statewide edition or complete State-hosted county set for 2018–2019 has yet been recovered. These markers remain PLANNED. Equalization tables, general tax rates, Chapter 123 ratios, or locally recomputed COD must not be substituted.

## Promotion rule

A historical COD year may become LIVE only after:
1. complete authoritative source bytes are available;
2. the canonical segmented Class 2 column is parsed with blanks preserved as null;
3. all current district identities reconcile without ambiguity;
4. controls pass against directly inspected official rows;
5. runtime returns the exact year value through `workbench-hydrate` as `authoritative_reference`;
6. authenticated provider-release canary passes positive and missing-value controls;
7. `data_center_provider_coverage`, DB-governed overlay and Phase 5 canonical registry agree.
