# Watchdog for NJ listings (browser extension)

Chrome/Edge extension (Manifest V3). On a New Jersey listing page on Zillow,
Realtor.com or Redfin it shows a Watchdog panel: Watchdog Score, the tax bill
with its year and the estimate at the newest town rate, town median tax, the
assessment check (implied value and the value it needs to hold up) against the
list price, nearby sales, home facts, and links to the true cost card, tax
checkup and full property page.

## How it works

- `content.js` reads only the listing address, map location and list price
  (the page's listing data, title or URL) on listing detail pages and asks the
  background worker to look it up. When a listing address matches more than one
  property, the panel lists them and the agent picks.
- `background.js` calls `https://www.watchdogindex.com/api/watchdog-extension`
  with the agent's personal key. No other network calls.
- `popup.html` stores the key in `chrome.storage.local`.
- Keys are created in the Agent Desk (Research > Browser extension), are tied to
  an active Agent plan, and are capped per day on the server.

## Data and privacy (for the store listing)

- Reads: the address, map location and list price of the listing being viewed.
- Sends: the address, map location and the agent's key to watchdogindex.com.
  The list price stays in the browser (it is only added to the true cost link
  when the agent opens it).
- Stores: the key, locally in the browser.
- Does not read or collect browsing history, page content, or personal data.

## Publishing

1. `scripts/build-extension.sh` makes `dist/watchdog-extension-<version>.zip`.
2. Upload it in the Chrome Web Store Developer Dashboard (the owner's account)
   and use the privacy answers above. Store installs update themselves when a
   new version is uploaded.
3. For local testing: chrome://extensions > Developer mode > Load unpacked >
   this folder.
