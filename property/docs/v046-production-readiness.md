# Watchdog v0.46 production-readiness record

## What this release completes

- Immutable property snapshots and field-level diffs with source lineage.
- Material-change classification and user-specific change events.
- Pro professional reports with presets, immutable versions, print/PDF output and expiring read-only shares.
- Pro+ Data Center result sheets, saved column sets, CSV export and scheduled delivery jobs.
- A six-hour protected automation runner that safely skips when secrets are absent.
- Explicit production gates and a continuity evidence record.

## What remains blocked

The product must not describe these items as passed until evidence is stored in `platform_release_gates`:

1. `live_billing_lifecycle`: one controlled Paddle Live purchase, renewal/failure recovery, refund and cancellation.
2. `four_role_acceptance`: persisted Standard, Pro, Pro+ and Developer staging results.
3. `isolated_restore_drill`: a restore into an isolated project followed by database, storage and billing reconciliation.

## Automation configuration

Add repository secrets `WATCHDOG_AUTOMATION_URL` and `WATCHDOG_AUTOMATION_SECRET`. Use the deployed `watchdog-automation` function URL and the same secret configured on the function. The workflow never prints either value and missing configuration exits successfully with a notice rather than generating repeated failure email.

## Acceptance rule

Public paid enrollment stays closed while any of the three gates is not `passed`. Sandbox billing evidence is useful but cannot satisfy the Live gate.

## Verification record

- `report-share` and `watchdog-automation` are active in the primary Supabase project.
- The report tables expose one authenticated owner policy each after the cleanup migration; duplicate permissive policies were removed.
- Data Center provider coverage contains 11 governed live-or-partial mappings.
- Service-only operational tables intentionally grant no access to `anon` or `authenticated`. Supabase may therefore report the informational `RLS enabled, no policy` lint; this is deny-by-default, not a public-data leak.
- Newly created indexes may appear as unused until production traffic exercises the corresponding report, delivery and history paths. Review them after a representative traffic window rather than removing them during launch preparation.
