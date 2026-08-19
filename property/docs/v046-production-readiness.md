# Watchdog v0.46 production-readiness record

## What this release completed

- Immutable property snapshots and field-level diffs with source lineage.
- Material-change classification and user-specific change events.
- Pro professional reports with presets, immutable versions, print/PDF output and expiring read-only shares.
- Pro+ Data Center result sheets, saved column sets, CSV export and scheduled delivery jobs.
- A six-hour protected automation runner that safely skips when secrets are absent.
- Explicit production gates and a continuity evidence record.

## Superseding launch state

This document originated during the earlier Paddle-era v0.46 release work. Its historical migration and test fixtures remain immutable evidence of what the release asserted at that time. They are **not** the current production billing authority.

Current release control uses Stripe for all new paid subscriptions and `platform_release_gates` for production evidence.

Current gate state:

1. `live_billing_lifecycle`: **blocked** until the controlled Stripe Live lifecycle in `docs/stripe-live-acceptance-runbook.md` passes.
2. `four_role_acceptance`: **passed** with persisted Standard / Pro / Pro+ / Developer staging evidence; later entitlement work also added the Agent/Teams ladder without weakening the earlier proof.
3. `isolated_restore_drill`: **passed** with persisted isolated restore/reconciliation evidence.
4. `intelligence.production_gate5`: **passed** for the private technical production Intelligence canary.
5. Supabase leaked-password protection: owner-approved initial Free-plan deferral; not a launch blocker and separately tracked for the post-10-new-users upgrade.

Public paid enrollment remains closed while `live_billing_lifecycle` is not `passed` and while the separate business/legal launch decision remains unresolved.

## Current billing authority

New subscriptions use:

- Stripe Checkout;
- Stripe Customer Portal;
- the production `stripe-webhook` signed-event boundary;
- server-owned `account_entitlements` reconciliation;
- the public `billing-price-catalog` for display/catalog consistency.

The remaining Paddle code is a legacy management path for the existing Paddle subscriber only. It must not be used as evidence for the Stripe Live launch gate and must not create new Paddle subscriptions.

## Automation configuration

Add repository secrets `WATCHDOG_AUTOMATION_URL` and `WATCHDOG_AUTOMATION_SECRET` when protected automation is intentionally enabled. Use the deployed `watchdog-automation` function URL and the same secret configured on the function. The workflow never prints either value and missing configuration exits successfully with a notice rather than generating repeated failure email.

## Acceptance rule

Public paid enrollment stays fail-closed until the current Stripe Live gate is passed. Historical Paddle or sandbox billing evidence cannot satisfy that gate.

## Verification record

- The v0.46 property-history/report/Data Center objects remain part of the production schema history.
- Service-only operational tables intentionally grant no access to `anon` or `authenticated`. Supabase may therefore report the informational `RLS enabled, no policy` lint; this is deny-by-default, not a public-data leak.
- Newly created indexes may appear as unused until production traffic exercises the corresponding report, delivery and history paths. Review them after a representative traffic window rather than removing them during launch preparation.
- The current production launch path and rollback controls are documented in `docs/stripe-live-acceptance-runbook.md` and `docs/watchdog-intelligence-production-runbook.md`.