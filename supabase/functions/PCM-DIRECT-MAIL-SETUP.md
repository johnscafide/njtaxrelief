# PCM Direct Mail compatibility adapter

`pcm-direct-mail` is retained only to preserve existing Data Workbench PCM drafts, saved order history, local address validation, and CSV-oriented workflows while Watchdog uses the governed Marketing Studio fulfillment path.

## Production money boundary

Browser-triggered PCM order submission is disabled.

`order.submit` always fails closed with `LEGACY_PCM_DIRECT_SUBMIT_DISABLED` and does not authenticate to PCM, place an order, buy postage, or create a provider mutation.

All customer-paid PCM fulfillment must use the current Marketing Studio chain:

1. server-owned audience / prepared recipients
2. approved creative
3. mapped PCM design
4. approved PCM production proof
5. authoritative server quote
6. verified/captured campaign payment
7. service-role-only `marketing-direct-mail-fulfill`
8. independent `PCM_LIVE_LAUNCH_ENABLED` production gate

The compatibility adapter contains no outbound provider request.

## Supported compatibility actions

The JWT-protected adapter continues to support Agent+ users for:

- `status`
- `order.list`
- `order.get`
- `draft.create`
- `draft.update`

Existing `pcm_direct_mail_orders` therefore remain readable and editable while they are still draft/ready/failed. Historical submitted orders remain readable.

## Draft safety

Draft preparation performs local address validation and duplicate removal and stores property mailing addresses only. The provider recipient label remains `Current Resident`.

The compatibility path does not send Watchdog owner demographics, household attributes, financial profile fields, or person-level advertising attributes to PCM.

`PCM_PER_PIECE_ESTIMATE_CENTS`, when configured, may still be used to display a non-authoritative draft estimate. It does not unlock provider submission.

## Canonical host

The adapter permits the canonical Watchdog browser origins:

- `https://watchdogindex.com`
- `https://www.watchdogindex.com`

The intentional legacy NJPropertyTaxRelief.com origins remain allowed during coexistence.

## PCM vendor contracts

Current PCM public materials confirm that API order cancellation and variable image data are supported capabilities, but Watchdog must not infer exact endpoint, request, webhook-signature, or image-variable contracts from marketing copy or historical examples.

Until exact current vendor contracts are certified:

- production cancellation remains unavailable
- PCM webhook verification remains fail-closed
- Watchdog Studio generated artwork remains a frozen candidate, not a PCM production proof
- the private `marketing-intelligence-visuals` bucket is not made public merely to satisfy provider image delivery

CSV export remains available as a non-provider-mutation fallback.
