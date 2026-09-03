# Watchdog Backoffice — Lead Intelligence

Private operations area at `/property/backoffice/` for retained Watchdog leads, CRM cleanup, address validation and BoldTrail handoffs.

## Security

Backoffice lead data is not read directly from browser Supabase queries. The page talks to the `backoffice-api` Edge Function, which uses short-lived authenticated sessions and service-role database access.

The current browser UI is gated by a signed-in Watchdog developer account. Secrets used by Backoffice services remain server-side / in Supabase Vault and are not committed to GitHub.

Imported LeadIQ CSV files are handled in browser memory only. They are not written to Supabase, `localStorage` or the Backoffice lead queue unless the user explicitly chooses **Add to queue** and then saves the lead through the authenticated Backoffice workflow.

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

## LeadIQ Tools

`/btc.html` now routes to `/property/backoffice/#leadiq` so the previous BTC bookmark opens the integrated workflow.

The LeadIQ Tools workspace currently migrates the highest-use contact-file workflow from the legacy BTC page:

- Import one or multiple CSV files by picker or drag-and-drop.
- Recognize common BoldTrail, kvCORE and generic CRM contact columns.
- Normalize email, phone, state and ZIP values.
- Detect duplicates using email, phone, then name/address evidence.
- Flag missing contact information, missing addresses and malformed email/phone values.
- Search and filter the imported contact set.
- Export a cleaned/deduplicated CSV.
- Export a BoldTrail-ready CSV using the same column contract as the server Backoffice exporter.
- Prefill the secure **Add lead** form from an imported contact without silently persisting the entire CSV.

Having an email address or phone number is a data-completeness signal only. It is not proof of marketing consent or permission to contact.

The original BTC application remains preserved at `/btc-legacy.html` while specialty utilities such as Open House, Property IQ and remaining reachout/campaign helpers are migrated deliberately. The legacy page is not the authoritative source for retained lead records.

## Google Address Validation

Open **Settings** in Backoffice and paste the Google Address Validation API key. The key is sent to the server and stored in Supabase Vault as `google_address_validation_api_key`.

Manual leads with a submitted address are automatically validated when Google is connected. Existing leads can be revalidated from the lead detail panel. The submitted address remains unchanged; Google's standardized address, postal components, verdict summary and USPS DPV result are stored separately.

## Server components

- `backoffice-api` — authenticated lead reads/writes, assignment, Google validation, CSV generation, export audit and secret configuration.
- `backoffice-lead-ingest` — server-to-server intake scaffold for future automatic lead sources.
- `backoffice_leads` / `backoffice_lead_events` — master lead record and audit trail.
- `backoffice_sessions` / `backoffice_auth_events` — private access sessions and login audit.
- `backoffice_exports` / `backoffice_export_items` — export history.
- `backoffice_export_profiles` — John/Wife export profiles.

## Server-to-server intake

The existing `backoffice-lead-ingest` function remains fail-closed until its intake secret is configured. A public estimator must not call a secret-protected ingest endpoint from client-side JavaScript. Route automatic submissions through a trusted server boundary.

## Provider policy

TruePeopleSearch scraping is intentionally not implemented. If identity enrichment is added, use an authorized provider with a stable API. Enriched contact data is supporting intelligence and is not treated as proof of marketing consent.
