# Watchdog Stripe billing setup

The billing code is ready for Stripe test mode, but it intentionally contains no secret keys or hard-coded Stripe Price IDs.

## Stripe objects

Create two recurring monthly Prices in Stripe:

- Watchdog Pro — $49/month
- Watchdog Pro+ — $149/month

Enable the Stripe Customer Portal for payment-method updates, invoices, subscription changes, and cancellation behavior you want customers to have.

## Supabase Edge Function secrets

Set these secrets in Supabase before deploying the billing functions:

- `STRIPE_SECRET_KEY` — Stripe test-mode secret key while testing
- `STRIPE_WEBHOOK_SIGNING_SECRET` — signing secret for the deployed `stripe-webhook` endpoint
- `STRIPE_PRICE_PRO` — recurring Price ID for Pro
- `STRIPE_PRICE_PRO_PLUS` — recurring Price ID for Pro+
- `BILLING_CHECKOUT_ENABLED` — keep unset or `false` during deployment; set to `true` only while running test checkout and after the production launch decision

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions.

## Deploy order

1. Apply migrations through `20260805235900_billing_saved_views_rls.sql`.
2. Deploy `create-checkout-session` and `create-portal-session` with JWT verification enabled.
3. Deploy `stripe-webhook` with JWT verification disabled. Stripe authenticates that endpoint with its signature; the function verifies it before processing data.
4. In Stripe, register the deployed webhook URL and subscribe to `checkout.session.completed` plus `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `customer.subscription.paused` when available.
5. Leave `BILLING_CHECKOUT_ENABLED=false` while the backend is first deployed.
6. Configure Stripe test-mode secrets and temporarily set `BILLING_CHECKOUT_ENABLED=true` to test Pro and Pro+ checkout, Portal, cancellation, and webhook-driven entitlement changes.
7. Switch the flag back off before replacing test secrets with live Stripe secrets.
8. Only after live products/prices and the live webhook are configured should `BILLING_CHECKOUT_ENABLED=true` be used for general availability.

The public pricing buttons may remain on the early-access lead form until the final launch switch. The server flag is the authority: changing browser JavaScript must never be enough to enable payments.

Never put the Stripe secret key, webhook signing secret, or service-role key in `/property` JavaScript.
