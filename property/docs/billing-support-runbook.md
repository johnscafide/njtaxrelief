# Billing support runbook

## Safe operating rule

Watchdog paid access changes only after a signed event from the configured Live payment provider is accepted and reconciled. Never grant a paid plan because a browser reports that checkout completed.

The billing adapter must remain provider-neutral at the Watchdog entitlement boundary. Provider-specific customer IDs, subscription IDs and event types may differ, but normalized Watchdog entitlement outcomes must remain server-owned and auditable.

## Customer reports missing access

1. Confirm the customer is signed into the same Watchdog account used at checkout.
2. Open the developer Reliability Center and check the paid-lifecycle evidence and normalized provider-event ledger.
3. In the active payment provider, locate the customer/subscription and record the current provider status plus the latest relevant signed event ID.
4. Replay the latest relevant provider event once when the provider supports safe replay. The Watchdog event ledger must remain idempotent so duplicate delivery cannot create duplicate entitlement changes.
5. Refresh Account. Confirm plan, status and renewal/cancellation state.
6. If it still differs, do not edit browser storage or profile plan fields. Escalate with the Watchdog user ID, provider customer/subscription references, event ID and timestamp. Do not include payment credentials.

## Failed or past-due payment

- The configured Live payment provider is the monetary transaction system of record.
- Watchdog may retain limited access during a documented recovery/grace state only when the normalized entitlement contract explicitly permits it.
- A paused, canceled or failed subscription must resolve through verified provider state before access changes.
- Add the observed behavior to the launch evidence checklist before public paid enrollment.

## Upgrade or downgrade

- The customer must confirm any material plan-change warning in Watchdog.
- The payment provider calculates the monetary adjustment. Watchdog does not invent an exact credit or charge before the provider returns it.
- Entitlements change only after the signed provider event is verified, normalized and processed.
- If the customer abandons confirmation, no plan-change entitlement is granted.

## Refunds

- Refund approval follows Watchdog's published refund policy and applicable law.
- Refund execution occurs through the configured payment provider.
- Watchdog must capture the signed refund/transaction state and reconcile the resulting entitlement state when the refund affects service access.
- Never request or store a full payment-card number in a support ticket.

## Live launch gate

Before public paid enrollment, complete a controlled low-value Live lifecycle using the provider that will actually process Watchdog subscriptions. At minimum retain evidence for purchase, supported upgrade/downgrade behavior, cancellation/reactivation, payment failure, refund, duplicate/out-of-order event handling and final entitlement reconciliation.

Sandbox history from a previous or rejected provider does not satisfy the Live gate for a new provider. Store no card data in Watchdog. Persist sanitized evidence in the production release-control plane before enabling paid enrollment.
