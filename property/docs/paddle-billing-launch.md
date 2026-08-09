# Paddle launch checklist — Watchdog v0.40

Status: **Sandbox lifecycle validated through purchase, portal, scheduled cancellation and resume; public activation remains intentionally gated**.

The application is now wired for server-created Paddle transactions, temporary Customer Portal sessions and signed subscription webhooks. No customer can be charged until the Paddle account/Prices/secrets are configured and `BILLING_CHECKOUT_ENABLED=true`.

## Acceptance gate

- [x] Pro and Pro+ recurring Prices created in Paddle Sandbox
- [x] Sandbox Price mapping recorded: Pro `pri_01kzhtgke8bync5tjrgxged792`; Pro+ `pri_01kzhtev36x06eaadc3t9qa1am`
- [ ] Default payment link configured in Paddle
- [x] Supabase Edge Function secrets installed (Sandbox configuration, confirmed 2026-08-08)
- [x] Matching Sandbox `PADDLE_CLIENT_TOKEN` installed for Paddle.js checkout
- [x] v0.40 billing/workbench schema capabilities verified in the connected Supabase project
- [x] `paddle-webhook` deployed without Supabase JWT verification
- [x] Checkout/Portal functions deployed with JWT verification
- [x] Paddle notification destination created
- [x] Pro purchase grants only Pro
- [ ] Pro+ purchase grants Pro+
- [ ] Standard cannot open Pro Workbench through URL manipulation
- [ ] Developer “View As” never changes server authorization
- [x] Portal opens a newly generated Paddle URL
- [x] Subscription cancellation scheduling changes entitlement metadata from a signed webhook while preserving paid-through access
- [x] Cancel-at-period-end can be reversed and the signed webhook clears the cancellation flag without changing plan access
- [ ] Pro → Pro+ price change grants Pro+ only after the signed `subscription.updated` webhook
- [ ] Duplicate webhook is ignored safely
- [ ] Older out-of-order subscription event cannot roll entitlement backward
- [ ] `past_due`, pause and resume behavior reviewed
- [ ] canceled subscription event returns the account to Standard access
- [ ] One controlled Live-mode purchase/refund/cancel test completed

Do not open public enrollment until every required acceptance item has evidence.
