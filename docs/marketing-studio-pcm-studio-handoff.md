# Marketing Studio — Studio to PCM Production Handoff

Status: Watchdog-side Phase C live; PCM asset mutation remains fail-closed pending the vendor contract.

## Goal

Phase C turns a selected Watchdog Studio visual into an auditable production candidate without pretending the generated image is already a PCM production design.

The sequence is now:

1. Select Studio concept + generated visual.
2. Customize copy and brand while the Watchdog visual remains active.
3. Approve the current Studio creative.
4. Prepare the PCM handoff.
5. Watchdog freezes and hashes the exact approved copy, brand, visual asset and launch format.
6. PCM asset/design mapping remains blocked until PCM documents the supported upload/slot mutation contract.
7. PCM production proof remains mandatory before fulfillment.

Preparing a handoff does not call a PCM mutation endpoint, capture payment, buy postage, create an order or mail anything.

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

The resulting status is currently `provider_contract_pending` with provider mutation disabled.

## Revision invalidation

`marketing_save_creative(...)` now preserves the Studio visual when a Studio campaign is edited in Customize.

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

Customize now shows a production-handoff rail:

1. Studio visual selected
2. Creative approval
3. Frozen handoff package
4. PCM asset mapping
5. PCM production proof

The user can approve the Studio creative and prepare the handoff from this rail. The handoff button explicitly states that it does not upload, charge or mail.

Once prepared, the artwork stamp changes from Watchdog preview to frozen production candidate while still stating PCM proof is required.

## Review UX

Studio campaigns now receive a Review card showing:

- the selected Studio artwork
- frozen package status/hash
- 6 x 8.5 / FirstClass launch contract
- PCM mapping state
- PCM production-proof state

Review does not convert a Watchdog image into a provider proof. Existing launch gates continue to require real provider design/proof state.

## PCM contract still required

The current PCM adapter exposes catalog/detail/editor-session behavior. Watchdog does not have a verified vendor contract for programmatically uploading the generated asset into a design or mapping it to a specific image slot.

Do not guess:

- asset-upload endpoint
- request schema
- image-slot identifiers
- embedded editor postMessage contract
- save/finish/close events
- editor token lifetime
- proof-refresh trigger after an asset change

When PCM supplies those details, the next connector can consume the frozen handoff package and move its state through `mapped_to_pcm` → `proof_ready` → `proof_approved` without changing the customer-facing Studio source-of-truth model.
