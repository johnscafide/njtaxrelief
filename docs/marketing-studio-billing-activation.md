# Marketing Studio billing activation

Marketing Studio campaign funding is intentionally separate from Watchdog subscription billing. Subscriptions may continue through Paddle while campaign funding uses one-time Stripe Checkout Sessions.

## Current safe state

`marketing-campaign-checkout` is deployed but refuses all checkout creation unless:

`MARKETING_BILLING_ENABLED=true`

Leave this unset/false until campaign pricing, Stripe webhook delivery, refund policy and the first provider sandbox flow are reviewed.

## Rate cards

Initial PCM direct-mail retail rates are server-owned in `marketing_rate_cards`:

- Agent: $0.760 / piece
- Pro: $0.735 / piece
- Pro+: $0.720 / piece
- Teams: currently $0.720 / piece placeholder, configurable before launch
- Minimum production campaign: 25 pieces

Rates use millionths of a dollar (`unit_price_micros`) so half-cent pricing is not lost. Browser-submitted prices are never authoritative.

Provider cost is intentionally stored separately from retail price. PCM account cost must be confirmed before calculating or advertising Watchdog margin.

## Stripe requirements before enabling

1. Confirm `STRIPE_SECRET_KEY` is the intended live or sandbox key.
2. Confirm `STRIPE_WEBHOOK_SIGNING_SECRET` belongs to the deployed `stripe-webhook` endpoint.
3. Confirm the Stripe webhook delivers at least:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
4. Run a Stripe sandbox Checkout Session and verify `marketing_payments` becomes `paid` only after a signed webhook.
5. Verify refund events update `refunded_cents` and campaign status.
6. Do not enable Stripe automatic tax unless Watchdog has the required tax registrations and the tax treatment has been reviewed.
7. Set `MARKETING_BILLING_ENABLED=true` only after the above checks pass.

## Provider-spend boundary

`marketing_provider_jobs.requires_funding` defaults to true. A database trigger blocks any funded-required job from moving into `submitting`, `submitted`, `processing`, `live`, `mailed`, or `completed` unless the campaign has a captured payment that has not been fully refunded.

This guard is provider-neutral. New paid adapters inherit the same safety boundary automatically.

Free/non-spend actions such as Watchdog-hosted previews or other zero-cost internal jobs may explicitly set `requires_funding=false` from trusted server code.

## Refund/cancellation model

- Checkout expiration returns the campaign from `payment_pending` to `draft`.
- Full refunds mark the Marketing Studio payment/campaign refunded.
- Partial refunds remain funded but record `partially_refunded` and the refunded amount.
- Provider cancellation/refund reconciliation will be handled by each provider adapter and the shared campaign ledger.

## PCM activation

Do not make the existing Data Workbench PCM send path the final paid workflow. PCM should become a Marketing Studio provider job so the shared quote/payment/provider-job guard applies before any paid submission.

PCM credentials can be added for configuration/sandbox validation, but production sending should remain disabled until the Marketing Studio-funded PCM adapter is connected to the provider-job layer.
