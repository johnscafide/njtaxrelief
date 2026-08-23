# ROBUST-v1 Evidence-Gate Calibration Addendum — 2026-08-23

Issues: NJW-273 / NJW-270

## Decision

Keep the current Watchdog Score / ROBUST-v1 weights, bands and missing-evidence renormalization unchanged.

Do **not** introduce a numeric-only minimum evidence gate from the currently persisted cohort. The next production certification rule must be composition-aware and must be calibrated on materially broader real evidence, especially Trajectory and Overassessment Position.

This addendum is calibration evidence only. It does not change the public score model or presentation bands.

## Production state checked

- Canonical marker: `watchdog.watchdog_score`
- Canonical model: `ROBUST-v1`
- Weights: R10 / O20 / B30 / U15 / S15 / T10
- Persisted canonical observations: 336 rows / 212 unique properties
- Latest-property mean Score: 60.16
- Latest-property mean evidence coverage: 71.63%
- Active scorer: `workbench-score` v15, JWT required
- Legacy `watchdog.score` rows remain retained for audit/history; no model cutover or deletion was performed in this batch.

## Component composition is the gate problem

The latest persisted property cohort has only three observed evidence compositions:

| Composition | Meaning | Coverage | Properties | Mean score |
|---|---|---:|---:|---:|
| `R-BUS-` | O and T missing | 70% | 191 | 59.68 |
| `ROBUS-` | T missing | 90% | 16 | 61.19 |
| `ROBU--` | S and T missing | 75% | 5 | 75.20 |

Availability remains R 212, O 21, B 212, U 212, S 207, T 0.

The numeric percentage alone therefore hides very different unresolved evidence. A 75% observation can be missing Stability + Trajectory while a 70% observation can be missing Overassessment Position + Trajectory. Those are not equivalent calibration states.

## Missing-dimension completion stress

For each property, observed ROBUST dimensions were held fixed and every missing dimension was completed at 0 and at 100. The result is a structural uncertainty bound only. It is **not** a proposed imputation rule and does not replace current renormalization.

| Composition | Unresolved full-weight range | Band stable under both extremes |
|---|---:|---:|
| `R-BUS-` | 30 points | 0 / 191 |
| `ROBUS-` | 10 points | 5 / 16 |
| `ROBU--` | 25 points | 0 / 5 |

This reinforces the Phase 1 conclusion: coverage percentage by itself is not a defensible certification gate. Even the 90% composition can cross the current displayed band for 11 of 16 properties under the structural extremes.

## Segment evidence

Only segments with at least five observations were treated as reportable calibration evidence.

- Camden County: n=196, mean Score 59.79, median 60, mean coverage 70.94%, O present on 10, T present on 0.
- Gloucester County: n=11, mean Score 59.27, median 55, mean coverage 80.91%, O present on 6, T present on 0.
- Property class 2: n=204, mean Score 60.15, median 60, mean coverage 71.35%, O present on 16, T present on 0.

The remaining counties/classes are too sparse to use as stable segment calibration evidence. The cohort remains too concentrated to justify a statewide evidence gate or any ROBUST-v2 weight decision.

## Score-history governance reconciliation

Production `score_observations` still contains additional internal/legacy fields, including `user_id`, `observed_on`, `evidence_coverage`, `inputs` and `formula`. The governed browser history projection remains:

`pams_pin, marker_id, score, observed_at, model_version`

Authenticated SELECT access is still protected by RLS using `auth.uid() = user_id`. That boundary was not weakened or changed. Browser consumers should continue to request only the governed history projection and should not duplicate the ownership predicate in client code.

This corrects the stale description that the physical production table itself contains only five columns. The five-column shape is the client history contract, not the full physical schema.

## Governance outcome

No evidence in this batch supports changing:

- ROBUST-v1 weights
- A/B/C/D/E bands
- missing-dimension omission + weight renormalization
- model version
- production evidence gate

The next calibration batch should use a representative non-writing cohort with observed Trajectory and materially broader independent Overassessment Position evidence. Only then should the same perturbation, leave-one-out, missingness, rank, band and segment tests be rerun for a possible versioned model decision.

## Reproducibility

Machine-readable result:
`property/data/robust-v1-evidence-gate-2026-08-23.json`

Read-only harness:
`property/scripts/robust_score_evidence_gate_calibration.sql`
