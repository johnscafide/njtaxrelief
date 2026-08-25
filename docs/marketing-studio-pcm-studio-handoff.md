# Marketing Studio — Studio to PCM Production Handoff

Status: Watchdog-side Phase C live; provider asset delivery/mapping, authoritative-proof retention, webhook signature certification, cancellation and live spend remain fail-closed until their exact production contracts are certified.

## Goal

Phase C turns a selected Watchdog Studio visual into an auditable production candidate without pretending the generated image is already a PCM production design.

The sequence is now:

1. Select Studio concept + generated visual.
2. Customize copy and brand while the Watchdog visual remains active.
3. Approve the current Studio creative.
4. Prepare the PCM handoff.
5. Watchdog freezes and hashes the exact approved copy, brand, visual asset and launch format.
6. Select or edit a real PCM design.
7. If variable-based artwork mapping is used, the PCM design must expose the exact provider-returned `{{DynamicImage}}` variable.
8. A controlled provider-readable URL for the exact approved artwork must remain accessible through PCM's processing window.
9. Generate and retain the authoritative PCM proof.
10. Production fulfillment remains separately gated by quote, payment, final approval and the live-send kill switch.

Preparing a handoff does not call a PCM mutation endpoint, capture payment, buy postage, create an order, cancel an order or mail anything.

## Frozen handoff ledger

Table: `marketing_pcm_studio_handoffs`

Each handoff records:

- owner and campaign
- exact approved creative ID
- exact Studio visual asset ID
- provider key (`pcm`)
- 6 x 8.5 postcard / FirstClass launch format
- frozen creative snapshot
- frozen brand snapshot
- frozen visual metadata snapshot
- SHA-256 package hash
- provider design/proof references when they become available
- provider-contract blocker
- prepared / mapped / proof timestamps

Owner browser access is read-only through RLS. Writes happen through governed RPCs.

## RPCs

### `marketing_pcm_studio_handoff_state(campaign_id)`

Returns the current handoff state, whether it still matches the campaign active creative, mapping/proof references and the provider-contract status.

### `marketing_prepare_pcm_studio_handoff(campaign_id)`

Requires:

- Agent+ Marketing Studio access
- owned campaign
- `watchdog_studio_visual` active source
- active Studio creative
- creative status `approved`
- stored selected/generated Studio visual

It freezes the package, hashes it, supersedes older handoffs, moves the visual production state from `preview_only` to `awaiting_pcm_mapping`, and logs the handoff event.

The resulting status remains `provider_contract_pending` with provider mutation disabled until the controlled asset-delivery/mapping + proof-retention path is certified.

## Revision invalidation

`marketing_save_creative(...)` preserves the Studio visual when a Studio campaign is edited in Customize.

A saved revision:

- inherits the selected visual asset
- remains `watchdog_studio_visual`
- becomes the new active creative
- clears any inherited PCM design ID
- resets the visual to `preview_only`
- supersedes the previous frozen handoff
- requires fresh creative approval
- requires a fresh handoff package/hash

This prevents an approved/frozen package from silently surviving a copy change.

## Customize UX

Customize shows a production-handoff rail:

1. Studio visual selected
2. Creative approval
3. Frozen handoff package
4. PCM asset mapping
5. PCM production proof

The user can approve the Studio creative and prepare the handoff from this rail. The handoff button explicitly states that it does not upload, charge or mail.

Once prepared, the artwork stamp changes from Watchdog preview to frozen production candidate while still stating PCM proof is required.

For a saved PCM design, the PCM editor opens embedded inside Watchdog. The parent page listens for PCM's save `postMessage`, verifies that the message came from the exact iframe window and the origin returned in the current editor URL, verifies that the included `designID` matches the active Watchdog campaign design, then refreshes the provider design variables/proof automatically. Manual **Refresh from PCM** remains available if the event or provider refresh fails.

PCM confirmed on 2026-08-21 that the editor message includes `designID` and `envelopeType` for Letters. PCM also confirmed that the editor authentication token is refreshed when the editor loads and remains valid for 24 hours. Watchdog requests a fresh editor session whenever the user opens the embedded editor and does not persist the editor URL or token.

PCM confirmed on 2026-08-24 that an existing design can be modified by dragging the PCM **Dynamic Image** asset into the design. This creates the exact `{{DynamicImage}}` variable. Customize now detects only that provider-returned key; it does not guess a slot name. If the variable is absent, the user is directed to add Dynamic Image in the embedded editor, save, and let the existing save-message refresh update Watchdog state.

The Dynamic Image field is intentionally not treated as a normal editable Watchdog field. PCM expects its value to be a publicly accessible image URL supplied when the order is placed, while Watchdog's approved Studio asset remains in a private bucket. The controlled URL/delivery step is not yet certified, so Customize displays readiness but does not collect or submit a Dynamic Image URL.

## Review and proof UX

Studio campaigns receive a Review card showing:

- the selected Studio artwork
- frozen package status/hash
- 6 x 8.5 / FirstClass launch contract
- PCM mapping state
- PCM production-proof state

Review does not convert a Watchdog image into a provider proof. Existing launch gates continue to require real provider design/proof state.

PCM confirmed on 2026-08-24 that its proof engine is on demand and depends on continued access to the underlying assets. PCM recommends generating the authoritative proof as part of the order workflow and storing that proof on the client side because it may no longer be reconstructable after production or after the source asset disappears.

Customize therefore surfaces a proof-retention checkpoint. It does not claim the proof has been archived. A future live path must retain the final authoritative PCM proof before production is enabled for Studio artwork.

## PCM contract status

Vendor-confirmed and implemented/readied in Watchdog:

- embedded editor uses browser `postMessage` on save
- save payload includes `designID`
- `envelopeType` is included for Letters
- editor authentication refreshes when the editor loads
- editor token lifetime is 24 hours
- verified save triggers provider design-variable/proof refresh
- provider-returned design variables are the authority for available keys
- PCM's Dynamic Image asset creates exact variable `{{DynamicImage}}`
- `DynamicImage` receives a publicly accessible image URL at order time
- Dynamic Image source should remain accessible for at least three business days and match the block aspect ratio
- existing PCM designs can be modified to add Dynamic Image
- recipient-level variables are distinct from global variables; recipient values may fall back to corresponding globals
- proof generation is on demand and the authoritative final proof should be retained by Watchdog
- duplicate webhooks must be handled by Watchdog; PCM retries non-2xx deliveries up to three times at roughly 1, 5 and 10 minutes
- cancellation uses PCM order ID, only `pending` orders can cancel, and re-cancelling an already cancelled order returns HTTP 400

Current production state remains intentionally fail-closed where execution details are not yet certified:

- design `35355` does not currently expose `{{DynamicImage}}`; it must be modified or another provider design with that exact variable must be selected for variable-based Studio image mapping
- controlled public asset delivery for the exact private Watchdog artwork is not yet implemented/certified
- authoritative provider-proof archival is not yet implemented/certified
- the exact webhook signature header, algorithm, signed bytes, encoding/prefix and any timestamp/replay rules are not yet mechanically certified in the receiver
- the exact cancellation HTTP method/path/auth/body/response contract is not yet mechanically certified in implementation despite the vendor-supplied single/bulk documentation links
- paid fulfillment intentionally continues to send `globalDesignVariables: []`; the new Dynamic Image contract is not silently activated
- live provider spend/send remains independently disabled

Watchdog must not infer any missing wire contract from portal behavior or documentation slugs. The newly confirmed behavior narrows the remaining work; it does not make unsupported production behavior live.
