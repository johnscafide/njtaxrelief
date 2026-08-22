# Watchdog Stripe Live acceptance runbook

**Status:** Canonical production paid-enrollment acceptance procedure  
**Owner issue:** NJW-42  
**Launch umbrella:** NJW-271  
**Production authority:** Stripe  
**Rule:** Public paid checkout stays fail-closed until the production release gate `live_billing_lifecycle` is persisted as `passed` with real Live evidence.

## Purpose

This runbook closes the final technical paid-enrollment evidence gate. It does not authorize a domain cutover, change pricing, or create new product scope.

Historical Paddle acceptance records are retained only as historical evidence and for management of the one legacy Paddle subscriber. They cannot satisfy this Stripe Live gate.

## Canonical production contract

Current public catalog:

| Tier | Monthly | Yearly | Authorization tier |
| --- | ---: | ---: | --- |
| Free | $0 | $0 | `standard` |
| Agent | $59 | $590 | `agent` |
| Pro | $129 | $1,290 | `pro` |
| Pro+ | $399 | $3,990 | `pro_plus` |
| Teams | controlled enrollment | controlled enrollment | `teams` |

Current server components:

- `create-checkout-session` — Stripe Checkout, lookup-key price resolution, release-gate enforcement.
- `stripe-webhook` — signed Stripe event boundary and idempotency ledger.
- `create-portal-session` — Stripe Customer Portal plus legacy Paddle management only.
- `billing-price-catalog` — public display catalog.
- `get-platform-health` — sanitized Stripe readiness/catalog/gate status.
- `account_entitlements` — server-owned authorization truth.
- `billing_webhook_events` — Stripe webhook idempotency evidence.
- `platform_release_gates.live_billing_lifecycle` — final public paid-enrollment gate.

## Preconditions

Do not start the controlled lifecycle until all items below are true.

1. Production Supabase Edge secrets contain the real Live Stripe credentials:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SIGNING_SECRET`
2. Secrets are entered directly into Supabase. Never place either value in chat, GitHub, Linear, screenshots, logs, or test fixtures.
3. The Stripe Live webhook endpoint targets the production `stripe-webhook` Edge Function and is enabled only for the controlled acceptance window.
4. `BILLING_CHECKOUT_MODE=controlled`.
5. `BILLING_CONTROLLED_USER_IDS` contains only the approved real production test customer UUID(s).
6. Public checkout remains closed to every non-controlled user.
7. `get-platform-health` reports a Live Stripe key, webhook-secret readiness, and exact resolution of the six active Agent/Pro/Pro+ monthly/yearly catalog prices.
8. The current GitHub `main` billing catalog contract agrees with the production catalog.
9. Test accounts carrying the no-real-spend protection are not used for the Live purchase.

If any precondition fails, stop. Do not manually override entitlements to manufacture a pass.

## Evidence rules

For every lifecycle step, capture only sanitized references. Never persist card data, secrets, full webhook payloads containing unnecessary customer data, or authentication tokens.

Each step should record:

- UTC timestamp;
- controlled Watchdog user UUID;
- Stripe customer/subscription/invoice/event IDs where safe and necessary;
- expected tier and observed `account_entitlements` tier;
- relevant sanitized `billing_webhook_events` row/event reference;
- expected access result;
- pass/fail and reason;
- rollback/cleanup result where applicable.

The entitlement must result from a verified signed Stripe event. Browser state, localStorage, manual database edits, synthetic events, or sandbox history do not count.

## Controlled Live lifecycle

### A. New paid purchase

1. Sign in as the approved controlled production user.
2. Purchase **Agent monthly** through the real Watchdog Checkout path with a real Live payment method.
3. Confirm Stripe marks the subscription active/paid as expected.
4. Confirm the signed webhook is accepted once.
5. Confirm `account_entitlements` becomes `agent` only after the signed provider event.
6. Confirm Agent product access succeeds and higher-tier-only access remains denied.
7. Record sanitized evidence.

**Pass:** one real successful paid purchase creates exactly one current entitlement and no duplicate subscription/ledger effect.

### B. Upgrade

1. Upgrade the same subscription to **Pro monthly** through the supported customer-management path.
2. Confirm Stripe subscription state/price changes as expected.
3. Confirm webhook processing promotes the Watchdog entitlement to `pro`.
4. Confirm Pro access succeeds while Pro+ remains denied.
5. Record sanitized evidence.

Then repeat from Pro to **Pro+ monthly** if the production Portal/plan-change contract supports that exact transition.

**Pass:** tier changes only after signed event reconciliation, with no duplicate active Watchdog subscription.

### C. Billing interval change / downgrade where supported

Exercise the exact transitions currently supported by the production Portal and price contract, including monthly/yearly changes and any supported downgrade.

For every transition:

- verify Stripe state;
- verify signed-event processing;
- verify `account_entitlements` matches the resulting authorized tier;
- verify higher-tier access is removed when the downgrade becomes effective according to the actual Stripe schedule.

Do not invent a downgrade behavior that the production contract does not support.

### D. Cancellation and reversal/reactivation

1. Schedule cancellation through Stripe Customer Portal.
2. Confirm Watchdog reflects the correct current access while the subscription remains active through its paid period.
3. Reverse/reactivate the cancellation before the effective cancellation date.
4. Confirm entitlement remains correct and no duplicate subscription is created.
5. Schedule cancellation again and allow/force the lifecycle to the supported canceled terminal state for acceptance.
6. Confirm Watchdog access revokes/downgrades exactly when the signed provider state requires it.

**Pass:** cancellation, reversal, and terminal cancellation all reconcile from Stripe truth without manual entitlement intervention.

### E. Payment failure / past-due behavior

Use Stripe's supported Live-safe acceptance method for the controlled subscription to produce the applicable failed/past-due state without exposing card details in evidence.

Confirm:

- the signed failure event is accepted;
- the Watchdog entitlement behavior matches the documented billing policy;
- Customer Portal recovery is available where intended;
- recovery restores the correct state only after provider confirmation.

### F. Refund

Issue a controlled refund for the acceptance transaction as supported by the production policy.

Confirm:

- Stripe records the refund;
- the relevant signed event is processed;
- entitlement behavior matches the refund/cancellation policy;
- the billing ledger remains internally consistent.

### G. Duplicate and out-of-order events

Using Stripe's legitimate event-redelivery/retry mechanisms where possible:

1. Redeliver an already-processed signed event.
2. Confirm `billing_webhook_events` prevents a duplicate entitlement effect.
3. Deliver/replay an older event after a newer subscription state where the provider tooling safely permits it.
4. Confirm the older event cannot overwrite newer entitlement truth.

**Pass:** idempotency and ordering controls preserve the newest valid provider state.

## Final reconciliation

Before passing the gate:

1. Query the controlled user's current `account_entitlements` row.
2. Reconcile it to the final Stripe subscription/customer state.
3. Confirm no unexpected extra active subscription exists for the controlled user.
4. Confirm no unresolved webhook failures remain from the acceptance sequence.
5. Confirm the Stripe Live webhook endpoint remains correctly configured.
6. Confirm public checkout is still not open for general traffic.
7. Confirm legacy Paddle management still serves only the existing legacy subscriber and cannot create new Paddle subscriptions.

## Persisting the pass

Only after every required lifecycle item passes, persist sanitized evidence to:

- `production_acceptance_runs`; and/or
- the `evidence` object for `platform_release_gates.live_billing_lifecycle`.

The final gate record must identify at minimum:

- provider: `stripe`;
- controlled acceptance completion time;
- purchase evidence reference;
- upgrade evidence reference;
- supported downgrade/interval-change evidence reference;
- cancel/reactivation evidence reference;
- failure/recovery evidence reference;
- refund evidence reference;
- duplicate/out-of-order evidence reference;
- final entitlement reconciliation result;
- operator/owner approval.

Then change `platform_release_gates.live_billing_lifecycle.status` to `passed`.

## Opening public checkout

Passing the gate does **not** require opening checkout in the same operation.

Public paid enrollment may open only when:

1. `live_billing_lifecycle = passed` in production;
2. the owner has approved launch timing;
3. the final domain/cutover state is ready under NJW-271;
4. public legal/support/pricing surfaces point at the production domain and canonical pricing;
5. `BILLING_CHECKOUT_MODE` is deliberately changed from controlled/closed to the approved public mode.

Never make public checkout openness depend only on a browser flag.

## Failure / rollback

If any acceptance step fails:

- keep `live_billing_lifecycle` blocked;
- keep public checkout closed;
- disable the Live webhook endpoint if continued delivery could create unsafe noise while repairing configuration;
- cancel/refund the controlled test subscription as appropriate;
- preserve sanitized failure evidence;
- create or reopen a bounded Linear defect only for the concrete failure;
- rerun the failed lifecycle segment and any downstream segments whose evidence depended on it.

Do not broaden scope into unrelated product work.

## Domain relationship

The Stripe lifecycle can be proven before the final Watchdog domain is selected if Stripe/Supabase callback and return URLs remain valid for the current production host. The final domain cutover must later update and revalidate all billing return URLs, webhook assumptions, OAuth origins, CORS allowlists, API-key restrictions, canonical URLs, analytics, email links, and redirects under NJW-271.
