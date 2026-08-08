# Watchdog billing launch status

Last checked: 2026-08-07

## Implemented

- Supabase `create-checkout-session` is deployed and JWT-protected.
- Supabase `create-portal-session` is deployed and JWT-protected.
- Supabase `stripe-webhook` is deployed with JWT verification disabled because Stripe authenticates it with a webhook signature.
- Checkout is fail-closed behind the server-only `BILLING_CHECKOUT_ENABLED` flag.
- Entitlements are server-owned and Stripe Price IDs are the plan authority.
- Stripe live Watchdog Pro exists at $49/month.
- Stripe live Watchdog Pro+ exists at $149/month.
- Stripe production webhook destination exists and is currently disabled.
- The Stripe-hosted Customer Portal login is linked from `/property/account.html` for active paid customers.
- There are currently no live Stripe subscriptions.

## External launch blockers

1. Stripe currently reports `charges_enabled=false` and card-payment capability inactive while a Terms/supportability appeal is pending verification. Resolve this in Stripe before live enrollment.
2. Verify the Stripe Customer Portal configuration allows payment-method updates, invoice history, and cancellation at period end.
3. Install the Stripe live secret key, production webhook signing secret, and the two live Price IDs as Supabase Edge Function secrets.
4. Use a Stripe sandbox/test environment to run the full Checkout → webhook → entitlement → Portal → cancellation lifecycle.
5. After Stripe approves live charges and the lifecycle test passes, enable the production webhook and set `BILLING_CHECKOUT_ENABLED=true`.
6. Only then replace the public early-access CTAs with paid Checkout.

## Non-secret production references

- Pro Price: `price_1U1FfAAgYeNIcesF57ieW4Ku`
- Pro+ Price: `price_1U1FfvAgYeNIcesFnpntDSLy`
- Webhook endpoint: `we_1U1xCXAgYeNIcesFdsgxEtPO`
- Webhook URL: `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/stripe-webhook`

Never store Stripe secret keys, webhook signing secrets, or Supabase service-role credentials in the Git repository or browser JavaScript.
