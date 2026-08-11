# Google Maps production key restriction

Verified from Google Cloud Console evidence supplied 2026-08-11 for project `nj-property-tax-relief`.

## Application restriction

The browser Google Maps key is restricted to **Websites** with these allowed referrers:

- `https://njpropertytaxrelief.com/*`
- `https://www.njpropertytaxrelief.com/*`

The Google Cloud console notes that restriction changes can take up to five minutes to propagate.

## Follow-up verification

The repository currently uses the Google key in `property/js/lookup.js` for Street View Static imagery. Application restrictions are now evidenced. API-level restriction should also be limited in Google Cloud to the specific Maps APIs used by Watchdog; do not broaden the key to unrelated Google APIs.

Do not commit secret/private Google credentials to this repository.
