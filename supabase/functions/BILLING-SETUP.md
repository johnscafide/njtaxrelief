# Watchdog Paddle billing setup

Watchdog now uses a provider-neutral entitlement layer with Paddle Billing as the selected payment provider. Paid enrollment remains fail-closed until the Paddle sandbox lifecycle has passed and `BILLING_CHECKOUT_ENABLED=true` is deliberately set.

## Paddle objects to create

In Paddle Sandbox first, create two recurring monthly products/prices:

- Watchdog Pro — `$49/month`
- Watchdog Pro+ — `$149/month`

Set the default payment link to `https://njpropertytaxrelief.com/property/account.html` when the live domain is approved. Use a development/default payment link allowed by Paddle while testing in Sandbox.

## Supabase Edge Function secrets

Set these secrets before deploying the Paddle billing functions:

- `PADDLE_API_KEY` — server-side Paddle API key; never expose it to browser code
- `PADDLE_CLIENT_TOKEN` — Paddle.js client-side token (safe for checkout use in the browser)
- `PADDLE_WEBHOOK_SECRET` — secret for the Paddle notification destination
- `PADDLE_PRICE_PRO` — recurring Paddle Price ID for Pro (`pri_...`)
- `PADDLE_PRICE_PRO_PLUS` — recurring Paddle Price ID for Pro+ (`pri_...`)
- `PADDLE_ENVIRONMENT` — `sandbox` during validation; omit or set `production` for live
- `BILLING_CHECKOUT_ENABLED` — keep `false` until the full sandbox lifecycle passes

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions.

## Webhook

Deploy `paddle-webhook` with JWT verification disabled. Paddle authenticates the public endpoint with `Paddle-Signature`, which the function verifies against the exact raw body before doing any entitlement work.

Notification URL:

`https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/paddle-webhook`

Subscribe to the subscription lifecycle events, including created, trialing, activated, updated, past due, paused, resumed, and canceled. The handler is idempotent and ignores stale out-of-order subscription events.

## Deploy/test order

1. The `paddle_billing_provider` migration is already applied to production.
2. Create the Sandbox Pro and Pro+ recurring prices.
3. Add the Paddle Sandbox API key, client token, webhook secret, both Price IDs, and `PADDLE_ENVIRONMENT=sandbox` as Supabase secrets.
4. Deploy `create-checkout-session` and `create-portal-session` with JWT verification enabled.
5. Deploy `paddle-webhook` with JWT verification disabled.
6. Create the Paddle notification destination for the webhook URL and select the subscription lifecycle events.
7. Temporarily set `BILLING_CHECKOUT_ENABLED=true` and test Pro checkout → signed webhook → entitlement → Customer Portal → cancellation.
8. Set checkout back to `false`, create/approve the live Paddle catalog/domain, replace Sandbox secrets with live values, repeat the lifecycle test, then intentionally open enrollment.

The plan authority is always the recognized Paddle Price ID received in a verified webhook. `custom_data` carries the Supabase user ID only for account linkage; it never decides the paid plan.

Never put the Paddle API key, webhook secret, or Supabase service-role key in `/property` JavaScript.
