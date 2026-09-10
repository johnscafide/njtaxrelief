# NJW-316 ANCHOR address fallback

Production evidence on 2026-09-09 showed the maintained Google Maps/Places browser key was deployed successfully but ANCHOR address suggestions still failed on njpropertytaxrelief.com.

The ANCHOR estimator now keeps Watchdog/Google Places as the primary enriched address search, but switches to the NJ Office of GIS statewide geocoder when that provider fails to initialize, rejects a suggestion request, or never binds. The fallback is browser-direct, credential-free, geographically restricted to New Jersey coordinates, requires a minimum candidate confidence score, and records `nj_ogis` as the actual address source.

This prevents a Google billing, quota, API-activation, or HTTP-referrer problem from blocking the public ANCHOR estimator while preserving the current strict verified-address submit gate and `watchdog:address-selected` integration event.
