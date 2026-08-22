# Watchdog v0.47 — commerce catalog and workspace repair

> **Historical release record — not current billing authority.** This document records the Paddle-era v0.47 implementation and its then-current prices. It is retained as release chronology. New Watchdog subscriptions are now Stripe-authoritative. For current pricing and launch instructions use `docs/billing-launch-status.md`, `docs/v046-production-readiness.md`, and `docs/stripe-live-acceptance-runbook.md`. Do not configure new Paddle products or use the prices below as current customer-facing pricing.

## What changed in v0.47

- Professional Report Builder accepted the six then-current profession presets while preserving all seven legacy preset values.
- Dashboard removed its Leaflet portfolio map when the locked Pro workspace was selected, so map panes could not cover pricing or upgrade content.
- Locked Pro content used document flow instead of a fixed overlay height, with a complete mobile CTA and no clipped feature list.
- Agent Intel received safer header, body and bottom spacing on desktop and phone layouts.
- Account & Billing at that historical release presented:
  - Free — $0
  - Agent — $29/month or $290/year
  - Professional — $349/month or $3,490/year
  - Firm / API — $1,000+/month, controlled enrollment only
- Yearly billing was selected by default and represented two free months compared with monthly billing.
- Paddle checkout and webhook functions distinguished monthly and annual Agent/Professional Price IDs while retaining the stable authorization-tier concepts then in use.

These prices and provider instructions are superseded. Current production pricing is Free / Agent $59 / Pro $129 / Pro+ $399 monthly, with the corresponding yearly catalog defined by the current Stripe billing contract.

## Historical upload paths

All files retained repository-relative paths. The historical release ZIP was intended to be uploaded into the repository root, preserving folders.

## Historical database deployment

The v0.47 database instruction was:

```bash
supabase db push
```

The additive compatibility migration was:

```text
supabase/migrations/20260810031500_watchdog_v047_report_preset_compatibility.sql
```

It replaced only the `professional_reports_preset_check` constraint and accepted both legacy and then-current preset values. It did not rewrite existing rows.

## Historical Paddle catalog configuration — superseded

The following instructions describe the v0.47 Paddle-era launch path and **must not be executed for new Watchdog subscriptions**.

At that time, the release expected four recurring Paddle prices and these Edge Function secrets:

```text
PADDLE_PRICE_AGENT_MONTHLY
PADDLE_PRICE_AGENT_YEARLY
PADDLE_PRICE_PROFESSIONAL_MONTHLY
PADDLE_PRICE_PROFESSIONAL_YEARLY
```

It also expected:

```text
PADDLE_API_KEY
PADDLE_CLIENT_TOKEN
PADDLE_WEBHOOK_SECRET
PADDLE_ENVIRONMENT=live
BILLING_CHECKOUT_ENABLED=false
```

and deployment of the then-current checkout and Paddle webhook functions.

That provider path is now historical. The remaining Paddle runtime exists only for the existing legacy Paddle subscriber and cannot satisfy the current Stripe Live release gate.

## Historical v0.47 acceptance checklist — superseded

The original release required controlled Paddle purchase, interval change, Professional upgrade, cancellation/reversal, failed/past-due recovery, idempotency checks, role acceptance, Paddle reconciliation, and an isolated restore drill before public enrollment.

Those historical assertions remain useful audit evidence, but the current paid-enrollment acceptance authority is `docs/stripe-live-acceptance-runbook.md` and Linear NJW-42.

## Historical verification commands

```bash
node property/tests/v047-commerce-workspace.mjs
node property/tests/v046-production-readiness.mjs
node property/tests/security-contracts.mjs
node property/scripts/audit_access_boundaries.mjs
```

These commands remain release-history checks; they do not by themselves satisfy the current Stripe Live lifecycle gate.
