# Backend changes made for the Android app

Website (Vercel) and Supabase changes that exist only because the app needs them. Each entry says what changed, why, and what the app can rely on. Paths are physical repository paths; public URLs are the clean `https://www.watchdogindex.com/...` ones.

## `GET /api/watchdog-property`: the property row as JSON

Physical file: `api/watchdog-property.js` (Vercel function, `vercel.json` `functions` entry with the same `includeFiles` as `api/watchdog-extension.js`). Contract test: `property/tests/watchdog-property-json-contract.mjs` (`npm run test:watchdog-property-json`, offline, not part of `vercel-build`).

Why: the HTML property page, true-cost card and checkup card each compute the numbers the app's Property and Scan screens show (bill year, rate trend, Chapter 123 corridor, "does it hold up", town comparison, price check), but none of them returned JSON, the public RPC is service-role only, the photo has to be signed server-side, and the ROBUST parts were not reachable at all. This route reuses those modules' exported helpers so the app gets one JSON document and never re-implements the math.

### Request

- `GET /api/watchdog-property?pin=<pams_pin>`
- `GET /api/watchdog-property?address=<listing address>[&lat=<lat>&lon=<lon>][&price=<listing price>]`
- Optional `price=` on either form adds `derived.price_check`. `$` and `,` are stripped; clamped to 0..50,000,000 like `/true-cost`.
- Headers: `Authorization: Bearer <Supabase access token>` (required), `Accept: application/json`.
- `HEAD` is accepted and returns headers only. It stops after the input and token checks: a `200` means "this token works here", not "this property exists". No usage row is written, nothing is looked up, scored or signed, so a probe costs no quota and no backend work.

### Who may call it

- Any signed-in Watchdog account. The session is verified exactly as the extension key API does it (`sessionUser`: the JWT is sent to `/auth/v1/user` with the service key; anything that does not resolve to a user is `401`).
- No plan gate: this is the same public-record data the anonymous HTML page serves. The plan is read only to put the agent's `&agent=<slug>` on the card links (active Agent-tier plan or developer role, via `agentAccess`) and to exempt developer accounts from the cap.
- Every `GET` writes one `usage_events` row (`metric_key: 'app_property_lookup'`, `quantity: 1`, `metadata: { lookup: 'pin' | 'address' }`) tied to the user id. The write is started before the lookup and must have landed before any answer goes out, so misses (a `404`, and a `503` the backend caused) are counted too; if the write itself fails the answer is a `503`, never a free lookup.
- Cap: 2,000 lookups per account per UTC day, counted from the same table (`occurred_at >= <UTC midnight>`). Over the cap: `429 { error: 'Daily lookup limit reached. It resets at midnight UTC.' }` with `Retry-After: <seconds to UTC midnight>` (a plain number of seconds, not a timestamp; the app keeps it in `QuotaException.retryAfterSeconds`, separate from the edge functions' `reset_at`); a refused call is not counted. Developer accounts are counted but not capped, as with the extension. This is a separate meter from the extension's 600-per-24-hours `extension_lookup` key.
- The cap is best effort, like the extension's: the count and the write are two PostgREST calls with no lock between them, so requests that arrive at the same moment near the limit can all pass and the day can overshoot 2,000 by the number of concurrent requests. That is acceptable for a bulk-feed deterrent; a hard cap would need a SQL function that counts and inserts in one statement.
- Time budget: `vercel.json` gives the function `maxDuration: 15`. The plan read and the count run together, the usage write runs alongside the lookup, and the two `usage_events` calls have a 4 s timeout (other backend calls keep 6 s, the scorer 5 s), so a slow backend ends in the documented `503`, not the platform's non-JSON `504`.

### Response

`200` with `Cache-Control: private, max-age=300`, `Vary: Authorization`, `X-Robots-Tag: noindex, nofollow`, `Content-Type: application/json; charset=utf-8`:

```
{ ok: true,
  property: { pams_pin, address, town, county, block, lot, qualifier, prop_class, year_built, acres, dwelling_units,
              building_desc, land_value, improvement_value, assessed_value, last_year_tax, last_sale_price, last_sale_date,
              last_sale_year, source_synced_at, lat, lon,
              score: { score, verdict, confidence, evidence_coverage, model_version, computed_at, source,
                       components: { recourse, fairness, burden, uniformity, stability, trajectory } } | null,
              town_compare: { peers, median_tax, median_assessed, share_paying_less, refreshed_at } | null,
              neighbors: [{ pams_pin, address, town, assessed_value, last_year_tax }],
              recent_sales: [{ pams_pin, address, town, price, date, year_built, assessed_value, same_street }],
              sales_summary: { count, median, first_date, last_date },
              alerts_enabled },
  photo_url: string | null,
  derived: { display: { address, town, county, class_label, property_path },
             bill: { year, label, current: { year, amount, general_rate_only } | null },
             rate_trend: { points: [{ year, rate }], latest: { year, rate }, first: { year, rate }, cut_at_reval } | null,
             rate_change: { from_year, to_year, per_year_pct } | null,
             chapter123: { district, tax_year, ratio, lower, upper } | null,
             revalued_2026: boolean,
             holds_up: { floor, implied, limit, ratio } | null,
             town_compare_text: string | null,
             next_deadline: { date, note },
             price_check: { verdict, expected_tax, text } | null,
             links: { property, true_cost, checkup } },
  confident?: boolean, alternatives?: [{ pin, address, town }] }   // address lookups only
```

Notes the app can rely on:

- `score.components` are bare integers 0..100 or `null` (normalized with the page's `componentScore`), whatever shape the cache stored. `score.source` is `robust_public_cache` for a cached row, otherwise whatever `workbench-score` reports for the on-demand score (`robust_on_demand`, or `robust_public_cache` when it finds a fresh cache entry the RPC missed). `score` is `null` when neither exists; never a fake zero.
- When the cache has no score and `workbench-score` could not answer (its shared-IP `public_score` rate limit of 80 per minute, which every app and extension user behind the Vercel egress IP shares; an outage; a timeout), the answer is still `200` with `score: null`, but with `Cache-Control: private, no-store` instead of `max-age=300`, so the app does not remember the gap as "this home has no score" and asks again on its next visit. A genuine "nothing to score" answer keeps `max-age=300`. The on-demand call carries `x-client-info: watchdog-property/1.0` (the extension keeps `watchdog-extension/1.1`), so the two can be told apart in the function's logs when that limit trips.
- `lat`/`lon` come from `property_lookups` (`select=pams_pin,lat,lon`, the same select the extension uses to break address ties); `null` when the parcel has no coordinates.
- `photo_url` is a signed, week-long URL for the approved homeowner photo, or `null`. The private storage key is never returned.
- `derived.bill` is always an object (`{ year: null, label: 'Latest annual tax', current: null }` when the bill year cannot be matched to a town rate). All other `derived` blocks are `null` exactly when their helper has nothing.
- `derived.chapter123.tax_year` is read from `chapter123-ratios-2026.json` (`tax_year`), not hard-coded.
- `derived.next_deadline` is computed at request time (April 1 of the next tax year; May 1 in 2026 for revalued districts).
- `derived.price_check` mirrors the true-cost card: `verdict` is the card's title ("In line for this price", "Low tax for this price", "On the high side for this price", "Assessed high for this price", "Comparison not available"), `expected_tax` is what homes selling for that price in the town usually pay (rounded, or `null`), `text` is the card's sentence.
- Fields that are never present: `zip` (the owner's mailing ZIP), `photo_path`, owner names, owner mailing addresses, the RPC's internal `precomputed` and `sale_flagged_non_market` flags. The response is built field by field; the database row is never spread into it.
- Links are clean root-level `https://www.watchdogindex.com` URLs. Nothing under `/property/`.

### Errors

| Status | Body | Headers |
|---|---|---|
| `405` | `{ error: 'Method not allowed' }` | `Allow: GET, HEAD` |
| `401` | `{ error: 'Sign in again.' }` | (no token, or the token does not resolve) |
| `400` | `{ error: 'Unknown property.' }` | bad `pin`, or neither `pin` nor `address` |
| `400` | `{ error: 'Not a New Jersey street address.' }` | `address` without a house number |
| `404` | `{ error: 'Not found on the New Jersey tax list.' }` | no row for the pin; for an address, also `alternatives: [{ pin, address, town }]` (closest listings, up to 4) |
| `429` | `{ error: 'Daily lookup limit reached. It resets at midnight UTC.' }` | `Retry-After: <seconds>` |
| `503` | `{ error: 'Watchdog is unavailable right now. Try again in a minute.' }` | `Retry-After: 60`, `Cache-Control: no-store` |

All non-200 responses are `Cache-Control: private, no-store` unless the table says otherwise.

Errors the platform sends from outside the function (Vercel's own 502/504 pages, a `text/html` or `text/plain` body) are not JSON. The app reads every error body null-tolerantly and maps those by status alone, so a gateway page is a retryable server failure in the app, never an "unreadable answer"; the `HEAD` probe, the two `400` bodies and the `429` `Retry-After` seconds are what the app's `PropertyApi` documents and tests against.

### Address resolution (Scan flow)

Same as the browser extension, now in one shared function (`resolveAddress` in `api/watchdog-extension.js`): parse "102 Grant Ave, Harrison, NJ 07029" (a bare "102 Grant Ave Harrison NJ" also works), try the tax list's street spellings, keep exact street matches only, then prefer the candidate within 250 m of `lat`/`lon` when the app has them, then the named town, then a single statewide match. `confident: false` with `alternatives` means the app should ask the user to pick.

### Small changes to existing modules (additive, no behavior change)

- `api/watchdog-property-page.js`: exports `signPhoto`.
- `api/watchdog-true-cost.js`: `townFacts` also returns `lower` (Chapter 123 lower limit) and `ratioYear` (the file's `tax_year`); `loadRefs` keeps `tax_year`.
- `api/watchdog-extension.js`: `scoreOnDemand(row, client)` now also carries `evidence_coverage`, `model_version`, `components`, `computed_at` and `source` from `workbench-score` (the extension summary still reads only `score`/`verdict`/`confidence`), takes the `x-client-info` label as its second argument (default unchanged: `watchdog-extension/1.1`), and returns `{ unavailable: true }` instead of `null` when the function did not answer (non-2xx, timeout, unreadable body), keeping `null` for "answered, nothing to score"; the extension's own lookup treats `unavailable` as no score, exactly as before. `rest(b, path, init)` accepts `init.timeoutMs` (default 6000). The address-resolution block of `lookup()` moved into exported `resolveAddress` and `parcelCoords` with identical behavior; `backend`, `rest`, `sessionUser`, `agentAccess`, `scoreOnDemand` and `toNumber` are exported.

### App-side contract test

`watchdogandroid/core/src/test/kotlin/com/watchdogindex/agent/core/api/PropertyApiTest.kt` decodes the exact success body the route's contract test prints (`WATCHDOG_PROPERTY_SAMPLE=1 npm run test:watchdog-property-json`, checked in as `core/src/test/resources/watchdog-property-sample.json`) through `PropertyApi.Response` and `PropertyMapper`, and drives `PropertyApi` through Ktor's `MockEngine` for the 401 -> refresh -> retry path, the 404 with `alternatives`, the 429 with `Retry-After` (also from a body that is not JSON), the 503, and a non-JSON 502 page. When the route's shape changes, regenerate the fixture and re-run `cd watchdogandroid/core && ./gradlew test`.

Nothing about plan gates, RLS, the billing gate or the Supabase schema changed. `usage_events.metric_key` is free text (no check constraint), so the new key needs no migration.
