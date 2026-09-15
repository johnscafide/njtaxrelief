# Watchdog CRM Companion

Watchdog CRM Companion is a Chromium Manifest V3 extension for the BoldTrail Platform. It brings source-linked Watchdog property facts into the BoldTrail contact the user intentionally has open.

## Current scope

- Chrome and Microsoft Edge from one Manifest V3 codebase.
- BoldTrail web app at `https://app.boldtrail.com/`.
- Watchdog sign-in and an active paid entitlement are required. Eligible tiers are Agent, Pro, Pro+, Teams and Developer.
- The extension scans only the active BoldTrail contact page after the user opens the popup.
- Only the visible property address, city, state and ZIP are sent to Watchdog for matching. Contact names, email addresses, phone numbers, CRM cookies and BoldTrail credentials are not sent.
- Watchdog returns sourced New Jersey public-record facts with match confidence and source references.
- The user explicitly selects the fields to apply. Existing non-empty CRM fields are never silently overwritten.
- When a compatible Notes field is visible, the extension can append a `WATCHDOG VERIFIED PROPERTY` research note containing selected facts, sources and the research limitation.

## Authentication

The extension does not copy a Watchdog web JWT into extension storage.

1. The extension generates a random local device secret and SHA-256 challenge.
2. It opens `/agent/extension/connect/` on Watchdog.
3. Watchdog requires the normal signed-in Agent-or-higher access guard and rechecks entitlement server-side.
4. Approval stores only the challenge hash for ten minutes.
5. The extension proves possession of the device secret and receives a random opaque 30-day extension token.
6. Only the SHA-256 hash of that extension token is stored server-side.
7. Every API call rechecks current paid entitlement. Disconnect revokes the session immediately.

## Privacy-safe analytics

The extension records product-use events such as connect, open, contact detected, lookup started/succeeded/no-match/ambiguous, field previewed and CRM write started/succeeded/failed.

Analytics must never contain:

- contact names;
- email addresses;
- phone numbers;
- full property addresses;
- free-form CRM notes or contact-sheet content.

Developer aggregate analytics are available at `/property/backoffice/crm-companion/`.

## Local development / unpacked install

Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `browser-extension/watchdog-crm-companion` directory.
5. Open or refresh BoldTrail once, open a contact, then click the Watchdog extension.

Edge:

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this directory.
5. Open or refresh BoldTrail once, open a contact, then click the Watchdog extension.

## Release note

The DOM adapter deliberately fails closed when it cannot identify a safe address or write target. Before Chrome Web Store / Edge Add-ons submission, certify the adapter against current authenticated BoldTrail contact layouts and add versioned fixtures for every supported layout. Do not widen selectors by scraping the full page or add permissions for unrelated BoldTrail pages merely to increase hit rate.
