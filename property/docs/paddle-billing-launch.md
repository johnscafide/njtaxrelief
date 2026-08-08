# Paddle launch checklist — Watchdog v0.40

Status: **code-ready, activation intentionally gated**.

The application is now wired for server-created Paddle transactions, temporary Customer Portal sessions and signed subscription webhooks. No customer can be charged until the Paddle account/Prices/secrets are configured and `BILLING_CHECKOUT_ENABLED=true`.

## Acceptance gate

- [ ] Pro and Pro+ recurring Prices created in Paddle Sandbox
- [ ] Default payment link configured in Paddle
- [ ] Supabase Edge Function secrets installed
- [ ] v0.40 migration applied
- [ ] `paddle-webhook` deployed without Supabase JWT verification
- [ ] Checkout/Portal functions deployed with JWT verification
- [ ] Paddle notification destination created
- [ ] Pro purchase grants only Pro
- [ ] Pro+ purchase grants Pro+
- [ ] Standard cannot open Pro Workbench through URL manipulation
- [ ] Developer “View As” never changes server authorization
- [ ] Portal opens a newly generated Paddle URL
- [ ] Subscription cancellation changes entitlement from a signed webhook
- [ ] Duplicate webhook is ignored safely
- [ ] Older out-of-order subscription event cannot roll entitlement backward
- [ ] `past_due`, pause and resume behavior reviewed
- [ ] canceled subscription event returns the account to Standard access
- [ ] One controlled Live-mode purchase/refund/cancel test completed

Do not open public enrollment until every checked item has evidence.
