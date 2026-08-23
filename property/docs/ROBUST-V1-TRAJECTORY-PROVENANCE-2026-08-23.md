# ROBUST-v1 Trajectory Provenance Decision — 2026-08-23

## Decision

Keep the canonical **Watchdog Score powered by the ROBUST Framework** at **ROBUST-v1** with the existing R10 / O20 / B30 / U15 / S15 / T10 weights, existing score bands, and missing-dimension omission + weight renormalization.

Do **not** use `property_lookups.last_sale_price` / `last_sale_year` as sufficient Trajectory evidence. Trajectory now fails closed unless the governed SR-1A subject-evidence provider resolves a parcel-matched verified sale.

This is an evidence-lineage hardening change, not a model-weight or presentation change.

## Why this gate changed

The next non-writing calibration batch initially reproduced the current v15 Trajectory formula against `property_lookups.last_sale_*`. That appeared to make T available on 166 of the 212 latest persisted calibration properties. The resulting T signal was highly consequential: among those 166 properties, including T moved the Watchdog Score by 4.918 points on average, produced 13.9% band migration, and materially reordered rank.

That made sale provenance a required governance check before treating the result as calibration evidence.

The audit found that the broad parcel sale fields are not equivalent to the governed SR-1A subject-sale record:

- 10 latest-cohort parcels resolve to governed SR-1A subject evidence.
- All 10 are exact parcel/qualifier matches and include a verified sale.
- Only 1 of those 10 has the same sale year **and** price in `property_lookups`.
- Only 1 matches the verified sale year.
- Only 2 match the verified sale price.

The stale-field effect is visible in the diagnostic distribution. The broad gate admitted 43 pre-2000 parcel sale records; their median exploratory T was 0. Those decades-old values could therefore depress a current Watchdog Score without sufficient evidence that they represent the governed subject sale intended by the ROBUST Trajectory dimension.

An arbitrary recency cutoff was rejected. The correct boundary is provenance: use the existing governed SR-1A subject-sale provider and otherwise leave T missing.

## Strict governed cohort

Recomputing T only where `lookup_sr1a_subject_evidence` supplies the verified parcel sale leaves **10 / 212** properties with governed Trajectory evidence.

- All 10 are exact parcel matches.
- T mean: 93.7
- T median: 100
- T range: 68–100
- Mean score moves from 60.16 to 60.52 when the strict T/O evidence is incorporated in the non-writing calibration cohort.
- Mean absolute score delta: 0.38.
- Maximum individual delta: 13.
- Ten scores change and seven cross an existing band.
- Mean evidence coverage rises from 71.63% to 73.04%.
- Ten properties reach full six-dimension coverage.

The same subject-evidence path expands O — Overassessment Position from 21 to 31 properties in the bounded cohort. Those 10 added O cases also use exact parcel matches.

These 10 governed T observations are sufficient to prove the lineage path and run bounded canaries. They are **not** sufficiently representative to calibrate or change the T weight. The calibration cohort remains geographically concentrated and O/T evidence is still too sparse for a statewide model-version decision.

## Production hardening

`workbench-score` v16 now:

- attaches verified SR-1A subject sale price/year from the existing governed subject-evidence RPC;
- calculates T only from those subject sale fields;
- records source, provider version and parcel match quality in the Trajectory evidence;
- identifies the validation contract as `sr1a_verified_subject_sale_v1`;
- fails closed when governed subject-sale evidence is unavailable;
- preserves `ROBUST-v1`, weights, bands, confidence rules and missingness renormalization;
- remains JWT protected.

A static regression contract at `property/tests/robust-trajectory-evidence-contract.mjs` prevents a future fallback to `property_lookups.last_sale_*` inside the Trajectory scoring block, and the contract is registered in the Access Boundary Audit workflow.

## Governance recommendation

1. **KEEP** ROBUST-v1 weights and bands.
2. **KEEP** missing-dimension omission + renormalization.
3. **KEEP** numeric-only evidence gating uncertified; composition still matters.
4. **REQUIRE** governed parcel-level sale provenance for T.
5. **DO NOT** promote the 166 broad property-lookup candidates as calibrated Trajectory evidence.
6. **NEXT:** materially broaden SR-1A subject matching across counties, municipalities and property classes, then rerun perturbation, leave-one-out, rank/band stability and missingness analysis on that representative governed cohort.

## Artifacts

- Machine-readable result: `property/data/robust-v1-trajectory-provenance-2026-08-23.json`
- Read-only SQL harness: `property/scripts/robust_score_trajectory_provenance_calibration.sql`
- Production scorer: `supabase/functions/workbench-score/index.ts`
- Regression contract: `property/tests/robust-trajectory-evidence-contract.mjs`
