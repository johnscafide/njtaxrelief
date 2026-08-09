# Watchdog Paddle billing setup

Watchdog v0.47 uses Paddle as its billing provider. Customer-facing plan names are Free, Agent, Professional and Firm / API. The stable authorization tiers remain `standard`, `pro`, `pro_plus` and `teams`, so existing RLS and route guards do not need a risky rename. All credentials, Price IDs, entitlement changes and webhook verification stay server-side in Supabase Edge Functions.

## Secrets

Set these only in Supabase Edge Function secrets:

- `PADDLE_API_KEY`
- `PADDLE_CLIENT_TOKEN` — Paddle.js client-side token for the matching Sandbox/Live environment; intentionally safe for client use but stored here to keep environment selection server-owned
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_PRICE_AGENT_MONTHLY`
- `PADDLE_PRICE_AGENT_YEARLY`
- `PADDLE_PRICE_PROFESSIONAL_MONTHLY`
- `PADDLE_PRICE_PROFESSIONAL_YEARLY`
- `PADDLE_ENVIRONMENT` — `sandbox` while testing, then `live`
- `BILLING_CHECKOUT_ENABLED` — keep `false` until the full sandbox lifecycle passes

`PADDLE_PRICE_PRO` and `PADDLE_PRICE_PRO_PLUS` are accepted only as temporary monthly migration fallbacks. A yearly checkout never falls back to a monthly Price ID.

### Customer-facing catalog

| Offer | Authorization tier | Monthly | Yearly default |
| --- | --- | ---: | ---: |
| Free | `standard` | $0 | $0 |
| Agent | `pro` | $29 | $290 |
| Professional | `pro_plus` | $349 | $3,490 |
| Firm / API | `teams` | $1,000+ | Contract |

Annual prices include two months at no additional cost. Firm / API checkout deliberately returns `FIRM_GATED` until team administration, contracting and usage controls are released.

### Current Sandbox migration mapping

These IDs are environment-specific identifiers, not credentials. The Edge Functions still read them from server environment variables so Sandbox and Live can never be mixed accidentally.

- `PADDLE_PRICE_AGENT_MONTHLY=pri_01kzhtgke8bync5tjrgxged792`
- `PADDLE_PRICE_PROFESSIONAL_MONTHLY=pri_01kzhtev36x06eaadc3t9qa1am`
- Create separate Sandbox annual Price IDs for `PADDLE_PRICE_AGENT_YEARLY` and `PADDLE_PRICE_PROFESSIONAL_YEARLY`.
- `PADDLE_ENVIRONMENT=sandbox`
- `BILLING_CHECKOUT_ENABLED=false` until the acceptance gate passes

Optional: `PADDLE_WEBHOOK_TOLERANCE_SECONDS` (defaults to Paddle SDK-compatible 5 seconds) and `PADDLE_API_BASE` for controlled testing.

Never place an API key, webhook secret, Supabase service-role key, or Paddle customer/subscription identifier in `/property` JavaScript.

## Deploy order

1. Apply `supabase/migrations/20260808143000_watchdog_v040_commerce_change_workbench.sql`.
2. Configure monthly and yearly recurring Agent and Professional Prices in Paddle Sandbox.
3. Configure Paddle's default payment link so API-created transactions receive a `checkout.url`.
4. Add the secrets above with sandbox values and keep checkout disabled.
5. Deploy `create-checkout-session` and `create-portal-session` with JWT verification enabled.
6. Deploy `paddle-webhook` with JWT verification disabled. Paddle authenticates this endpoint with its `Paddle-Signature`; the function verifies the raw body HMAC before processing it.
7. Create a Paddle notification destination at `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/paddle-webhook` for subscription lifecycle events (`created`, `updated`, `activated`, `trialing`, `past_due`, `paused`, `resumed`, `canceled`) plus `transaction.completed`.
8. Set `BILLING_CHECKOUT_ENABLED=true` only in Sandbox and test: new Agent monthly, Agent yearly, Professional monthly, Professional yearly, Portal, upgrade, downgrade, cancellation scheduled at period end, `past_due`, resume, and duplicate/out-of-order webhook delivery.
9. Confirm `account_entitlements` changes only from the verified webhook and `billing_provider_events` records the provider event once.
10. Turn checkout back off, replace every Sandbox credential and Price ID with its Live counterpart, repeat the controlled four-offer live test, perform entitlement reconciliation and a restore drill, then intentionally open enrollment.

## Production opening gate

Do not turn on public Live enrollment merely because the UI is ready. All of the following must be recorded first:

- four recurring Live Price IDs are configured and independently verified;
- a controlled Live purchase, webhook grant, portal visit, upgrade, downgrade and cancellation pass;
- all four authorization roles pass route and RLS acceptance checks;
- Paddle subscriptions reconcile to `account_entitlements` with no unexplained differences;
- the production backup/restore evidence drill passes;
- Firm / API remains gated unless the separate team-controls acceptance plan is complete.

Paddle Customer Portal URLs are created on demand. They are temporary and are never cached or hard-coded into Watchdog pages.

## Entitlement behavior

- `active` / `trialing`: paid access is granted according to the mapped Price ID.
- `past_due`: billing state is retained so recovery can happen through Paddle; route authorization can be tightened later if business policy requires immediate suspension.
- `paused` / `canceled`: `get_my_entitlement()` resolves the customer to Standard access.
- Developer access is a separate server role and is never granted by checkout.
- “View As” is visual QA only; it cannot change RLS, entitlement RPCs or paid route authorization.

Official Paddle references used for this implementation: Overlay Checkout/build checkout, webhook signature verification, subscription provisioning, Customer Portal sessions, Transactions and custom data in the Paddle Developer documentation.
