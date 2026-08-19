# Marketing Studio Creative Studio + Direct Mail Launch 1.0

The first complete Marketing Studio execution loop is designed around direct mail.

## Initial launch product

Watchdog Direct Mail launches with one deliberately narrow customer-facing product:

- 6 x 8.5 postcard
- First Class mail only
- Minimum 50 valid recipients

The single-format launch reduces pricing, proofing, support and fulfillment ambiguity while the PCM integration is certified. Other PCM formats remain future capabilities and are disabled from authoritative quoting/checkout/fulfillment for the initial launch.

## Flow

1. Data Workbench selects the property audience.
2. Marketing Studio stores an immutable audience snapshot.
3. Creative Studio recommends one of ten curated profession-aware templates.
4. The professional saves a brand profile and edits headline, body, CTA and disclosure.
5. A tracking URL/QR can be generated and bound to the creative version.
6. The creative is explicitly approved.
7. Mailing recipients are materialized from the audience into an immutable recipient snapshot. Invalid/unresolved addresses are excluded from the Watchdog-valid count.
8. The valid recipient count must be at least 50 and is used for a server-owned quote for a 6 x 8.5 First Class postcard.
9. Stripe campaign funding must be captured against that exact quote.
10. Final launch approval binds the approved creative, quote, payment and recipient count into one fingerprinted approval record.
11. `marketing-direct-mail-fulfill` revalidates the product, size, First Class mail class, 50-piece minimum, proof, payment and immutable recipient count before any PCM request.
12. Provider submission remains blocked unless PCM credentials are configured and `PCM_LIVE_LAUNCH_ENABLED=true`.
13. PCM begins the order at its provider lifecycle and Watchdog reconciles aggregate order statuses independently from recipient-level tracking events.
14. Provider status, Watchdog touchpoints, leads, appointments, deals, attributed revenue and ROI feed the campaign results panel.

## Vendor-confirmed fulfillment behavior

PCM Integrations confirmed the following on 2026-08-19:

- Aggregate order statuses: `pending`, `processing`, `mailing`, `delivered`.
- USPS/Mail Tracking recipient statuses: `returned`, `delivered`, `redirected`, `en route`.
- Tracking is available at both batch/order and recipient level. Recipient detail can require an additional provider API call.
- Mail Tracking, QR Code Scan and Order Issues webhooks can be recipient-level.
- Address validation/batching runs nominally around 11 PM Eastern. Orders after that time can move to the next business-day cycle, although PCM may still include them if that night's verification has not finished.
- Individual failed addresses are identified, but PCM may not always return a failure reason.
- Valid recipients continue to production when other addresses fail.
- PCM charges only the addresses that pass validation, so Watchdog does not need a provider refund for invalid pieces.
- An order can be changed or cancelled while PCM status is `pending`; once status is `processing`, it can no longer be cancelled.

## Customer timing copy

For the initial First Class postcard product, Watchdog should display:

**Estimated production:** 1-3 business days. **Estimated First Class delivery:** 2-5 business days after printing.

This is an estimate, not a guaranteed delivery date.

## Tracking safety

Aggregate order state and recipient mailpiece state are separate domains.

A recipient-level Mail Tracking event such as one piece becoming `delivered`, `returned`, `redirected` or `en route` must not change the entire campaign's aggregate lifecycle. Watchdog stores the recipient event and keeps the order lifecycle driven by order-level provider state.

## Cancellation safety

The UI may eventually expose cancellation only when the latest verified PCM aggregate status is `pending`. Do not send a production cancellation request until the exact PCM cancellation endpoint and request schema are verified from provider documentation or directly by PCM.

## Launch safety

The browser never supplies authoritative recipient rows or price to the provider launch endpoint. The provider adapter reads server-owned recipient snapshots and approval/payment records. `marketing_provider_jobs` also retains the existing exact quote/payment funding trigger.

PCM credentials alone do not activate production sends. The explicit live-launch flag remains a second kill switch so credentials can be entered and sandboxed without making paid mail available.

The PCM webhook endpoint remains fail-closed until the exact webhook signature header/format/secret contract is configured. Recipient and order events are not accepted merely because they originate from the public internet.

## Creative templates

The initial catalog includes seller value, equity opportunity, tax-review education, high-tax letter, new-homeowner welcome, lending property review, investor opportunity, local-market update, professional introduction letter and second-touch follow-up.

Templates are starting points, not autonomous claims. Professionals can edit copy and must approve the final version before launch.

## Provider design mapping

Creative Studio stores a `provider_design_id` separately from Watchdog creative content. A PCM Design ID is required for live submission. This lets Watchdog keep its own reusable creative/version history while mapping the approved version to the provider proof/design workflow after the PCM account is connected.

As of 2026-08-19, PCM is still confirming embedded-editor browser event behavior and iframe/editor token lifetime. Manual proof refresh remains the supported fallback until that contract is confirmed.
