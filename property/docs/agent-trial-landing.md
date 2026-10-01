# Agent trial landing page and account setup

**Public URL:** https://www.watchdogindex.com/agents/trial (thank-you: `/agents/trial/thanks`)  
**Physical files:** `property/agents/trial/index.html`, `property/agents/trial/thanks/index.html`, `property/css/agents-trial.css`, `property/js/agents-trial.js`  
**Spec:** `property/docs/marketing/watchdog-agent-marketing-q4-2026/04-paid-ads/landing-page-specs.md`  
**Decision:** `property/docs/marketing/watchdog-agent-marketing-q4-2026/01-strategy/trial-decision.md`

> **Status, 2026-10-01 (owner-approved change).** The 14-day card trial now covers every paid plan.
> - `create-checkout-session` offers `watchdog_14d_card_v1` on Agent, Pro and Pro+, monthly or yearly: card collected up front (`payment_method_collection: 'always'`), 14 days, renews automatically, plain-language terms with the date and price in the Checkout submit text. One trial per account (any earlier subscription on the entitlement row makes the account ineligible). A trial button never turns into an immediate charge: an ineligible account gets `TRIAL_ALREADY_USED`. Callers that do not say `trial: false` get the trial automatically when eligible. The release gate is unchanged: closed rejects, controlled needs a listed account, open needs the passed Live gate.
> - `get_public_checkout_mode()` exists (migration `20261001150000_public_checkout_mode.sql`), so this page shows variant A while checkout is open.
> - Trial checkouts started here return to `/agents/trial/thanks`; others return to `/account?checkout=success&trial=1`.
> - Reminder: the page promises an email 7 days before the first charge. That is Stripe's built-in reminder and must be switched on in Stripe (Settings, Billing, Subscriptions and emails, "Send a reminder email 7 days before a free trial ends"). `customer.subscription.trial_will_end` is still only recorded as an ordinary subscription sync; no SMS is sent.
> - Still open on the page: the scheduler link is empty (`SCHEDULER_URL`, falls back to `/contact`) and the invite thank-you text shows a literal "[N] business days".

## What it does

One page, one action. Two variants in one file:

- **Variant A** (public checkout open): "Start your 14-day Agent trial" opens Stripe Checkout through `create-checkout-session` with the first-use Agent trial offer. A card is collected. The subscription converts to the monthly Agent plan ($59) on day 14 unless cancelled.
- **Variant B** (checkout controlled or closed): "Request a Founding Agent invite" is the primary action. The form posts to the existing `pro-demo-request` endpoint (brokerage as company, office town and license in the message) and lands as a backoffice lead. Invite codes are issued by hand in batches from the existing closed-beta invite tooling.

The variant comes from the new public read `get_public_checkout_mode()` (migration `20260929020000_public_checkout_mode.sql`), which returns `open`, `controlled`, or `closed` and nothing else. The page renders variant B until that read says `open`. The checkout function stays the authority: if it rejects a checkout, the page flips to variant B and says so. `?variant=a` or `?variant=b` forces a variant for QA only; it cannot create a checkout the function would refuse.

## Account setup flow

1. Visitor clicks the trial button. If not signed in, the page sends them to the existing onboarding sign-in (`/onboarding?next=/agents/trial?start=trial`), which creates the account and returns.
2. Back on `/agents/trial?start=trial` with a session, the page opens checkout automatically (once).
3. Stripe Checkout collects the card and shows the trial terms in its submit message. Success returns to `/agents/trial/thanks?checkout=trial&session_id=...`; cancel returns to `/agents/trial?checkout=cancelled`.
4. The thank-you page requires a signed-in session, fires `trial_started` once per checkout session (deduplicated by `session_id`), reads `get_my_account_billing_state` for a status line, and shows the four first-20-minutes steps: Agent Academy lesson 1, add 5 past clients, draw a farm, book 15 minutes with John.
5. Stripe's `customer.subscription.trial_will_end` (3 days before day 14) is now recorded by `stripe-webhook` as an `access_audit_log` event `billing.trial_will_end` with `trial_end`, so the day-11 reminder email and text key off Stripe's clock.

## Original function plan (superseded by the status above)

`supabase/functions/create-checkout-session/index.ts`

- Trial offer id `agent_14d_card_v1` (legacy `controlled_agent_7d_v1` still accepted), 14 days.
- `payment_method_collection: 'always'` for the trial; `custom_text.submit.message` carries the plain-language terms.
- The trial is no longer limited to `controlled` mode. It follows the same release control as any paid checkout: closed rejects, controlled requires a listed account, open requires the passed Live gate. The gate is not weakened.
- Trial checkouts return to `/agents/trial/thanks` (or `/property/agents/trial/thanks/` on the legacy host) and cancel back to `/agents/trial`.
- Audit metadata records `payment_method_collection: 'always'` and the return path. Eligibility stays one trial per account (existing `billing.controlled_agent_trial_checkout_created` check).

`supabase/functions/stripe-webhook/index.ts`

- Adds `recordTrialWillEnd` for `customer.subscription.trial_will_end`.

`api/watchdog-index-sitemap.js`

- Adds `/agents/trial`. The thank-you page is `noindex`.

## Deploy checklist

1. Apply migration `20260929020000_public_checkout_mode.sql`.
2. Deploy `create-checkout-session` and `stripe-webhook` from this commit, verify version, SHA-256 and `verify_jwt`, then refresh `supabase/functions/PRODUCTION-INVENTORY.json` per `DEPLOYMENT-POLICY.md`.
3. Confirm Stripe sends `customer.subscription.trial_will_end` to the webhook endpoint (enable the event on the endpoint if it is not selected).
4. Stripe Customer Portal: allow immediate cancellation during trial so "cancel in one click from Account" is true.
5. Supabase Auth: confirm `https://www.watchdogindex.com/agents/trial*` is covered by the Additional Redirect URLs (the onboarding sign-in returns there).
6. Run the Playwright `targeted` matrix on `/agents/trial` and `/agents/trial/thanks` (320, 390, 430, 768, 1440, mobile WebKit) before opening the door. Do not claim certification from source inspection.
7. Fill the two placeholders: the scheduler link (`SCHEDULER_URL` in `property/js/agents-trial.js`; until set, the button points at `/contact`) and "[N] business days" on the invite thank-you state.
8. When the card trial is live, update the plans page FAQ line "Is there a free trial? Not yet." and the refund runbook line for the 7-day first-charge refund.

## Events

`view_landing` (variant), `cta_click` (cta, position), `checkout_started`, `trial_started` (event_id = Stripe session id), `founding_invite_requested`, `faq_open`, `thanks_step_click`, `thanks_view`. GA4 receives them through `gtag` (injected by the routing adapter on the Watchdog host). The first-party product analytics receives `page_view`, `upgrade_cta_clicked`, `checkout_started`, and `subscription_confirmed`, the events it accepts.

## Not done here

- Meta pixel and LinkedIn Insight Tag are not added; they need account IDs and the adapter change in `utm-and-tracking.md`.
- The day-11 reminder email and text themselves are sent by the email platform automation keyed off the trial day and the `billing.trial_will_end` event; no sender is added in this change.
- The `/for/real-estate-agents` page improvements listed in the spec are a separate change.
