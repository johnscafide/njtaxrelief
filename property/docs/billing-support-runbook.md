# Billing support runbook

## Safe operating rule

Watchdog access changes only after a signed Paddle webhook is accepted. Never grant a paid plan because a browser reports that Checkout completed.

## Customer reports missing access

1. Confirm the customer is signed into the same Watchdog account used at Checkout.
2. Open the developer Reliability Center and check the paid-lifecycle evidence.
3. In Paddle, locate the customer and subscription. Record the subscription status and latest notification ID.
4. Replay the latest relevant notification once. The webhook ledger is idempotent, so a second delivery cannot create a second entitlement change.
5. Refresh Account. Confirm plan, status and renewal/cancellation state.
6. If it still differs, do not edit browser storage or profile plan fields. Escalate with the Watchdog user ID, Paddle customer/subscription IDs, event ID and timestamp.

## Failed, past-due or paused payment

- Paddle remains the billing source of truth.
- Watchdog may retain limited access during `past_due` while collection recovery runs; do not promise an indefinite grace period.
- A paused or canceled subscription must resolve through the signed webhook before access changes.
- Add the observed behavior to the launch evidence checklist before public paid enrollment.

## Upgrade or downgrade

- The customer must confirm the downgrade warning in Watchdog.
- Paddle calculates the monetary adjustment. Watchdog does not quote an exact credit or charge before Paddle returns it.
- Entitlements change only after `subscription.updated` is verified and processed.
- If the customer abandons the confirmation, no plan-change request is made.

## Live launch gate

Before public enrollment, complete one controlled low-value Live purchase, Portal open, upgrade/downgrade, cancellation, refund and final entitlement reconciliation. Store no card data in Watchdog. Record evidence in the Reliability Center and then make the enrollment switch an explicit release decision.
