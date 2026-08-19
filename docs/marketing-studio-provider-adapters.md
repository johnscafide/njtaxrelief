# Marketing Studio provider adapters

Marketing Studio is provider-neutral. Product workflows target capabilities, not vendor-specific endpoints.

## Provider lifecycle

Every provider has a stable `provider_key`, `provider_type`, capability document and connection mode:

- `not_connected`
- `sandbox`
- `live`
- `degraded`

Credentials must remain in server-side secrets or an OAuth token store. Never place provider credentials in browser JavaScript, HTML, public tables or GitHub.

## Adapter contract

A provider adapter should normalize these operations where the capability applies:

1. `health` / connection validation
2. `quote` without accepting a browser-authoritative price
3. `validate` campaign payload
4. `submit` using an idempotency key
5. `status` / retrieve provider job
6. `cancel` when the provider permits it
7. `webhook` normalization into `marketing_events`
8. `cost` reconciliation into the provider job / campaign ledger

Adapters declare capabilities rather than forcing every provider to implement every operation.

## Money boundary

Provider submission that can incur cost is server-only. A paid job must reference a server-generated quote and a verified/captured campaign payment unless a developer-only sandbox path explicitly bypasses payment. Retail price, plan discount, provider cost and Watchdog margin are separate values.

## Audience and compliance boundary

Watchdog audiences are based on governed property intelligence. Do not convert Marketing Studio into demographic owner profiling. Email/SMS require consent/suppression checks. Advertising adapters must respect provider policies and may not upload Watchdog property-owner records as custom audiences unless a separately reviewed workflow explicitly permits it.

## PCM initial Watchdog launch contract

Vendor behavior below was confirmed directly by PCM Integrations on 2026-08-19. It is the operating contract for the initial Watchdog Direct Mail launch.

### Product scope

- Customer-facing launch format: `6 x 8.5` postcard only.
- Mail class: `FirstClass` only.
- Watchdog minimum: 50 valid pieces per order.
- PCM itself does not impose a minimum.
- Other PCM product/size/mail-class catalog rows remain historical/future capability and must not be quoted or fulfilled during the initial launch.

### Address validation and production

- PCM's nightly address-validation/batching cycle is nominally around 11 PM Eastern.
- An order submitted after 11 PM can roll to the next business-day cycle, although PCM may still pick it up if that night's address verification has not finished.
- Address validation identifies each failed address, but a reason is not guaranteed for every failure.
- If some recipients fail validation, production continues with the valid recipients only.
- PCM bills Watchdog only for recipients that pass validation. There is no provider refund/credit step for invalid recipients because those pieces are not charged in the first place.

### Order lifecycle

PCM confirmed these order-level statuses:

- `pending`
- `processing`
- `mailing`
- `delivered`

Watchdog may normalize `mailing` to the internal aggregate state `mailed`, but the raw PCM status should also be retained.

An order can be edited/cancelled only while the PCM order status is `pending`. Once it becomes `processing`, cancellation is no longer permitted. Do not expose a production cancel action until the exact PCM cancel endpoint/request contract is verified.

### Recipient tracking

PCM confirmed these Mail Tracking / USPS scan states:

- `returned`
- `delivered`
- `redirected`
- `en route`

Tracking exists at both batch/order and individual-recipient levels. Most overview data is batch-level, with an additional provider lookup used when recipient detail is required. PCM stated that Mail Tracking, QR Code Scan and Order Issues webhooks can contain recipient-level data.

Recipient-level webhook events must never mutate the entire campaign's aggregate delivery state. For example, one recipient-level `delivered` scan cannot mark the full order/campaign delivered.

### Customer delivery promise

For the initial First Class product, display the expectation as:

- Printing/production: approximately 1-3 business days.
- First Class delivery: approximately 2-5 business days after printing.

Do not promise a fixed arrival date from the nominal 11 PM batching time.

### Wholesale settlement

PCM charges Watchdog, not the Watchdog customer. PCM offered two wholesale settlement modes:

1. A card on file charged daily.
2. A deposited account balance that Watchdog replenishes as needed.

Watchdog remains merchant-of-record for the customer-facing charge and must keep customer retail billing separate from the PCM wholesale ledger.

### Webhook security boundary

The public PCM receiver remains `verify_jwt=false` because PCM is an external webhook sender, but the function must authenticate the request itself before parsing or reconciling it. The implementation intentionally fails closed until the exact PCM signature secret, signature header and encoding/algorithm contract are configured.

Do not infer the signature header or representation from examples. Configure these only from PCM's Working with Webhooks security documentation or a direct vendor confirmation:

- `PCM_WEBHOOK_SIGNATURE_SECRET`
- `PCM_WEBHOOK_SIGNATURE_HEADER`
- `PCM_WEBHOOK_SIGNATURE_FORMAT`

### Embedded editor boundary

As of 2026-08-19, PCM had not yet answered whether the embedded editor emits `postMessage`/JavaScript completion events or how long editor authentication/iframe tokens remain valid. Watchdog must not invent those behaviors. Manual proof refresh remains the safe fallback until PCM confirms the editor contract.

## Adding a provider

1. Register provider metadata and capabilities in `marketing_providers`.
2. Add server-side secrets/OAuth configuration.
3. Implement the normalized adapter operations.
4. Add sandbox fixtures and idempotency tests.
5. Map provider webhooks/events to normalized statuses.
6. Add pricing inputs to the server pricing engine.
7. Expose the provider only after entitlement, compliance and payment checks pass.

PCM is the first direct-mail adapter. Existing `pcm_direct_mail_orders` remain supported while PCM is bridged into `marketing_provider_jobs`; do not break existing campaigns during migration.
