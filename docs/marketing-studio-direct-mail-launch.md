# Marketing Studio Creative Studio + Direct Mail Launch 1.0

The first complete Marketing Studio execution loop is designed around direct mail.

## Flow

1. Data Workbench selects the property audience.
2. Marketing Studio stores an immutable audience snapshot.
3. Creative Studio recommends one of ten curated profession-aware templates.
4. The professional saves a brand profile and edits headline, body, CTA and disclosure.
5. A tracking URL/QR can be generated and bound to the creative version.
6. The creative is explicitly approved.
7. Mailing recipients are materialized from the audience into an immutable recipient snapshot. Invalid/unresolved addresses are excluded from the valid count.
8. The valid recipient count is used for a server-owned plan quote.
9. Stripe campaign funding must be captured against that exact quote.
10. Final launch approval binds the approved creative, quote, payment and recipient count into one fingerprinted approval record.
11. `marketing-direct-mail-launch` revalidates that approval before any PCM request.
12. Provider submission is still blocked unless PCM credentials are configured and `PCM_LIVE_LAUNCH_ENABLED=true`.
13. Provider status, Watchdog touchpoints, leads, appointments, deals, attributed revenue and ROI feed the campaign results panel.

## Launch safety

The browser never supplies authoritative recipient rows or price to the provider launch endpoint. The provider adapter reads server-owned recipient snapshots and approval/payment records. `marketing_provider_jobs` also retains the existing exact quote/payment funding trigger.

PCM credentials alone do not activate production sends. The explicit live-launch flag remains a second kill switch so credentials can be entered and sandboxed without making paid mail available.

## Creative templates

The initial catalog includes seller value, equity opportunity, tax-review education, high-tax letter, new-homeowner welcome, lending property review, investor opportunity, local-market update, professional introduction letter and second-touch follow-up.

Templates are starting points, not autonomous claims. Professionals can edit copy and must approve the final version before launch.

## Provider design mapping

Creative Studio stores a `provider_design_id` separately from Watchdog creative content. A PCM Design ID is required for live submission. This lets Watchdog keep its own reusable creative/version history while mapping the approved version to the provider proof/design workflow after the PCM account is connected.
