# Watchdog billing launch status

Last checked: 2026-08-08

## Selected provider

Paddle Billing is now the selected subscription provider. The prior Stripe implementation remains in the repository as rollback/reference code but is no longer the launch path. There are no live Stripe subscriptions to migrate.

## Implemented

- Production entitlement schema now accepts Paddle while remaining provider-neutral.
- Provider event timestamps prevent older webhook deliveries from overwriting newer subscription state.
- A service-only provider event ledger provides webhook idempotency.
- `create-checkout-session` is converted to Paddle transactions and remains JWT-protected and fail-closed.
- `create-portal-session` now generates temporary authenticated Paddle Customer Portal sessions.
- `paddle-webhook` verifies `Paddle-Signature` against the raw request body before syncing entitlements.
- Paddle Price IDs—not browser metadata—are the plan authority.
- Account & Billing UI is Paddle-ready; developer View As remains presentation-only.
- Production checkout remains closed.

## Remaining activation steps

1. Create/finish the Paddle account and its Sandbox catalog.
2. Create Watchdog Pro ($49/month) and Pro+ ($149/month) recurring Sandbox prices.
3. Create a Sandbox client-side token and API key.
4. Register the Supabase `paddle-webhook` notification destination and copy its endpoint secret into Supabase.
5. Install the two Sandbox Price IDs as Supabase secrets.
6. Deploy the three Paddle-ready Edge Functions.
7. Run Checkout → webhook → entitlement → Portal → cancellation in Sandbox.
8. Complete Paddle live-domain/account approval and repeat with production credentials.
9. Only after the live lifecycle passes, deliberately set `BILLING_CHECKOUT_ENABLED=true` and change public Pro/Pro+ CTAs from early access to paid enrollment.

## Production reference

Webhook URL: `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/paddle-webhook`

Never store Paddle API keys, webhook secrets, or Supabase service-role credentials in the Git repository or browser JavaScript.
