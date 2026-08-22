# Watchdog Stripe billing setup

Stripe is the selected production subscription provider for Watchdog. New paid enrollment uses Stripe-hosted Checkout, verified Stripe webhooks, and Stripe Customer Portal. Paddle is legacy-only during migration and must not create new Watchdog subscriptions.

The customer-facing paid tiers are distinct server authorization tiers:

| Offer | Server tier | Monthly | Yearly | Property capacity |
| --- | --- | ---: | ---: | ---: |
| Standard | `standard` | $0 | $0 | base/free limits |
| Agent | `agent` | $59 | $590 | 25 |
| Pro | `pro` | $129 | $1,290 | 250 |
| Pro+ | `pro_plus` | $399 | $3,990 | 2,500 |
| Teams | `teams` | Not open | Not open | gated |

Teams enrollment remains intentionally closed until the separate Teams sales/contracting path is approved.

For the canonical production Live acceptance sequence, use `property/docs/stripe-live-acceptance-runbook.md` and Linear NJW-42.

## Environment configuration

Configure credentials only as Supabase Edge Function secrets. Test/staging and Live values must never be mixed.

Required secret credentials for production Live acceptance:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`

Operational configuration:

- `PUBLIC_SITE_URL` — canonical public site/return URL. The runtime currently has a legacy production fallback, but the final domain cutover must set this explicitly.
- `BILLING_CHECKOUT_MODE` — explicit `closed`, `controlled`, or `open` operator override when needed.
- `BILLING_CONTROLLED_USER_IDS` — comma-separated Supabase user IDs permitted while checkout mode is `controlled` when the environment override is used.

Optional Stripe Price-ID overrides:

- `STRIPE_PRICE_AGENT_MONTHLY`
- `STRIPE_PRICE_AGENT_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_PRO_PLUS_MONTHLY`
- `STRIPE_PRICE_PRO_PLUS_YEARLY`

These Price-ID variables are **not required** when the active Stripe environment contains exactly one valid Price for each canonical lookup key. `create-checkout-session` normally resolves prices server-side by lookup key, exact USD amount, recurring interval, and uniqueness. If an override is configured, it takes precedence.

Optional tax configuration:

- `STRIPE_AUTOMATIC_TAX=true` only after the tax/compliance decision is complete and Stripe Tax is intentionally enabled.

`BILLING_CHECKOUT_MODE` is the emergency/operator launch override:

- `closed` — no new paid Checkout sessions
- `controlled` — only allowlisted launch/test user IDs can create Checkout sessions
- `open` — public paid enrollment, but only when the server-owned Live billing gate is also passed

Normal launch control is also persisted in `platform_release_gates.live_billing_lifecycle`, so production can remain auditable without relying only on environment rotation. If no valid environment or gate mode exists, checkout fails closed.

## Current verified Stripe Live catalog

Verified against the connected Stripe Live account on August 18, 2026. These Price IDs are identifiers, not credentials and are accepted by the signed webhook mapping. Checkout should prefer canonical lookup-key resolution unless an explicit environment override is intentionally configured.

- Agent monthly: `price_1U5qPZAgYeNIcesFuC2gKGTz`
- Agent yearly: `price_1U5qPjAgYeNIcesFCXaHoU0c`
- Pro monthly: `price_1U5qPyAgYeNIcesFy57ssZsV`
- Pro yearly: `price_1U5qQAAgYeNIcesF6UOsmwAX`
- Pro+ monthly: `price_1U5qQKAgYeNIcesFmQqrWROC`
- Pro+ yearly: `price_1U5qQUAgYeNIcesFOSN8JZjR`

Do not use Live Price identifiers as staging defaults, and never put Stripe secret keys, webhook signing secrets, Supabase service-role keys, or customer/subscription IDs in `/property` JavaScript.

## Server entitlement contract

Apply `supabase/migrations/20260818213000_watchdog_full_tier_entitlement_contract.sql` before activating Stripe subscriptions in production.

It does three things:

1. widens `account_entitlements.plan_tier` to `standard`, `agent`, `pro`, `pro_plus`, and `teams`;
2. reconciles legacy coarse `plan_tier` values from the precise `billing_tier` where available; and
3. replaces `has_watchdog_plan()` with the full ordered server ladder and fail-closed handling for unknown requested plans.

The browser is not the entitlement authority. Paid access changes only after a verified provider webhook persists the server entitlement.

## Deploy order

1. Keep production paid enrollment closed in the server-owned release gate and/or environment override.
2. Apply the full-tier entitlement migration in staging and run the role/access suite.
3. Configure Stripe test-mode secret credentials in staging and create six test-mode recurring Prices with the canonical lookup keys/amounts; use Price-ID overrides only if intentionally needed.
4. Deploy `create-checkout-session` and `create-portal-session` with JWT verification enabled.
5. Deploy `stripe-webhook` with gateway JWT verification disabled; Stripe authenticates it with `Stripe-Signature`, which the function verifies against the raw request body.
6. Create a staging/test Stripe webhook destination for the staging Supabase `stripe-webhook` function.
7. Configure Stripe Customer Portal in test mode for subscription cancellation and allowed plan/interval changes.
8. Set staging checkout to `controlled` and allow only controlled staging identities.
9. Complete the staging lifecycle and entitlement acceptance below.
10. Return staging checkout to `closed` if no more testing is needed.
11. During an explicitly authorized production window, capture the production preflight and confirm the full-tier entitlement contract is applied.
12. Configure the Live Stripe secret key and Live webhook signing secret in production. Confirm all six canonical lookup keys resolve uniquely to the expected active Live prices; Price-ID overrides remain optional.
13. Create/enable the Live Stripe webhook endpoint and Live Customer Portal configuration for the controlled acceptance window.
14. Set production checkout to `controlled` with exactly the approved real production acceptance user ID(s), using the release gate and/or environment override.
15. Complete `property/docs/stripe-live-acceptance-runbook.md`, reconcile Stripe to `account_entitlements`, verify rollback/restore evidence, and run the role/access suite.
16. Persist `platform_release_gates.live_billing_lifecycle = passed` only after the real evidence is complete.
17. Only after the gate is passed and the owner/domain launch state is ready, intentionally change public paid enrollment to `open`.

## Webhook events

The Stripe webhook endpoint should deliver at minimum:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `charge.refunded`

The same endpoint also supports existing Marketing Studio Checkout lifecycle events. Do not create a second entitlement writer.

Duplicate Stripe event IDs are ignored after the first processed event. Subscription entitlement writes also compare provider event time so an older subscription event cannot overwrite a newer persisted Stripe state.

Unknown Stripe subscription Price IDs fail closed to Standard/no paid access. `incomplete`, `incomplete_expired`, `unpaid`, and unknown subscription states also fail closed instead of being converted to `past_due` access.

## Customer Portal behavior

Existing Stripe subscribers are routed to Stripe Customer Portal rather than creating a duplicate subscription. Configure the Portal to expose only the Watchdog products/prices that are approved for self-service switching.

Legacy Paddle customers may still open their Paddle portal while migration is underway, but `create-checkout-session` refuses to start a Stripe subscription for an account that still has a live-like Paddle subscription. This prevents accidental double billing.

## Required staging acceptance

For each entitlement assertion, test both the RPC result and protected route/RLS behavior.

1. Standard cannot access Agent, Pro, or Pro+ server-gated features.
2. Agent can access Agent features but cannot satisfy Pro or Pro+ checks.
3. Pro can access Agent + Pro but cannot satisfy Pro+.
4. Pro+ can access Agent + Pro + Pro+.
5. Developer remains independent of billing and passes all developer gates.
6. Create Agent monthly via Stripe Checkout; verified webhook grants exactly `agent` with capacity 25.
7. Switch Agent monthly/yearly through Portal without creating a second active subscription.
8. Upgrade to Pro and Pro+; access changes only after signed webhook receipt.
9. Downgrade and verify the Stripe subscription/Portal policy produces the intended effective date and server entitlement.
10. Schedule cancellation, reverse it, then complete cancellation and verify Standard access after the provider state changes.
11. Produce a failed invoice/past-due state and verify recovery behavior through Portal.
12. Exercise an unpaid/incomplete state and verify paid access fails closed.
13. Refund a controlled payment and record the refund evidence. A refund does not silently invent a subscription state; subscription cancellation/state remains provider-driven.
14. Replay a duplicate webhook and an older out-of-order subscription event; neither may corrupt the newer entitlement.
15. Reconcile Stripe subscriptions/customers/prices against `account_entitlements` with no unexplained differences.

## Controlled Live acceptance before public sales

Public enrollment is blocked until one carefully controlled Live lifecycle produces evidence for:

- real Live Checkout purchase;
- signed webhook entitlement grant;
- Customer Portal access;
- monthly/yearly switch;
- upgrade and downgrade behavior where supported;
- scheduled cancellation and reactivation/cancellation completion;
- payment failure/recovery;
- refund evidence;
- duplicate and out-of-order webhook resilience;
- Agent/Pro/Pro+/Developer route + RLS acceptance;
- Stripe-to-database reconciliation;
- production rollback/stop path;
- current continuity/restore evidence.

Keep checkout `controlled` for this test. Public sales start only when the release record is complete, `live_billing_lifecycle` is passed, and the launch/domain decision allows the mode to be intentionally changed to `open`.

## Paddle retirement

Do not delete historical Paddle customer/subscription/event data needed for audit or support. Paddle may remain available only for legacy portal access during migration. It must not be used for new enrollment after the Stripe cutover.
