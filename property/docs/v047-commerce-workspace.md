# Watchdog v0.47 — commerce catalog and workspace repair

## What changed

- Professional Report Builder now accepts the six current profession presets while preserving all seven legacy preset values.
- Dashboard removes its Leaflet portfolio map when the locked Pro workspace is selected, so map panes cannot cover pricing or upgrade content.
- Locked Pro content uses document flow instead of a fixed overlay height, with a complete mobile CTA and no clipped feature list.
- Agent Intel has safer header, body and bottom spacing on desktop and phone layouts.
- Account & Billing now presents the customer-facing catalog:
  - Free — $0
  - Agent — $29/month or $290/year
  - Professional — $349/month or $3,490/year
  - Firm / API — $1,000+/month, controlled enrollment only
- Yearly billing is selected by default and represents two free months compared with monthly billing.
- Paddle checkout and webhook functions distinguish monthly and annual Agent/Professional Price IDs while retaining the stable `standard`, `pro`, `pro_plus` and `teams` authorization tiers.

## Upload paths

All files retain repository-relative paths. Upload the contents of the release ZIP into the repository root, preserving folders.

## Database deployment

Apply:

```bash
supabase db push
```

The new migration is additive and compatibility-focused:

```text
supabase/migrations/20260810031500_watchdog_v047_report_preset_compatibility.sql
```

It replaces only the `professional_reports_preset_check` constraint and accepts both legacy and current preset values. It does not rewrite existing rows.

## Paddle catalog configuration

Create four recurring Prices in Paddle Live and set these Supabase Edge Function secrets:

```text
PADDLE_PRICE_AGENT_MONTHLY
PADDLE_PRICE_AGENT_YEARLY
PADDLE_PRICE_PROFESSIONAL_MONTHLY
PADDLE_PRICE_PROFESSIONAL_YEARLY
```

Also confirm the existing Live values for:

```text
PADDLE_API_KEY
PADDLE_CLIENT_TOKEN
PADDLE_WEBHOOK_SECRET
PADDLE_ENVIRONMENT=live
BILLING_CHECKOUT_ENABLED=false
```

Then deploy:

```bash
supabase functions deploy create-checkout-session
supabase functions deploy paddle-webhook --no-verify-jwt
```

Keep `BILLING_CHECKOUT_ENABLED=false` until the controlled Live acceptance checklist in `supabase/functions/BILLING-SETUP.md` passes. Do not configure a Firm / API Price yet; that enrollment path deliberately remains gated.

## Required acceptance before public enrollment

1. Buy Agent monthly with a controlled Live account and verify the signed webhook grants `pro`.
2. Switch to Agent yearly and verify the same subscription changes Price without duplicating the subscription.
3. Upgrade to Professional monthly and then yearly; verify `pro_plus` only after signed webhook receipt.
4. Schedule cancellation, reverse it, force a failed/past-due state and verify Portal recovery.
5. Confirm duplicate and out-of-order notifications do not overwrite newer entitlement state.
6. Run the persisted Standard, Agent, Professional and Developer role suite.
7. Reconcile Paddle subscriptions to `account_entitlements` and complete the isolated restore drill.
8. Only then set `BILLING_CHECKOUT_ENABLED=true` for public traffic.

## Verification

```bash
node property/tests/v047-commerce-workspace.mjs
node property/tests/v046-production-readiness.mjs
node property/tests/security-contracts.mjs
node property/scripts/audit_access_boundaries.mjs
```

