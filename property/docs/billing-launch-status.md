# Watchdog billing launch status

**Current authority updated:** 2026-08-22  
**Launch issue:** NJW-42  
**Launch umbrella:** NJW-271

> **Current production authority: Stripe.** This file originally documented the Paddle-era v0.40 plan. That historical record is retained below for chronology only. It is not a current launch instruction and must not be used to configure new subscriptions.

## Current production decision

All new paid Watchdog subscriptions use Stripe.

Current customer-facing catalog:

| Tier | Monthly | Yearly |
| --- | ---: | ---: |
| Free | $0 | $0 |
| Agent | $59 | $590 |
| Pro | $129 | $1,290 |
| Pro+ | $399 | $3,990 |
| Teams | controlled enrollment | controlled enrollment |

Current server authority:

- Stripe Checkout through `create-checkout-session`.
- Stripe Customer Portal through `create-portal-session`.
- Signed Stripe webhook reconciliation through `stripe-webhook`.
- Server-owned `account_entitlements` authorization state.
- Public `billing-price-catalog` for display/catalog consistency.
- `platform_release_gates.live_billing_lifecycle` as the public paid-enrollment gate.

The remaining Paddle path is retained only to manage the existing legacy Paddle subscriber. It must not create new Paddle subscriptions and cannot satisfy the current Live billing launch gate.

## Current launch state

Public paid enrollment remains fail-closed until the controlled Stripe Live lifecycle in `docs/stripe-live-acceptance-runbook.md` passes and production evidence is persisted.

The acceptance must cover the real supported lifecycle, including:

- new paid purchase;
- upgrade;
- downgrade or interval change where supported;
- cancellation and reversal/reactivation;
- payment failure/recovery behavior;
- refund behavior;
- duplicate/out-of-order signed webhook handling;
- final entitlement reconciliation.

Do not use sandbox history, manual entitlement edits, browser state, or legacy Paddle evidence to mark this gate passed.

---

## Historical v0.40 Paddle record — archived, not current authority

**Historical update:** 2026-08-08 · v0.40

At that time, Paddle was planned as the subscription billing provider for Watchdog Pro and Pro+, and Stripe code was considered legacy/fallback source.

Historical v0.40 work included:

- Authenticated server-created Paddle transactions for Pro/Pro+ checkout.
- Server-owned Paddle price selection.
- Server-populated Paddle `custom_data` with the authenticated Watchdog user ID and requested plan.
- Temporary Paddle Customer Portal sessions.
- Raw-body `Paddle-Signature` verification before entitlement writes.
- Provider-neutral idempotency and out-of-order event protection.
- Server-authoritative paid route guards and RLS-protected professional surfaces.
- A fail-closed billing switch.

The historical Paddle launch checklist is preserved in `property/docs/paddle-billing-launch.md` for audit chronology only. It is superseded for new subscription launch by the Stripe authority above.
