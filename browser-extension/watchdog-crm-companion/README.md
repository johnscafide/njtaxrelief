# Watchdog CRM Companion

Watchdog CRM Companion is a Chromium Manifest V3 extension for the BoldTrail Platform. Version 0.3 adds a persistent Watchdog Agent Command Bar directly inside the BoldTrail viewport so agents no longer have to reopen the browser-action popup when navigating between contacts.

## Current scope

- Chrome and Microsoft Edge from one Manifest V3 codebase.
- BoldTrail web app at `https://app.boldtrail.com/`.
- Watchdog sign-in and an active paid entitlement are required. Eligible tiers are Agent, Pro, Pro+, Teams and Developer.
- The Agent Command Bar remains mounted across BoldTrail single-page-app navigation and refreshes its local contact context when the route changes.
- `Alt+W` focuses the command input.
- Quick actions: one-click Enrich, Town Closing Intelligence, Instant Municipal Packet, Listing Appointment Brief, Property and Transaction.
- The original popup remains available as a fallback and detailed field picker.
- Local contact detection reads only visible property address, city, state and ZIP. Contact names, email addresses, phone numbers, CRM cookies, BoldTrail credentials and free-form CRM notes are not collected.
- A remote Watchdog property lookup is performed only after the agent runs an action. Merely navigating between BoldTrail contacts does not transmit the detected address.
- Watchdog returns sourced New Jersey public-record facts with match confidence and source references.
- One-click Enrich uses the v0.2.1 safe writer: compatible empty CRM fields may be populated, conflicting non-empty fields are skipped, and a sourced Watchdog note is used when direct field writing is not safe.
- Town Closing Intelligence reads the governed `transaction_municipal_requirements` registry used by Watchdog's transaction product. Missing web coverage is never interpreted as “not required.”
- Municipal Packet produces a printable closing-requirements summary with current Watchdog property facts, CCO/resale and smoke/fire requirement states, checklists, fees and official links.

## Architecture

The page-native command bar is a content script isolated inside Shadow DOM so BoldTrail CSS cannot style or remove the Watchdog UI. A Manifest V3 extension service worker owns authentication, calls the Watchdog Edge Function, opens Watchdog routes, stores the temporary municipal-packet payload, and relays explicit scan/write requests to the existing scanner and v0.2.1 writer.

The bar is rendered inside the BoldTrail webpage, not inside Chrome or Edge browser chrome. Browser extensions cannot insert arbitrary page UI into the browser's own address-bar area, so Watchdog uses a fixed first-row surface at the top of the BoldTrail viewport.

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

The existing extension analytics remain privacy-minimized. Events must never contain contact names, email addresses, phone numbers, full property addresses or free-form CRM content.

Developer aggregate analytics are available at `/property/backoffice/crm-companion/`.

## Local development / unpacked install

Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `browser-extension/watchdog-crm-companion` directory.
5. Open or refresh BoldTrail. The Agent Command Bar should appear immediately and remain present as you navigate.

Edge:

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this directory.
5. Open or refresh BoldTrail.

## Release note

The DOM adapter deliberately fails closed when it cannot identify a safe address or write target. Before Chrome Web Store / Edge Add-ons submission, certify the adapter against current authenticated BoldTrail contact layouts and add versioned fixtures for every supported layout. Do not widen selectors by scraping the full page or add permissions for unrelated BoldTrail pages merely to increase hit rate.
