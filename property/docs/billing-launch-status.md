# Watchdog billing launch status

Updated: 2026-08-08 · v0.40

## Current decision

Paddle is the planned subscription billing provider for Watchdog Pro and Pro+. The browser integration is provider-neutral. Stripe subscription code remains in the repository only as legacy/fallback source and is not the v0.40 launch path.

## Shipped in code

- Authenticated server-created Paddle transaction for Pro/Pro+ checkout.
- Price selection is server-owned; the browser sends only `pro` or `pro_plus`.
- Transaction `custom_data` is populated server-side with the authenticated Watchdog user ID and requested plan.
- Temporary Paddle Customer Portal session created on demand for the authenticated subscription owner.
- Raw-body `Paddle-Signature` verification before any entitlement write.
- Provider-neutral idempotency ledger and out-of-order subscription event protection.
- Server-authoritative Pro/Pro+ route guard plus RLS-protected Pro Workbench.
- `BILLING_CHECKOUT_ENABLED` remains the explicit fail-closed launch switch.

## Still required outside the repository

1. Create/verify Paddle Sandbox Products and recurring Prices for Pro and Pro+.
2. Configure Paddle's default payment link.
3. Install the Paddle API key, webhook secret and Price IDs as Supabase Function secrets.
4. Apply the v0.40 database migration.
5. Deploy the Paddle webhook + checkout/Portal functions.
6. Register the Paddle notification destination and run every sandbox acceptance case in `property/docs/paddle-billing-launch.md`.
7. Perform one controlled Live-mode lifecycle before opening public enrollment.

Public paid enrollment should remain off until those steps have evidence.
