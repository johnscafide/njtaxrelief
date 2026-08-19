# Watchdog Stripe Live acceptance runbook

This runbook is the final technical path from the current fail-closed billing state to public paid enrollment. It is deliberately conservative: **controlled Live acceptance comes before public Checkout.**

## Current accepted production state

- Stripe account: `acct_1Rw2SOAgYeNIcesF`
- New-subscription provider: Stripe
- Active products: Watchdog Agent, Watchdog Pro, Watchdog Pro+
- Active Live recurring catalog:
  - Agent monthly: `$59` — `price_1U5qPZAgYeNIcesFuC2gKGTz`
  - Agent yearly: `$590` — `price_1U5qPjAgYeNIcesFCXaHoU0c`
  - Pro monthly: `$129` — `price_1U5qPyAgYeNIcesFy57ssZsV`
  - Pro yearly: `$1,290` — `price_1U5qQAAgYeNIcesF6UOsmwAX`
  - Pro+ monthly: `$399` — `price_1U5qQKAgYeNIcesFmQqrWROC`
  - Pro+ yearly: `$3,990` — `price_1U5qQUAgYeNIcesFOSN8JZjR`
- Stripe webhook endpoint: `we_1U1xCXAgYeNIcesFdsgxEtPO`
- Production webhook target: `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/stripe-webhook`
- Webhook endpoint remains disabled until the production signing secret is configured.
- Checkout remains fail-closed until a controlled account is explicitly allowlisted.
- Teams self-service enrollment remains closed.
- A legacy Paddle portal path remains only for the existing Paddle subscriber. It must not be used for new subscriptions.

## 1. Configure production Supabase secrets

Enter secrets **directly in the Supabase production project**. Do not place secret values in GitHub, source files, Linear, chat, screenshots, or release notes.

Required secret values:

- `STRIPE_SECRET_KEY` — production Stripe secret key (`sk_live_…`)
- `STRIPE_WEBHOOK_SIGNING_SECRET` — signing secret for webhook endpoint `we_1U1xCXAgYeNIcesFdsgxEtPO`
- `STRIPE_PRICE_AGENT_MONTHLY=price_1U5qPZAgYeNIcesFuC2gKGTz`
- `STRIPE_PRICE_AGENT_YEARLY=price_1U5qPjAgYeNIcesFCXaHoU0c`
- `STRIPE_PRICE_PRO_MONTHLY=price_1U5qPyAgYeNIcesFy57ssZsV`
- `STRIPE_PRICE_PRO_YEARLY=price_1U5qQAAgYeNIcesF6UOsmwAX`
- `STRIPE_PRICE_PRO_PLUS_MONTHLY=price_1U5qQKAgYeNIcesFmQqrWROC`
- `STRIPE_PRICE_PRO_PLUS_YEARLY=price_1U5qQUAgYeNIcesFOSN8JZjR`
- `BILLING_CHECKOUT_MODE=controlled`
- `BILLING_CONTROLLED_USER_IDS=<production user UUID selected for the controlled real-charge acceptance>`
- `PUBLIC_SITE_URL=https://njpropertytaxrelief.com`

Do **not** set `BILLING_CHECKOUT_MODE=open` yet.

The controlled acceptance account must be a real production account that is intentionally approved for the test and is **not** registered in Watchdog's disposable/test-account registry. Production Checkout refuses Live charges for Watchdog test accounts.

## 2. Confirm secret readiness without exposing values

Use the Developer-only platform health surface backed by `get-platform-health`.

The function reports booleans/counts only:

- Stripe secret configured
- webhook signing secret configured
- 6/6 price secrets configured
- controlled/open/closed Checkout mode
- `live_billing_lifecycle` release-gate state

It never returns a Stripe secret value.

Stop if readiness is not complete.

## 3. Enable the existing Stripe webhook endpoint

Enable `we_1U1xCXAgYeNIcesFdsgxEtPO` only after the production signing secret is stored in Supabase.

Expected event allowlist:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`

Do not broaden to `*` during acceptance.

## 4. Controlled Live purchase

From the allowlisted production user:

1. Sign in normally.
2. Open Account & Billing.
3. Select one Watchdog plan/cadence through the existing Stripe Checkout integration.
4. Confirm the hosted page is Stripe and the amount/cadence match the Watchdog catalog.
5. Complete the purchase with a real payment method under the owner's control.
6. Do not manually edit the Watchdog entitlement.

Acceptance requires the signed Stripe event to create/update the entitlement server-side.

Record:

- Checkout Session ID
- Stripe Customer ID
- Subscription ID
- Price ID
- payment amount/currency
- Stripe event IDs
- Watchdog billing audit timestamps
- resulting server entitlement tier/cadence/status

Never record card data.

## 5. Purchase and entitlement reconciliation

Pass only if all are true:

- webhook signature validates;
- `billing_webhook_events` contains the Stripe event IDs;
- duplicate delivery is idempotent;
- stale/out-of-order subscription events cannot overwrite a newer state;
- `account_entitlements.provider='stripe'`;
- provider customer/subscription/price IDs match Stripe;
- plan tier and cadence match the purchased Price;
- subscription status matches Stripe;
- paid access is granted only after the signed event;
- Account displays the same plan/status;
- no legacy Paddle subscription was created.

## 6. Stripe Customer Portal lifecycle

The current Live Portal configuration supports:

- payment-method update;
- invoice history;
- subscription price changes;
- cancellation at period end;
- cancellation reasons.

Controlled acceptance must exercise, when supported by Stripe for the selected subscription:

1. open Customer Portal from Watchdog;
2. change plan or cadence;
3. verify `customer.subscription.updated` reconciles the Watchdog entitlement;
4. schedule cancellation;
5. verify `cancel_at_period_end` is represented correctly;
6. reverse/reactivate cancellation before period end if Stripe exposes the action;
7. verify the entitlement remains consistent after each signed event.

Do not infer completion from a successful browser redirect alone.

## 7. Payment failure and recovery

A public launch requires evidence that a real failed-payment state cannot leave Watchdog access in an incorrect tier/status.

Required behavior:

- `invoice.payment_failed` records the failure and moves the subscription into the correct server-owned state;
- a later successful `invoice.paid` reconciles recovery;
- duplicate events are idempotent;
- older events cannot overwrite a newer provider state;
- no manual client-side entitlement bypass is used.

If a safe controlled Live failure cannot be produced without creating avoidable financial/account risk, keep this gate open and document the exact remaining evidence rather than fabricating a pass.

## 8. Refund acceptance

After the controlled charge has proven subscription behavior:

1. issue an intentional controlled refund through Stripe;
2. verify `charge.refunded` reaches the production webhook;
3. verify the refund is recorded without incorrectly inventing a subscription state;
4. verify Watchdog's billing audit references the provider event;
5. preserve the Stripe refund/event IDs as evidence.

Refund processing and subscription cancellation are distinct. Do not treat one as proof of the other.

## 9. Duplicate and out-of-order delivery proof

The production webhook must preserve its current event-claim and stale-event protections.

Pass when evidence demonstrates:

- replaying a previously processed Stripe event does not apply the entitlement mutation twice;
- a provider event older than the stored provider state cannot roll the subscription backward;
- the webhook ledger records the deterministic outcome.

## 10. Mark billing gates passed

Only after the controlled evidence exists, update production release gates:

- `billing.live_purchase`
- `billing.live_failure`
- `billing.live_refund`
- `billing.live_cancel`
- `live_billing_lifecycle`

The gate evidence should reference provider object/event IDs and sanitized Watchdog audit records. Never store secrets or card data in release-gate evidence.

## 11. Public-enrollment cutover

Public enrollment is the final billing change:

1. confirm controlled Live lifecycle gate is passed;
2. confirm Vercel/GitHub production source is green;
3. confirm Developer platform health is green;
4. confirm legal/business launch decision is recorded separately;
5. set `BILLING_CHECKOUT_MODE=open` in production Supabase;
6. remove the temporary Agent/Pro public checkout guard;
7. keep Teams enrollment closed unless its separate commercial gate is approved;
8. run one post-open purchase-page smoke without completing an unnecessary second charge;
9. monitor Stripe webhook errors and billing reconciliation after opening.

## Rollback / emergency stop

The fastest safe billing stop is:

1. set `BILLING_CHECKOUT_MODE=closed`;
2. disable the Stripe webhook endpoint only if webhook processing itself is unsafe — do not disable it merely to stop new sales because existing subscriber state still needs reconciliation;
3. restore the public checkout guard if needed;
4. do not delete Stripe customers/subscriptions or Watchdog billing history as a rollback mechanism;
5. correct state forward from signed provider evidence.

## Release definition

**Billing code deployed is not billing Live.**

Billing becomes accepted only when a controlled real-money lifecycle has produced signed provider evidence and the production release gates record a pass. Public paid enrollment becomes Live only after Checkout mode is deliberately changed to `open` and the public guard is removed.