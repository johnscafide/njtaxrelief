# Watchdog NJ state-data refresh runbook

This is the canonical operator runbook for the annual and recurring New Jersey public-data refresh path used by Watchdog. It is intentionally review-first: refreshed data is validated and opened for review; it is not silently merged into production.

## Production boundary

- Repository: `johnscafide/njtaxrelief`, branch `main`.
- Production Supabase project: `uvkvaxljhhngydvlrzom`.
- The refresh path is file/build driven unless a separately governed migration explicitly requires Supabase. Do not infer a database write from a state-data refresh.
- Never publish owner names or party addresses from source material. The Data Factory privacy allow-list and existing RLS/entitlement boundaries remain authoritative.
- ROBUST / Watchdog Score model behavior is not changed by a source refresh. A model-version change requires separate governed evidence and review.

## Source authority

`property/data/source-registry.json` is the machine-readable source catalog. It records the current agency, source URL, cadence, expected materialized output, parser (when one exists), and coverage floor.

Core tax sources currently include:

| Dataset | Authority | Current source | Materialized contract |
| --- | --- | --- | --- |
| LPT publication index | NJ Division of Taxation | `https://www.nj.gov/treasury/taxation/lpt/statdata.shtml` | live health/change detection |
| COD history | NJ Division of Taxation | `https://www.nj.gov/treasury/taxation/pdf/lpt/CoefficientDeviations.pdf` | `property/data/cod/cod-history.json`, at least 550 municipalities |
| Assessment uniformity | NJ Division of Taxation | LPT statistical publications | `property/uniformity.json`, 500–564 governed districts |
| Appeals | NJ Division of Taxation | `https://www.nj.gov/treasury/taxation/lpt/lpt-appeal.shtml` | `property/appeals.json` |
| Tax rates | NJ Division of Taxation | LPT statistical publications | `property/tax-rates.json`, at least 500 municipalities |
| SR-1A ratios | NJ Division of Taxation | `https://www.nj.gov/treasury/taxation/lpt/sr1a.shtml` | `property/sr1a-ratios.json`, at least 350 districts |
| Verified sales | NJ Division of Taxation | LPT statistical publications | 21 `property/sales-*.json` county files |
| Municipal budget pressure | NJ Department of Community Affairs | `https://www.nj.gov/dca/dlgs/Property_Tax_info.shtml` | `property/data/budget-pressure.json`, at least 560 municipalities |
| Exempt/PILOT exposure | NJ Division of Taxation + NJ DCA | `https://www.nj.gov/dca/dlgs/taxabatementkit.shtml` | `property/data/exempt-pilot.json`, 564 municipalities |

The registry also contains the current governed live NJDEP/DCA/FEMA source families. Do not copy URLs from this document into code when the registry differs; the registry is the current machine-readable authority.

## Routine validation, no download

From repository root:

```bash
python3 property/scripts/refresh_state_data.py
python3 property/scripts/validate_uniformity_names.py
```

The first command validates every registered materialized dataset and probes registered live sources, then writes `property/data/data-freshness.json`. The second fails closed on the uniformity corruption class that caused NJW-16.

A valid uniformity build must satisfy all of these:

- 500–564 district rows;
- four-digit district codes;
- no municipality name beginning with `Boro `, `Twp `, or `Creek Twp `;
- no county-name bleed into municipality names;
- county present for each district;
- present score/COD values within 0–100;
- sales counts are non-negative integers;
- missing evidence may remain `null`; validation must never convert missingness to zero.

Any failure stops the refresh. Do not repair a failing dataset by weakening the floor or range check without source evidence.

## Refresh order

Run the orchestration command first. It reads parser order from `property/data/source-registry.json`, downloads only entries that have both a `source_url` and an explicit parser, then validates all registered sources again:

```bash
python3 property/scripts/refresh_state_data.py --refresh --write-version
```

The current direct parser registered for COD history is:

```bash
node property/scripts/parse-cod-pdf.js {download}
```

Other materialized sources whose upstream publication still requires manual workbooks or specialized builders are rebuilt with their documented builder rather than guessed automation. Examples already documented in the repository include:

```bash
python3 property/scripts/build_budget_pressure.py --input-dir PATH --output property/data/budget-pressure.json
python3 property/scripts/build_exempt_pilot.py PATH_TO_25ABSTRACT.xls PATH_TO_PILOT.xlsx property/data/exempt-pilot.json --abatements-output property/abatements.json
python3 property/scripts/run_data_factory.py --modiv-zip PATH --emit-normalized
python3 property/scripts/build_statewide_intelligence.py
python3 property/scripts/build_marker_registry.py
python3 property/scripts/build_derived_marker_formulas.py
```

Do not invent a parser for a source that the registry treats as validation-only, configured-reference, or live-health evidence.

## Review and deployment gate

The GitHub workflow `.github/workflows/state-data-refresh.yml` is the governed automation path.

1. It checks out current `main`.
2. It runs `refresh_state_data.py --refresh --write-version`.
3. It runs `validate_uniformity_names.py`.
4. It preserves `property/data/data-freshness.json` as workflow evidence.
5. Any parser, coverage, live-health, or uniformity-contract failure fails the run.
6. If files changed, it creates a review branch and pull request.
7. It does **not** merge automatically. Review source lineage, diff size, municipality/district coverage, and generated freshness evidence before merging.
8. After merge, verify the exact production Vercel deployment reaches `READY` and run the relevant production smoke/contract checks. Database/RLS mutation is not part of this refresh unless separately approved and evidenced.

Before any direct GitHub write outside the workflow, re-fetch current `main` and the current target-file SHA immediately before writing so concurrent work is not overwritten.

## Schedule

`.github/workflows/state-data-refresh.yml` runs on the first day of every month at 10:17 UTC. The **December 1** run is the required pre-tax-season refresh checkpoint. Monthly runs after that keep upstream drift visible; they do not redefine the December gate or auto-approve refreshed data.

The LPT publication index is also monitored for upstream change. A source-page change is an alert to inspect new state publications, not evidence that a new dataset is safe to publish.

## Acceptance checklist

A refresh is complete only when all applicable items below are true:

- official source URLs match the source registry;
- parser/build step completed without suppressed errors;
- `property/data/data-freshness.json` reports no failures;
- `validate_uniformity_names.py` passes;
- expected district/municipality/file coverage floors pass;
- no malformed municipality-name prefix or county-name bleed exists;
- no privacy-limited field has been widened;
- changed outputs are reviewed in a pull request before merge;
- exact merged commit is deployed successfully;
- ROBUST / Watchdog Score version remains unchanged unless separately governed.

If an upstream state publication changes format, stop at the failed evidence boundary, update the parser against the real publication, rerun validation, and preserve the failure/recovery evidence. Do not guess through schema drift merely to keep the refresh green.
