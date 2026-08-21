# Uniformity volatility certification controls

Date: 2026-08-20

Marker: `uniformity.volatility`

## Exact deterministic contract

`uniformity.volatility` is the population standard deviation of all available, non-null annual segmented Property Class 2 residential coefficients of deviation in the governed NJ Division of Taxation COD series.

Runtime arithmetic contract:

1. Read the available numeric values from the municipality's governed COD `series`.
2. Compute the arithmetic mean across the available values.
3. Compute population variance: `sum((x - mean)^2) / N`.
4. Compute `sqrt(variance)`.
5. Round with JavaScript number semantics using `Math.round(sd * 100) / 100`.
6. If no governed annual COD value exists, return no value. Never synthesize zero.

This is a Watchdog deterministic calculation over authoritative NJ Division of Taxation inputs and must therefore report `provider_kind=derived_governed`.

## Statewide reproduction evidence

The contract was independently reconciled against the existing Watchdog uniformity artifact for every district having at least one available annual COD value: **558 / 558 matched**.

The six statewide districts with no available segmented Class 2 COD observation in the recovered 2022-2025 source remain missing and are not assigned a synthetic volatility.

## Positive control

Absecon City, district `0101`, parcel control `0101_25.01_10`:

- 2022 COD: 18.09
- 2023 COD: 18.94
- 2024 COD: 16.28
- 2025 COD: 16.71
- expected population standard deviation: **1.06**

Authenticated production certification must return:

- status `available`
- value `1.06`
- provider kind `derived_governed`
- source `Watchdog population standard deviation over NJ Division of Taxation segmented Class 2 COD series`

## Floating-point edge control

District `1345` has the two-value series `[4.74, 5.27]`. JavaScript `Number` arithmetic produces an SD of approximately `0.2649999999999997`, which `Math.round(sd * 100) / 100` stores as **0.26**. Do not add an epsilon or substitute decimal half-up rounding because that would no longer reproduce the governed statewide artifact.

## Release boundary

This document is evidence only. It does not make the marker LIVE. Production provider coverage must not move until:

1. runtime recomputes the value from the governed series;
2. runtime reports `derived_governed`;
3. the signed-in production canary passes the exact Absecon value/provenance controls;
4. provider coverage is promoted post-canary;
5. the DB-governed overlay is reconciled; and
6. Phase 5 canonical regeneration confirms the new count.

`uniformity.score`, `uniformity.percentile`, and COD 2016-2021 remain outside this certification.

Release-trigger note: this branch update intentionally exercises the scoped volatility patch workflow now that the workflow is present on the default branch.