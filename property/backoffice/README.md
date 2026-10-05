# Watchdog Backoffice: Lead Intelligence

Private lead-management area for the two Watchdog operators (John and Heather), served at the clean Watchdog URL `https://www.watchdogindex.com/backoffice`. The physical files live in `property/backoffice/`; that path is an implementation detail and is never used in links.

## Access

- Backoffice opens for a **signed-in Watchdog account listed in `public.backoffice_operators`**. There is no separate password.
- `backoffice.js` reads the Watchdog access token from `window.NJPTRAccess.client().auth.getSession()` and posts it to the same-origin gateway `/api/watchdog-backoffice-gateway?target=login` (Supabase function `backoffice-dev-login`). The response is a 12-hour Backoffice session token (`{ok, token, actor, expires_at}`); `401` means not signed in, `403` means the account is not on the access list.
- Every lead call then goes to `/api/watchdog-backoffice-gateway?target=api` (Supabase function `backoffice-api`) with `Authorization: Bearer <backoffice session token>`. The gateway forwards the browser's IP and user agent so session fingerprints describe the operator's device.
- **Lock Backoffice** revokes the session on the server (`logout`) and leaves a locked card; **Open Backoffice** starts a new session from the Watchdog sign-in. Nothing reloads the page.
- The old shared-key login, first-time setup, key rotation and in-page Google key form are retired. `backoffice-api` answers `410 {"error":"retired"}` for `setup`, `login`, `rotate_access_key` and `set_google_key`, and it never creates sessions itself.
- Operator names come from `backoffice_export_profiles.label`. The stored owner keys stay `john` and `wife`; the page never hard-codes a display name.

## Navigation

One shared shell (`backoffice-board.css` + `backoffice-shell.js`) is used by every Backoffice page:

- **Leads** and **LeadIQ Tools**, both operators.
- **Application Reviews** (`/backoffice/reviews`), **Professional Reviews** (`/backoffice/professional-verifications`) and **Real Estate OS** (`/backoffice/realestate`), shown only when the signed-in account passes the server-side `is_watchdog_developer` check. Pending-review badge counts are requested only for developers. Those pages keep their own developer gate (`data-access-require="developer"`).
- `crm-companion/` is a developer telemetry page that is not linked from the Backoffice nav.

## Lead workflow

- **My leads** is the default view, with an owner filter (Mine / each operator / Unassigned / Everyone).
- **Pipeline stages** use `lead_status`: New → Contacted → Qualified → Nurture → Closed, with Archived kept separately. Stage tabs show counts; each lead has a stage picker.
- **Follow-ups**: one next step (≤200 characters) and a due date per lead, with Due today / Overdue / Upcoming / No follow-up filters and tiles.
- **Quick contact**: Call (`tel:`), Text (`sms:`) and Email (`mailto:`) open the device app and log the contact (`log_contact`), which records `last_contacted_at` and moves a New lead to Contacted. Consent is shown next to the buttons; an email address or phone number is never treated as marketing consent.
- **Notes & timeline**: editable lead notes (included in BoldTrail handoffs) plus dated timeline notes (`add_note`) that record who wrote them. Activity is shown in plain language.
- **Needs attention** means `processing_status` is `review` or `error` (for example, Google could not fully confirm the address). **Mark reviewed** sets it to `ready`; re-checking the address later does not reopen a lead an operator already reviewed.
- **Possible duplicates** are flagged in the browser when leads share a normalized email address or phone number.
- **Lead sources**: a per-owner snapshot of intake source and "heard about Watchdog" answers, last 30 days or all time.
- **Bulk actions** appear only while leads are selected. Bulk owner defaults to the signed-in operator. Sending or exporting leads that belong to the other operator asks first, because it moves them.
- **BoldTrail**: direct send skips leads already in BoldTrail unless you choose **Re-send**; bulk sends go in batches of 50 and report sent / skipped / failed counts. Email and text opt-ins are sent as `1` only when `consent_data` records explicit consent (`marketing_consent` or `email_marketing_consent` for email, `sms_consent` for texts); `marketing_consent_inferred` is not consent. Calls stay on for inbound inquiries. Hashtags are bucketed (`intent-high`, `intent-medium`, `intent-low`, `benefit-1k-plus`, `benefit-500-plus`, `benefit-under-500`).
- **CSV export** leaves archived leads out, records the handoff (it does not claim BoldTrail imported the file) and neutralizes spreadsheet formulas.
- **Settings** is read-only status: Google address validation connected or not, BoldTrail direct sending per operator, who is signed in and when the session ends. Keys are server secrets set by a developer.

## `backoffice-api` actions

All actions require a Backoffice session except the four retired ones.

| Action | Request | Response |
| --- | --- | --- |
| `session` | - | `{ok, actor, actor_label, expires_at, operators:[{key,label}], integrations}` |
| `logout` | - | `{ok}` |
| `status` | - | `{ok, setup_required:false, google_address_validation}` |
| `integrations` | - | `{ok, google_address_validation, boldtrail:{john,wife}, profiles}` |
| `list` | - | `{ok, leads, followups_available, integrations}` |
| `detail` | `{lead_id}` | `{ok, lead, events}` |
| `add` | `{lead}` | `{ok, lead}` (201) |
| `update` | `{lead_id, patch:{lead_status?, processing_status?, notes?, next_action?, next_action_due?}}` | `{ok, lead}` |
| `mark_reviewed` | `{lead_id}` | `{ok, lead}` |
| `add_note` | `{lead_id, note}` | `{ok, event}` (201) |
| `log_contact` | `{lead_id, channel: call\|text\|email}` | `{ok, lead, event}` |
| `assign` | `{lead_ids, profile_key: unassigned\|john\|wife}` | `{ok, updated}` |
| `validate_address` | `{lead_id}` | `{ok, lead}` |
| `sync_boldtrail` | `{lead_id, profile_key, resend?}` | `{ok, lead}`; `409 ALREADY_SYNCED` unless `resend` |
| `sync_boldtrail_bulk` | `{lead_ids (≤50), profile_key, resend?}` | `{ok, requested_count, synced_count, skipped_count, failed_count, synced, skipped, failed}` |
| `archive_bulk` | `{lead_ids, archive}` | `{ok, updated}` |
| `export_csv` | `{profile_key, lead_ids?, include_exported?}` | `{ok, filename, csv, count, excluded_count, export_id}` |
| `setup`, `login`, `rotate_access_key`, `set_google_key` | - | `410 {error:"retired"}` |

## LeadIQ Tools

`/btc.html` redirects to `https://www.watchdogindex.com/backoffice#leadiq`.

- Import one or more CSV files by picker or drag-and-drop; recognize common BoldTrail, kvCORE and generic CRM columns.
- Normalize email, phone, state and ZIP values; flag duplicates, missing contact details and malformed values.
- Export a cleaned CSV, the filtered view, a BoldTrail-ready CSV or a Kit CSV.
- The **Kit CSV** includes only contacts who opted in to email and reports how many were left out. The optional batch opt-in checkbox fills in contacts with no recorded choice; a recorded "no" always stays no.
- **Add to queue** prefills the Add lead form; nothing is saved unless the operator saves that lead.
- Imported files stay in browser memory only.

The original BTC application remains at `/btc-legacy.html` while Open House, Property IQ and the remaining campaign helpers move over.

## Town Info Reviews

`/backoffice/town-info` (physical `property/backoffice/town-info/`) is the review queue for the public Town Needs page at `https://www.watchdogindex.com/town-needs`. Anyone with that link can send what they know about a red-flag town's resale CO or smoke / CO alarm certificate, with the town's document (PDF or photo, 10 MB max) or an https link. A typed answer alone is refused.

- Only an account that is a Watchdog developer **and** in `backoffice_operators` can use the queue (`api/watchdog-backoffice-town-needs.js` checks both on the server).
- Uploads land in the private `town-info-submissions` bucket through a one-time signed upload URL. `api/watchdog-town-needs.js` then checks the first bytes really are a PDF or an image and deletes anything else. Submissions are rate limited per client and capped at 100 a day overall.
- **Approve** copies the file to the public `town-info-evidence` bucket (it becomes the source agents can open) and deletes the private copy. **Reject** deletes the private copy. Neither changes what agents see: approved info is added to `property/data/municipal-requirements/` and published with the next checked-requirements migration, which also removes the item from the Town Needs list.
- The list itself is `property/data/municipal-requirements/town-needs.json`, built by `property/scripts/build_town_needs.py` from the live checked data plus `unpublished-needs.json` (red-flag towns researched but not published; only the missing items are kept).

## Server components

- `backoffice-api` - session-checked lead reads/writes, pipeline, follow-ups, notes, contact log, assignment, Google validation, BoldTrail send and CSV export.
- `backoffice-dev-login` - issues Backoffice sessions to listed Watchdog accounts.
- `backoffice-lead-ingest` - server-to-server intake scaffold (fail-closed until its intake secret is configured).
- Tables: `backoffice_leads`, `backoffice_lead_events`, `backoffice_sessions`, `backoffice_auth_events`, `backoffice_exports`, `backoffice_export_items`, `backoffice_export_profiles`, `backoffice_operators`.
- `supabase/migrations/20260928250000_backoffice_lead_followups.sql` adds `next_action`, `next_action_due` and `last_contacted_at`. Until it is applied, `list` falls back to the older columns and reports `followups_available: false`.

## Provider policy

TruePeopleSearch scraping is intentionally not implemented. If identity enrichment is added, use an authorized provider with a stable API. Enriched contact data is supporting intelligence and is not proof of marketing consent.

## Professional Reviews

Developer-only professional identity operations are at `/backoffice/professional-verifications`.

The Professional Reviews inbox is the authoritative queue for:

- pending REALTOR® membership submissions;
- requests for additional verification information;
- verified / rejected / expired REALTOR® decisions;
- Bright MLS, other RESO MLS, and Realtor.com connection requests.

REALTOR® approval is separate from New Jersey license verification and from Watchdog plan entitlements. A normal user can submit membership details and read their own result, but cannot grant themselves a REALTOR® badge. Verification decisions use the service-role-only review function and create an audit event.

New REALTOR® submissions also create a server-owned notification-outbox record. The authenticated `professional-review-notify` Edge Function can send a convenience email through the existing EmailJS account. Email is not required for the queue to work; failed or unconfigured email delivery remains visible in the Professional Reviews inbox.

See `property/docs/professional-review-notifications.md` for EmailJS template setup.

## Professional provider connections

The professional-profile connection cards are intentionally request-first:

- **Bright MLS**, preferred first MLS integration for Watchdog's New Jersey agent workflow.
- **Other RESO MLS**, foundation for authorized RESO Web API/member integrations.
- **Realtor.com**, agents may link a public profile, but Watchdog does not scrape ratings or reviews.

A request does not mean an integration is connected. Only server-owned provider onboarding may move a connection to `connected`. Backoffice can mark a request ready for provider setup or close it; it cannot fabricate a connected state. Live profile/review synchronization remains disabled until the applicable provider grants Watchdog authorized API/partner access.
