# Watchdog Backoffice — Lead Intelligence

Private operations area at `/property/backoffice/` for the two household BoldTrail workflows.

## Security

Backoffice lead data is no longer read directly from browser Supabase queries. The page talks to the custom-authenticated `backoffice-api` Edge Function, which uses short-lived opaque sessions and service-role database access.

The shared Backoffice key is stored in Supabase Vault. It is never committed to GitHub or written to browser storage. Only the short-lived session token is kept in `sessionStorage`.

First-time shared-key setup is fail-closed and requires an already signed-in Watchdog developer session. After initialization, John and Wife can sign in with the shared key without needing separate Watchdog developer accounts. Failed logins are throttled and authentication events are audited.

## Lead workflow

- Searchable lead queue and detailed audit history.
- Preserve the original submitted phone, email and address.
- Optional Google Address Validation stored separately from the submitted address.
- Assignment values: `unassigned`, `john`, or `wife`.
- Bulk assignment and individual assignment.
- Separate BoldTrail-ready CSV exports for John and Wife.
- Export history with export ID, filename, profile, included lead IDs and timestamp.
- Deterministic Watchdog hashtags derived from program, tenure, intent and estimated benefit.
- Manual lead entry for testing and fallback entry.

CSV export includes clear contact/address/source/status/hashtags/notes columns plus Watchdog lead context. BoldTrail's import mapper can map the desired CRM fields during upload. Exporting a lead records the handoff but does not claim that BoldTrail has successfully imported or synced it.

## Google Address Validation

Open **Settings** in Backoffice and paste the Google Address Validation API key. The key is sent to the server and stored in Supabase Vault as `google_address_validation_api_key`.

Manual leads with a submitted address are automatically validated when Google is connected. Existing leads can be revalidated from the lead detail panel. The submitted address remains unchanged; Google's standardized address, postal components, verdict summary and USPS DPV result are stored separately.

## Shared key rotation

Open **Settings** and rotate the shared Backoffice key. Rotation revokes all current Backoffice sessions immediately.

## Server components

- `backoffice-api` — password/session authentication, lead reads/writes, assignment, Google validation, CSV generation, export audit and secret configuration.
- `backoffice-lead-ingest` — server-to-server intake scaffold for future automatic lead sources.
- `backoffice_leads` / `backoffice_lead_events` — master lead record and audit trail.
- `backoffice_sessions` / `backoffice_auth_events` — private access sessions and login audit.
- `backoffice_exports` / `backoffice_export_items` — export history.
- `backoffice_export_profiles` — John/Wife export profiles.

## Server-to-server intake

The existing `backoffice-lead-ingest` function remains fail-closed until its intake secret is configured. A public estimator must not call a secret-protected ingest endpoint from client-side JavaScript. Route automatic submissions through a trusted server boundary.

## Provider policy

TruePeopleSearch scraping is intentionally not implemented. If identity enrichment is added, use an authorized provider with a stable API. Enriched contact data is supporting intelligence and is not treated as proof of marketing consent.
