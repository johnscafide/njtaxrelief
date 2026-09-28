# Watchdog for NJ listings (browser extension)

Chrome/Edge extension (Manifest V3). On a New Jersey listing page on Zillow,
Realtor.com or Redfin it shows a small Watchdog panel: annual tax, assessment,
Watchdog Score, town median tax, the value the assessment needs to hold up, and
links to the true cost card, tax checkup and full property page.

## How it works

- `content.js` reads only the listing address (page title, or the URL) on
  listing detail pages and asks the background worker to look it up.
- `background.js` calls `https://www.watchdogindex.com/api/watchdog-extension`
  with the agent's personal key. No other network calls.
- `popup.html` stores the key in `chrome.storage.local`.
- Keys are created in the Agent Desk (Research > Browser extension), are tied to
  an active Agent plan, and are capped per day on the server.

## Data and privacy (for the store listing)

- Reads: the address of the listing page being viewed.
- Sends: that address and the agent's key to watchdogindex.com.
- Stores: the key, locally in the browser.
- Does not read or collect browsing history, page content, or personal data.

## Publishing

1. `scripts/build-extension.sh` makes `dist/watchdog-extension-<version>.zip`.
2. Upload it in the Chrome Web Store Developer Dashboard (the owner's account)
   and use the privacy answers above.
3. For local testing: chrome://extensions > Developer mode > Load unpacked >
   this folder.
