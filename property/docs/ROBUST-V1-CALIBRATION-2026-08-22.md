# ROBUST-v1 Calibration Decision — August 22, 2026

**Program:** NJW-270  
**Execution issue:** NJW-273  
**Canonical marker:** `watchdog.watchdog_score`  
**Model version:** `ROBUST-v1`

## Decision

Keep the current ROBUST-v1 weights unchanged:

| Dimension | Weight |
| --- | ---: |
| R — Recourse | 10% |
| O — Overassessment Position | 20% |
| B — Burden | 30% |
| U — Uniformity | 15% |
| S — Stability | 15% |
| T — Trajectory | 10% |

Do **not** create ROBUST-v2 from the current persisted cohort.

Keep the current missing-evidence rule: missing dimensions are omitted and the remaining available weights are renormalized. Do not substitute 0, 50, 100, or another synthetic value for missing evidence.

Do **not** establish a numeric-only minimum evidence gate yet. Continue reporting evidence coverage and confidence. The eventual certification gate should consider both coverage and which dimensions are actually present.

## What was tested

The current canonical observation history contained 336 ROBUST-v1 rows representing 212 unique properties when reduced to the latest observation per `pams_pin`.

The unique-property cohort covered 7 counties, 14 municipalities and 4 property-class buckets including unknown. It is therefore useful for structural sensitivity testing, but it is not a representative statewide calibration population.

### Reproducibility

All 336 persisted canonical observation rows reproduced their stored score exactly from the persisted ROBUST component evidence:

- Exact reproductions: **336 / 336**
- Mean absolute score delta: **0**
- Maximum score delta: **0**

This passes the deterministic calculation check for the persisted evidence.

### Current unique-property cohort

- Properties: **212**
- Mean score: **60.2**
- Median score: **60**
- Range: **42 to 86**
- Mean evidence coverage: **71.6%**
- Coverage range: **70% to 90%**

Band distribution:

- A: 3
- B: 9
- C: 195
- D: 5
- E: 0

Component availability:

- R: 212 / 212
- O: 21 / 212
- B: 212 / 212
- U: 212 / 212
- S: 207 / 212
- T: 0 / 212

The lack of Trajectory evidence and the limited Overassessment Position coverage are the primary reasons this cohort cannot justify a weight change.

## Weight sensitivity

Each dimension was perturbed by ±20% relative to its current weight. Non-target weights were proportionally rescaled, while missing dimensions remained omitted and available weights were renormalized.

Small perturbations produced low score and band movement. No scenario produced evidence sufficient to justify a weight change.

Notable results:

- Burden ±20% moved scores by about **1.2 to 1.3 points on average**, with less than 1.5% band migration.
- Overassessment Position ±20% moved the cohort average only slightly because O was present on 21 properties, but individual properties moved by as much as about **3.8 points**.
- Recourse, Uniformity and Stability perturbations were small in this cohort.
- Trajectory sensitivity could not be tested because T was absent for every sampled property.

### Leave-one-component-out

Removing a component entirely is intentionally more severe than a proposed production change. It helps identify structural dependence.

- Removing Burden caused a mean movement of **7.684 points**, maximum movement of **20.267**, rank correlation of **0.62874**, and 7.5% top-decile membership churn.
- Removing Overassessment Position caused a mean movement of **1.011 points** across the full cohort, but maximum movement of **20.582** where O was present, with rank correlation **0.80143**.
- Removing Stability moved scores by **2.508 points on average**.
- Removing Uniformity moved scores by **1.902 points on average**.
- Removing Recourse moved scores by **1.160 points on average**.
- Removing Trajectory had no measured effect because no sampled property had T evidence.

These results show structural influence, not that any existing weight is proven optimal.

## Missing evidence

Current renormalization was compared against three artificial imputation controls.

| Rule | Mean absolute delta | Band migration |
| --- | ---: | ---: |
| Current renormalization | 0.00 | 0.0% |
| Fill missing with 50 | 2.86 | 1.9% |
| Fill missing with 0 | 17.02 | 94.8% |
| Fill missing with 100 | 11.35 | 93.9% |

The result supports the current Score Constitution: missing evidence should not silently count as positive, negative or neutral evidence.

## Evidence gate

A numeric coverage percentage by itself is not enough to certify a score.

The current cohort demonstrates why. Most properties sit at 70% coverage because specific dimensions are missing. Removing a high-impact component can materially change a score even when the resulting numeric coverage still looks superficially acceptable.

A future score-certification rule should therefore combine:

1. total evidence coverage;
2. required or critical dimension composition;
3. source quality and recency;
4. model-version compatibility;
5. explicit insufficient-evidence behavior when the retained evidence cannot support an unqualified score.

No new numeric gate is being introduced from this calibration pass.

## Production hardening found during calibration

Calibration exposed a live scorer regression unrelated to the weights. `workbench-score` requested `living_sqft` from `property_lookups`, but that column does not exist in the production table.

The scorer was corrected without changing the ROBUST formula:

- removed the nonexistent `living_sqft` warehouse select;
- removed the unsupported PPSF fallback that depended on that nonexistent field;
- Overassessment Position now remains missing unless a real independent saved comparable value is present;
- deployed corrected `workbench-score` **v14**.

Post-fix integrity check:

- canonical ROBUST-v1 rows: **336**
- invalid flagship rows: **0**
- new legacy `watchdog.score` rows after cutover: **0**

## Next calibration cohort

Production already contains broader source material that should be used for the next non-writing calibration phase:

- `property_lookups`: **2,354 unique properties**, 19 counties, 70 municipalities, 7 property classes;
- `sr1a_subject_evidence`: **114,859 rows**, 557 districts, all 21 counties.

The next calibration batch should construct a representative dry-run cohort from these governed sources and the canonical ROBUST source files without writing new score observations merely to populate a test set.

Priority evidence gaps:

1. obtain defensible Trajectory evidence across a representative property set;
2. increase independent-value evidence for Overassessment Position;
3. stratify sampling by county, municipality and property class;
4. rerun the same deterministic harness;
5. only then evaluate whether ROBUST-v2 is warranted.

## Artifacts

- Repeatable read-only harness: `property/scripts/robust_score_calibration.sql`
- Machine-readable result: `property/data/robust-v1-calibration-2026-08-22.json`
- Canonical framework contract: `property/branding/robust-framework.json`

This calibration pass certifies the current formula as **stable enough to keep**, not as a final statistically optimized statewide model.
