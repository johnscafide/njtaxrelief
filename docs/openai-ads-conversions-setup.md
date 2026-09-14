# OpenAI Ads conversion measurement

Status: prepared for Watchdog professional acquisition campaigns. The browser Pixel ID is provisioned and wired. Server-side CAPI is configured through Supabase secrets and is initially intended to run with validation mode enabled.

## Scope

Setup mode: Measurement Pixel + Conversions API.

Paid surfaces covered:

- `/agent`
- `/investor`
- `/lender`
- `/attorney`
- `/property/pro` and `/pro`

Events:

- `page_viewed` — browser Pixel on covered paid surfaces after optional measurement consent.
- `checkout_started` — browser Pixel after Watchdog successfully creates a governed Stripe Founding Lifetime checkout session.
- `order_created` — server CAPI after Stripe payment is verified and entitlement activation succeeds, plus browser Pixel with the same event ID for deduplication.

`registration_completed` is not included in this first pass because the professional paid flow does not currently expose one single canonical account-registration success boundary. Add it only after that boundary is identified rather than firing from a click or redirect.

## Consent and privacy

OpenAI Ads measurement uses the existing Watchdog optional analytics/measurement preference. The Pixel is initialized with the saved consent state and does not emit conversion events when optional measurement is disabled. Revoking optional measurement clears Watchdog-accessible `__oppref` and `__obref` measurement cookies.

Every OpenAI Ads event created by Watchdog sets `opt_out: true` so the event is excluded from future user-level personalization. The privacy policy discloses the measurement provider and attribution identifiers.

## Browser configuration

File: `property/js/openai-ads-conversions.js`

Provisioned Ads Manager Pixel ID:

```text
JbuLmCdaMe4wTASd8o5ops
```

The Pixel ID is public configuration and is intentionally present in client source. Do not put the Conversions API key in browser code.

The runtime loads the official SDK from:

`https://bzrcdn.openai.com/sdk/oaiq.min.js`

## Supabase Edge Function secrets

Configure these secrets for `complete-lifetime-checkout`:

- `OPENAI_ADS_PIXEL_ID` — set to `JbuLmCdaMe4wTASd8o5ops` so server CAPI uses the same Pixel ID as the browser runtime.
- `OPENAI_ADS_CAPI_KEY` — server-only Conversions API key. Never commit, print, return, or expose it to browser code.
- `OPENAI_ADS_VALIDATE_ONLY` — set to `true` for initial validation, then remove or set to `false` before production measurement.

The server posts only to:

`https://bzr.openai.com/v1/events?pid=<PIXEL-ID>`

with `Authorization: Bearer <OPENAI_ADS_CAPI_KEY>`.

## Purchase event boundary

`order_created` fires only after all of the following are true:

1. the Stripe Checkout Session belongs to the signed-in Watchdog user;
2. Stripe reports the session paid (or no-payment-required where governed);
3. the amount and currency match Watchdog's governed Founding Lifetime price;
4. the purchase ledger is recorded; and
5. the lifetime entitlement is activated.

OpenAI CAPI failure is isolated from the purchase path. A failed or slow measurement request cannot revoke or prevent a verified Watchdog purchase.

## Matching and deduplication

When optional measurement consent is active, the browser passes OpenAI's opaque `__oppref` and `__obref` values unchanged to the completion function. The server does not decode or transform them.

For this first campaign, Watchdog intentionally does **not** send account email, Watchdog user ID, hashed account identifiers, or other account-profile fields in the OpenAI CAPI event. Matching is limited to OpenAI-provided attribution references plus the measured conversion itself. This keeps the first launch data-minimized while still preserving click/browser attribution when available.

The server generates a deterministic `wd_order_<sha256>` event ID from the Stripe Checkout Session ID. That same value is returned to the browser and used as the Pixel `event_id`, so Pixel and CAPI copies of the same `order_created` conversion deduplicate.

## Verification

Repository contract:

```bash
npm run test:openai-ads
```

Before launch:

1. Confirm the browser Pixel uses `JbuLmCdaMe4wTASd8o5ops`.
2. Configure `OPENAI_ADS_PIXEL_ID=JbuLmCdaMe4wTASd8o5ops` and the server-only `OPENAI_ADS_CAPI_KEY` in Supabase.
3. Enable `OPENAI_ADS_VALIDATE_ONLY=true` for the first controlled test.
4. Verify a consent-denied browser sends no OpenAI measurement event.
5. Verify consent-granted `page_viewed` and `checkout_started` in browser debug/network tooling.
6. Complete one controlled Stripe purchase and confirm `order_created` appears in Ads Manager/validation with one deduplicated conversion.
7. Disable validate-only for production.
8. Confirm the purchase still completes normally if the OpenAI endpoint is unreachable.

## Secret boundary

Never paste `OPENAI_ADS_CAPI_KEY` into a page, repository file, issue, pull request, browser console, analytics payload, or support log. Store it only as a Supabase Edge Function secret.
