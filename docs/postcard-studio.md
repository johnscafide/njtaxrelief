# Postcard Studio (PostcardMania v3)

Clean URL: `https://www.watchdogindex.com/marketing-studio/postcards`
(physical file: `property/marketing-studio/postcards/index.html`).

One page, six steps: audience → PostcardMania editor → brokerage return address →
proof → price and pay → tracking. Launch format is one size only: **6 x 8.5 postcard,
First Class** (PCM size key `68`).

## Pieces

| Piece | What it does |
| --- | --- |
| `supabase/functions/_shared/pcm-v3.ts` | PCM v3 client. Login with `childRefNbr` = the agent's user id, so every agent is their own PCM child account. Token cache, cancel cutoff, return-address validation. |
| `pcm-postcard-studio` | Agent-facing actions: `status`, `editor`, `save_design`, `return_address`, `proof`, `approve_proof`, `cancel`. Watchdog test accounts always use the PCM sandbox. |
| `marketing-campaign-checkout` | Stripe Checkout. Still behind `MARKETING_BILLING_ENABLED` and `PCM_LIVE_LAUNCH_ENABLED`. Returns the agent to the host that started checkout. |
| `marketing-direct-mail-fulfill` | Service-role only. After payment, sends `POST /order/postcard` under the agent's child account. Still behind `PCM_LIVE_LAUNCH_ENABLED`. |
| `pcm-webhook` | Verifies `pcmi-signature` = HMAC-SHA256 of `{pcmi-timestamp}.{raw body}` (hex or base64, constant-time). Fails closed (503) until `PCM_WEBHOOK_SIGNATURE_SECRET` is set. Dedupes on the body hash. |

## PCM v3 contract used

- Base `https://v3.pcmintegrations.com`, `POST /auth/login {apiKey, apiSecret, childRefNbr}`.
- `POST /design/custom {name, size:"68"}` → `{url, designID}`; editor
  `https://portal.pcmintegrations.com/integrated/embed/editor/{designID}?token=…`.
- `GET /design/{id}` (ownership + size check), `POST /design/generate-proof/postcard`.
- `POST /order/postcard {mailClass, designID, recipients[], returnAddress, extRefNbr}` → `{batchID, orderID}`.
- `DELETE /order/{orderID}` until 11:30 PM Eastern on the order day.
- `GET /batch/{batchID}/recipients` → `undeliverable` per recipient (used for credits).
- Webhook events: Order Processing / Mailing / Delivered / Undeliverable / Pending Payment /
  Failed Payment / Issues, BatchCanceled, Mail Tracking, QR Code Scan. PCM retries at 1, 5 and 10 minutes.

## Pricing (migration `20260928010000_postcard_studio_pricing_and_mail_credits.sql`)

PCM cost today: $1.077 per card (0–500/month tier). Retail per card:

| Plan | Price | Gross margin at $1.077 |
| --- | --- | --- |
| Agent | $1.79 | 40% |
| Pro | $1.69 | 36% |
| Pro+ | $1.59 | 32% |
| Teams / Developer | $1.49 | 28% |

Prices are fixed, so margin grows when PCM volume tiers lower our cost ($0.97 at 501–5,000/month).
A floor of cost ÷ 0.80 means a PCM price increase can never push margin under 20%.
Stripe's fee (about 2.9% + 30¢ per checkout) comes out of that margin.

## Mail credits

- Addresses PCM cannot mail are not billed by PCM. When a status webhook arrives, the
  webhook counts undeliverable recipients in the batch and credits the agent
  `count × price paid per card` (`marketing_mail_credits`, keyed per batch count so retries never double-credit).
- A canceled order returns its full value as mail credit.
- Credits come off the next postcard quote automatically; at least $1.00 always stays due.

## Go-live checklist

1. In portal.pcmintegrations.com → For Developers → Webhooks → New Subscription, point each
   event at `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/pcm-webhook`
   (Environment: Sandbox first, then Production).
2. PCM gives every subscription its own **Signature Secret**. Copy all of them into one
   Supabase Edge Function secret named `PCM_WEBHOOK_SIGNATURE_SECRET`, separated by commas
   (for example `secret1,secret2,secret3`). A delivery is accepted if it matches any of them.
   Use the portal's "Test webhook" to confirm it is accepted (not a 401).
3. Add a payment method in the PCM portal (orders wait in Pending Payment without one).
4. Run a sandbox order end to end with a Watchdog test account.
5. Only then set `PCM_LIVE_LAUNCH_ENABLED=true` and `MARKETING_BILLING_ENABLED=true`.
