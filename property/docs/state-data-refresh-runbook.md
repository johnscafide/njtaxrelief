# NJ state data refresh runbook

## Purpose

Keep Watchdog's New Jersey public-data refresh under four operator hours per week and remove the annual refresh process from tribal knowledge. This runbook covers only governed public-data refresh. It does not authorize changes to ROBUST/Watchdog Score weights, evidence thresholds, billing, entitlements, or external spend/send.

## Production boundary

- Production Supabase project: `uvkvaxljhhngydvlrzom`.
- State-source registry: `property/data/source-registry.json`.
- Refresh orchestrator: `property/scripts/refresh_state_data.py`.
- Statewide uniformity validator: `property/scripts/validate_uniformity_names.py`.
- Scheduled workflow: `.github/workflows/state-data-refresh.yml`.
- Generated freshness evidence: `property/data/data-freshness.json`.
- Automated source refreshes open a review pull request. They do not self-merge or silently promote new public data.

## Source of truth and order

The registry is the source of truth for source URLs, cadence, parser command, output path, minimum coverage, and whether an entry is a live health check or governed materialized dataset. Do not copy source URLs into one-off scripts when a registry entry exists.

The orchestrator processes registry entries in file order. Parser-backed sources are downloaded to a temporary directory and passed to the parser declared in that registry row. Current primary annual/quarterly materialized checks include Coefficient of Deviation history, uniformity, appeals, municipal tax rates, verified-sale ratios, 21 county sales files, abatements, Municipal Budget Pressure, exempt/PILOT context, and DCA affordable-housing status. Live NJDEP/DCA services are health-probed but are not treated as proof that every parcel has a matching record.

## Routine execution

The GitHub workflow runs on the first day of every month at 10:17 UTC. The December 1 run is the required pre-tax-season checkpoint; the additional monthly runs deliberately keep upstream drift visible.

For a manual run, dispatch **NJ state data refresh** in GitHub Actions. The workflow performs these steps:

1. Check out current `main`.
2. Install the PDF parser dependency.
3. Run `python3 property/scripts/refresh_state_data.py --refresh --write-version`.
4. Run `python3 property/scripts/validate_uniformity_names.py`.
5. Preserve `property/data/data-freshness.json` as a workflow artifact.
6. Fail closed on any refresh, coverage, parser, statewide-count, district-code, name-bleed, or COD-range failure.
7. If governed files changed, create a timestamped review branch and pull request for human review.

## Required validation before merge

Do not merge a refresh PR merely because files changed.

- `property/data/data-freshness.json` must report `overall_status: passed`.
- Every materialized dataset must meet its registry minimum.
- All 21 county sales files must remain present when that source family is refreshed.
- `property/uniformity.json` must contain exactly 564 four-digit district codes.
- Uniformity town names must not contain parser bleed such as `Boro`, `Twp`, or county-header text.
- Uniformity score and residential COD fields must stay inside the guarded 0–100 sanity range, and sales counts must be non-negative integers.
- Live-service health checks mean the source endpoint responded semantically; they are not parcel-coverage guarantees.
- Any new source vintage, schema shift, or unexpected municipality-count change must be investigated against the authoritative publisher before changing a validator threshold.

## Failure handling

If the workflow fails, do not weaken a threshold simply to get green CI. Read the freshness artifact and identify whether the failure is download, parser, semantic source health, materialized coverage, or statewide-uniformity validation.

If New Jersey has legitimately changed a source format or municipality count, update the parser/contract only after the authoritative source supports the change. Keep the old production artifact in place until the replacement passes validation. Never fill missing rows with statewide, county, or neighboring-town proxies unless a governed product contract explicitly allows that fallback.

If an upstream source is temporarily unavailable, record the outage and retry later. A source outage is not evidence that a marker should be changed to zero, false, or unavailable permanently.

## Review and deploy

Review the generated PR diff for data vintage, record counts, suspicious mass nulling, town-name corruption, and unexpected schema changes. Merge only after required CI passes. Normal Git/Vercel deployment then publishes static governed artifacts. Supabase changes are separate migrations and must not be inferred from a static-data refresh.

For any migration or provider-state change prompted by a new source, inspect production first, preserve RLS/provenance, and verify the resulting provider state independently before declaring it live.

## December readiness checkpoint

Before January tax-season traffic, confirm the December 1 workflow completed or run it manually, review the freshness artifact, verify the statewide uniformity contract, and confirm no open refresh PR remains unreviewed. This is the minimum pre-season data-readiness checkpoint for NJW-32.
