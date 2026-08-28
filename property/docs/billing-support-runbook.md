# Billing support runbook

## Current production authority

Stripe is the production payment provider for all new Watchdog subscriptions. The remaining Paddle path exists only for the single legacy Paddle subscriber recorded in production release evidence; it must not be used for new enrollment or treated as launch evidence for Stripe.

Watchdog paid access changes only after a signed Stripe event is accepted, normalized and reconciled through the server-owned entitlement boundary. Never grant a paid plan because a browser reports that checkout completed, because Stripe Dashboard shows a charge, or because a support request asks for a manual override.

Current production release evidence records the controlled Stripe Live lifecycle as passed for purchase, upgrade, downgrade, cancellation/reactivation, payment failure, refund, duplicate delivery, out-of-order delivery and entitlement reconciliation. Public paid enrollment nevertheless remains controlled by the separate public-launch gates. Billing support must not open Checkout or bypass those gates.

## Low-touch operating rule

Stripe owns collection attempts, invoices, payment-method management and monetary adjustments. Watchdog owns authorization state and only changes it from verified server-side billing evidence.

The normal billing support path is therefore:

1. Let Stripe perform the monetary operation or retry behavior configured for the subscription.
2. Let the signed Stripe webhook reach Watchdog.
3. Confirm the normalized event was processed idempotently.
4. Confirm the resulting Watchdog entitlement matches the verified Stripe subscription state.
5. Intervene manually only to investigate a mismatch, never to manufacture the entitlement outcome.

Do not build a second dunning engine in Watchdog. Do not promise a specific retry schedule unless it is read from current Stripe configuration at the time of the support case.

## Customer reports missing access

1. Confirm the customer is signed into the same Watchdog account used at checkout.
2. Open the developer Reliability Center and check the paid-lifecycle evidence and normalized provider-event ledger.
3. In Stripe, locate the customer/subscription and record the current subscription status plus the latest relevant signed event ID.
4. If a relevant signed event was not accepted, investigate delivery/signature/normalization before changing anything else. Replay a Stripe event only through a supported safe replay path; duplicate delivery must remain idempotent.
5. Refresh Account and confirm plan, billing status, renewal/cancellation state and capacity.
6. If Watchdog still differs from verified Stripe state, do not edit browser storage, profile plan fields or account entitlements by hand. Escalate with the Watchdog user ID, Stripe customer/subscription references, event ID and timestamp. Do not include payment credentials.

## Failed or past-due payment

- Stripe is the monetary transaction system of record for new subscriptions.
- Watchdog records signed `invoice.payment_failed` and related normalized billing evidence; the controlled Live failure path has already been production-tested.
- A trialing, active, past-due, paused, canceled or failed subscription must resolve through verified Stripe state and the normalized entitlement contract before access changes.
- Watchdog may retain access during a documented recovery/grace state only when the server-owned entitlement contract explicitly permits it.
- Never convert a failed-payment support case into a manual paid-plan grant.
- If recovery behavior changes in Stripe, update this runbook and the production release evidence from observed signed events before relying on the new behavior operationally.

## Upgrade or downgrade

- The customer must confirm any material plan-change warning in Watchdog or Stripe Customer Portal.
- Stripe calculates the monetary adjustment, proration, credit or balance effect. Watchdog does not invent an exact credit or charge before Stripe returns it.
- Entitlements change only after the signed Stripe event is verified, normalized and processed.
- If the customer abandons confirmation, no plan-change entitlement is granted.
- The controlled Live lifecycle already proved Agent → Pro and Pro → Agent reconciliation; use that evidence as the operating baseline rather than a manual plan edit.

## Cancellation and reactivation

- Customer Portal cancellation may schedule cancellation for period end while the Stripe subscription remains active through the paid period.
- Watchdog must preserve access through that paid period when the normalized entitlement contract says the subscription is still active.
- Reactivation must likewise come from verified Stripe state and a signed subscription event.
- Cancellation, reversal and reactivation were proven in the controlled Live lifecycle; do not substitute browser flags or a support-only entitlement override.

## Refunds

- Refund approval follows Watchdog's published refund policy and applicable law.
- Refund execution occurs through Stripe for new subscriptions.
- A refund does not automatically imply immediate entitlement cancellation. Watchdog follows the verified subscription state and normalized refund/event contract.
- Never request or store a full payment-card number in a support ticket.

## Annual terms and operational load

Annual Agent, Pro and Pro+ prices are part of the active Stripe catalog. Annual billing reduces renewal frequency but does not change the authorization model: every entitlement transition still requires signed server-side reconciliation. Do not create a separate annual-plan support path or manually extend access based on an invoice screenshot.

## Public-launch boundary

The technical Stripe Live lifecycle is already passed in production. Public paid enrollment is still intentionally controlled by separate launch controls, including external professional review and the date-bound New Jersey Stripe Tax acceptance step. This runbook does not authorize public cutover.

Teams self-service enrollment remains closed. Legacy Paddle evidence remains historical/compatibility evidence only and cannot satisfy current Stripe launch or entitlement requirements.

## Evidence to retain for an exception

For any billing exception that needs operator review, retain only the minimum non-sensitive evidence needed to explain the result:

- Watchdog user/account identifier;
- Stripe customer/subscription reference;
- signed event ID and event type;
- observed provider status and timestamp;
- normalized Watchdog processing result;
- resulting entitlement state;
- whether replay was attempted and whether idempotency held.

Never store payment-card data, secret keys, webhook signing secrets or raw authentication tokens in support notes, Linear, GitHub or release evidence.
