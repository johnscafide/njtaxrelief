# Watchdog Paddle billing setup

Watchdog v0.40 uses Paddle as the planned customer billing provider. The customer-facing JavaScript remains provider-neutral; all credentials, Price IDs, entitlement changes and webhook verification stay server-side in Supabase Edge Functions.

## Secrets

Set these only in Supabase Edge Function secrets:

- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_PRICE_PRO`
- `PADDLE_PRICE_PRO_PLUS`
- `PADDLE_ENVIRONMENT` — `sandbox` while testing, then `live`
- `BILLING_CHECKOUT_ENABLED` — keep `false` until the full sandbox lifecycle passes

Optional: `PADDLE_WEBHOOK_TOLERANCE_SECONDS` (defaults to Paddle SDK-compatible 5 seconds) and `PADDLE_API_BASE` for controlled testing.

Never place an API key, webhook secret, Supabase service-role key, or Paddle customer/subscription identifier in `/property` JavaScript.

## Deploy order

1. Apply `supabase/migrations/20260808143000_watchdog_v040_commerce_change_workbench.sql`.
2. Configure recurring Pro and Pro+ Prices in Paddle Sandbox.
3. Configure Paddle's default payment link so API-created transactions receive a `checkout.url`.
4. Add the secrets above with sandbox values and keep checkout disabled.
5. Deploy `create-checkout-session` and `create-portal-session` with JWT verification enabled.
6. Deploy `paddle-webhook` with JWT verification disabled. Paddle authenticates this endpoint with its `Paddle-Signature`; the function verifies the raw body HMAC before processing it.
7. Create a Paddle notification destination at `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/paddle-webhook` for subscription lifecycle events (`created`, `updated`, `activated`, `trialing`, `past_due`, `paused`, `resumed`, `canceled`) plus `transaction.completed`.
8. Set `BILLING_CHECKOUT_ENABLED=true` only in Sandbox and test: new Pro, new Pro+, Portal, cancellation scheduled at period end, `past_due`, resume, and duplicate/out-of-order webhook delivery.
9. Confirm `account_entitlements` changes only from the verified webhook and `billing_provider_events` records the provider event once.
10. Turn checkout back off, replace Sandbox credentials with Live credentials, repeat a controlled live test, then intentionally open enrollment.

Paddle Customer Portal URLs are created on demand. They are temporary and are never cached or hard-coded into Watchdog pages.

## Entitlement behavior

- `active` / `trialing`: paid access is granted according to the mapped Price ID.
- `past_due`: billing state is retained so recovery can happen through Paddle; route authorization can be tightened later if business policy requires immediate suspension.
- `paused` / `canceled`: `get_my_entitlement()` resolves the customer to Standard access.
- Developer access is a separate server role and is never granted by checkout.
- “View As” is visual QA only; it cannot change RLS, entitlement RPCs or paid route authorization.

Official Paddle references used for this implementation: Overlay Checkout/build checkout, webhook signature verification, subscription provisioning, Customer Portal sessions, Transactions and custom data in the Paddle Developer documentation.
