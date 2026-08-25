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

The historical `pcm-direct-mail` Data Workbench adapter is compatibility-only. It retains saved-order readback and draft maintenance, but its browser `order.submit` action is permanently fail-closed with `LEGACY_PCM_DIRECT_SUBMIT_DISABLED`. It contains no outbound provider request. Paid PCM fulfillment is exclusively service-to-service through `marketing-direct-mail-fulfill`.

## Audience and compliance boundary

Watchdog audiences are based on governed property intelligence. Do not convert Marketing Studio into demographic owner profiling. Email/SMS require consent/suppression checks. Advertising adapters must respect provider policies and may not upload Watchdog property-owner records as custom audiences unless a separately reviewed workflow explicitly permits it.

## PCM initial Watchdog launch contract

Vendor behavior below was confirmed directly by PCM Integrations on 2026-08-19, 2026-08-21 and 2026-08-24 as noted. It is the operating contract for the initial Watchdog Direct Mail launch.

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

### Order lifecycle and cancellation

PCM confirmed these order-level statuses:

- `pending`
- `processing`
- `mailing`
- `delivered`

Watchdog may normalize `mailing` to the internal aggregate state `mailed`, but the raw PCM status should also be retained.

PCM confirmed again on 2026-08-24 that only `pending` orders can be cancelled. The single-order and bulk-cancellation contracts use PCM order ID as the identifier. Cancelling an already-cancelled order returns HTTP 400. PCM stated there is no provider requirement to retrieve order status immediately before calling cancellation because only a pending order will succeed.

Vendor documentation references supplied by PCM:

- Single order cancellation: `https://docs.pcmintegrations.com/docs/directmail-api/iuc7kuzptpgwv-cancel-order`
- Bulk cancellation: `https://docs.pcmintegrations.com/docs/directmail-api/gan0r8uot3zqe-bulk-cancel-orders`

Watchdog's product boundary remains stricter: cancellation will be server-only and must refuse a request unless Watchdog's latest verified aggregate order status is `pending`. The actual outbound cancellation call remains fail-closed until the exact HTTP method/path/auth/body and response contract from the current documentation can be mechanically certified in implementation and tests. Do not infer wire details from the documentation slug or portal behavior.

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

The public PCM receiver remains `verify_jwt=false` because PCM is an external webhook sender, but the function must authenticate the request itself before parsing or reconciling it. The implementation intentionally fails closed until the exact PCM signature secret, signature header, signed input and encoding/algorithm contract are configured.

PCM supplied its current webhook-security documentation on 2026-08-24: `https://docs.pcmintegrations.com/docs/directmail-api/e7k3evogf3sgx-webhook-security`. The same vendor confirmation established two operational facts that are safe to implement independently of signature parsing:

- Watchdog must handle duplicates. PCM may legitimately send more than one webhook for an order/recipient, including repeated Mail Tracking updates.
- When Watchdog returns a non-2xx response, PCM retries up to three times at approximately 1, 5 and 10 minutes.

The current receiver already treats an exact duplicate event as a successful 2xx acknowledgement and keeps recipient-level tracking separate from aggregate order state. Those semantics remain valid.

Do not infer the signature header or representation from examples or URLs. Configure these only from a mechanically verified current PCM security contract:

- `PCM_WEBHOOK_SIGNATURE_SECRET`
- `PCM_WEBHOOK_SIGNATURE_HEADER`
- `PCM_WEBHOOK_SIGNATURE_FORMAT`

Certification must still establish the exact header, algorithm, signed bytes, encoding, prefix/timestamp/replay rules and exercise valid, invalid, missing, duplicate and replay cases before this gate is closed.

### Embedded editor boundary

PCM Technical Account Manager confirmation received 2026-08-21 established the supported embedded-editor behavior used by Watchdog:

- saving inside the PCM editor sends a browser `postMessage` to the parent page
- the message includes `designID`
- `envelopeType` is included for Letters
- editor authentication refreshes when the editor loads
- the editor token remains valid for 24 hours

Watchdog requests a fresh editor session on every open and does not persist the editor URL/token. Parent-window save handling accepts events only from the exact iframe `contentWindow`, exact origin derived from the returned editor URL and matching active `designID`. A verified save triggers provider design/variable/proof refresh. Manual **Refresh from PCM** remains available as fallback.

### Design variables and Dynamic Image

PCM confirmed on 2026-08-24:

- PCM resolves a design variable only when that variable exists in the selected design and the corresponding value is supplied with the order.
- Design variables are authored with double curly brackets, for example `{{firstname}}`, without spaces or special characters in the key.
- The Get Design by ID response is the authority for which variables a specific design exposes. Do not invent a variable name that the design did not return.
- Recipient-level variables and global variables are distinct. If a recipient-level value is absent, PCM can fall back to the corresponding global variable; if neither exists, the variable remains blank.
- Adding PCM's preconfigured **Dynamic Image** asset creates the exact `{{DynamicImage}}` variable.
- `DynamicImage` is populated with a publicly accessible image URL when the order is placed.
- The image should remain accessible for at least the three-business-day PCM processing window and should match the Dynamic Image block's aspect ratio to avoid distortion.
- Existing PCM designs can be modified to add Dynamic Image.

PCM specifically reported that design `35355` did not expose editable variables beyond the standard address-block variables at the time of the vendor review. Therefore Watchdog must not pretend design 35355 already has a Dynamic Image slot. Customize now detects only the exact provider-returned `DynamicImage` key and tells the user to add the PCM Dynamic Image asset in the embedded editor if the slot is absent.

Watchdog Studio artwork remains in the private `marketing-intelligence-visuals` bucket. This confirmation does not authorize making that bucket public. A production mapping still needs a controlled provider-readable asset-delivery mechanism that keeps the exact approved artwork available for PCM's processing window without weakening storage privacy.

The current paid fulfillment payload intentionally leaves `globalDesignVariables` empty. Newly documented design-variable behavior is not enabled for live fulfillment until the asset-delivery, variable-mapping, proof-retention and live-send path is separately certified.

### Complete artwork and proof retention

PCM also confirmed on 2026-08-24 that Watchdog may generate and freeze complete front/back print-ready artwork itself rather than ask PCM to resolve design variables. In that model Watchdog supplies the completed artwork and must follow PCM's current template dimensions, safe areas and bleed requirements. PCM stated it does not currently enforce a specific maximum image dimension or file size for that complete-artwork use case, and the source artwork should remain accessible through the processing window.

PCM's proof engine is on demand and can generate a proof only while it can still access the underlying assets. PCM recommends generating the authoritative proof as part of the order workflow and storing the result on Watchdog's side. Once production is complete or a source asset is unavailable, PCM may no longer be able to reconstruct the proof.

Accordingly:

- a Watchdog Studio preview is never a PCM production proof
- proof approval must remain tied to a real provider proof
- live submission must remain disabled until Watchdog has a certified authoritative-proof retention step for the final mapped artwork
- Customize may show proof/readiness state but must not claim that a provider proof has been archived when it has not

The service-role-only WDD mapping/proof transition RPCs may record a provider mapping and proof only after a real PCM design mapping exists. They do not create provider designs, upload assets, submit orders or approve proofs.

Until the controlled asset-delivery/mapping + proof-retention path is certified, the frozen Watchdog Studio package remains `provider_contract_pending` and is never represented as a PCM production proof.

## Adding a provider

1. Register provider metadata and capabilities in `marketing_providers`.
2. Add server-side secrets/OAuth configuration.
3. Implement the normalized adapter operations.
4. Add sandbox fixtures and idempotency tests.
5. Map provider webhooks/events to normalized statuses.
6. Add pricing inputs to the server pricing engine.
7. Expose the provider only after entitlement, compliance and payment checks pass.

PCM is the first direct-mail adapter. Existing `pcm_direct_mail_orders` remain supported for readback and draft maintenance while PCM is bridged into `marketing_provider_jobs`; do not break existing campaigns during migration, and do not re-enable the legacy paid submit path.
