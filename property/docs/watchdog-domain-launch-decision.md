# Watchdog primary-domain launch decision

**Decision date:** August 22, 2026  
**Status:** Domain serving and Watchdog entry/canonical split accepted; interactive auth and Stripe Live acceptance remain  
**Launch umbrella:** NJW-271  
**Execution issue:** NJW-272

## Approved primary domain

**`watchdogindex.com`** is the approved primary production domain for Watchdog.

The production serving topology verified on August 22, 2026 is:

- canonical serving host: `https://www.watchdogindex.com`;
- apex `https://watchdogindex.com` permanently redirects to `https://www.watchdogindex.com`;
- both hosts are attached to the existing Vercel `njtaxrelief` project;
- `https://www.watchdogindex.com/` permanently routes into the Watchdog application at `/property/`;
- `https://njpropertytaxrelief.com/` remains the existing NJ Property Tax Relief homepage.

The public/master brand remains **Watchdog**. The domain does not rename the company to “Watchdog Index.” Product naming remains governed by `watchdog-brand-architecture.md`:

- Watchdog — master brand/platform;
- Watchdog Score — canonical result;
- ROBUST Framework — methodology;
- Watchdog Index — geographic/time-series measurement family;
- Watchdog Atlas — public exploration experience.

## Migration posture

This is a Watchdog application-domain cutover, not a platform move and not a requirement to retire the entire NJPropertyTaxRelief.com site.

The existing Vercel project, GitHub repository, Supabase project, production database, users, entitlements, saved properties, reports, analytics history, markers, Data Center data, integrations and product code remain in place.

The shared Supabase Authentication Site URL remains `https://njpropertytaxrelief.com` during coexistence. WatchdogIndex is enabled through explicit Additional Redirect URLs, and application OAuth code uses the initiating browser origin. This avoids forcing legacy NJPropertyTaxRelief.com authentication flows to land on WatchdogIndex before migration acceptance.

The migration remains additive:

1. retain `njpropertytaxrelief.com` and its current root/content experience;
2. keep `watchdogindex.com` and `www.watchdogindex.com` attached to Vercel project `njtaxrelief`;
3. keep explicit Supabase Auth redirect coverage for both WatchdogIndex hosts while retaining legacy-domain redirect coverage;
4. retain both old and new hosts in Google Maps/Places browser-key referrer restrictions and any provider allowlists that are actually domain-bound;
5. use host-specific routing and metadata so WatchdogIndex can be canonical for Watchdog while the legacy tax-relief site remains operational;
6. keep billing, report-sharing and other server-generated return links scoped to the approved host that initiated the request;
7. complete interactive authenticated acceptance on WatchdogIndex;
8. run the controlled Stripe Live lifecycle against WatchdogIndex and persist the billing release-gate pass before public paid checkout opens;
9. migrate or redirect only legacy Watchdog application paths where evidence supports it. Do **not** blanket-redirect the entire NJPropertyTaxRelief.com domain while its tax-relief content remains intentionally active;
10. keep ownership of the old domain and preserve intentional legacy content, backlinks and search equity.

## Accepted production evidence

Vercel production now returns:

- `https://watchdogindex.com/` → permanent redirect to `https://www.watchdogindex.com/`;
- `https://www.watchdogindex.com/` → permanent host-specific redirect to `/property/`;
- `https://www.watchdogindex.com/property/` → HTTP 200 and the Watchdog property application;
- `https://www.watchdogindex.com/property/onboarding/` → HTTP 200;
- `https://njpropertytaxrelief.com/` → the existing NJ Property Tax Relief homepage;
- `https://njpropertytaxrelief.com/property/` → HTTP 200 for coexistence/rollback.

The WatchdogIndex `/property/` crawler response now advertises:

- HTML canonical: `https://www.watchdogindex.com/property/`;
- Open Graph URL: `https://www.watchdogindex.com/property/`;
- Open Graph site name: `Watchdog`;
- JSON-LD WebApplication ID, application URL and provider URL on WatchdogIndex;
- WatchdogIndex breadcrumb URLs;
- HTTP `Link` canonical header pointing to `https://www.watchdogindex.com/property/`.

The NJPropertyTaxRelief `/property/` response remains unchanged and continues to advertise its legacy-host metadata during coexistence.

This host-aware split is implemented with:

- `api/watchdog-index-entry.js` for the canonical WatchdogIndex landing response;
- root `middleware.js` using Vercel Routing Middleware to intercept the WatchdogIndex property entry before the static cache while passing all legacy-host requests through;
- `@vercel/functions` pinned for the routing middleware runtime.

The production deployment containing the middleware built successfully, and a post-deploy Vercel runtime error/fatal query returned no errors for the deployment.

## Provider and server-bound preparation

The owner confirmed WatchdogIndex was added to Supabase Auth Additional Redirect URLs while intentionally retaining the existing Supabase Site URL.

The owner also confirmed the Google browser-key referrer allowlist now includes all four coexistence hosts:

- `https://njpropertytaxrelief.com/*`
- `https://www.njpropertytaxrelief.com/*`
- `https://watchdogindex.com/*`
- `https://www.watchdogindex.com/*`

Production Supabase Edge preparation is live and additive:

- `report-share` v19 accepts both old and new production origins and generates share URLs from the approved production host that initiated the request;
- `create-portal-session` v27 accepts both old and new production origins and returns Stripe Portal users to the initiating approved host;
- `create-checkout-session` v40 accepts both old and new production origins, generates Stripe success/cancel/Portal returns from the initiating approved host, and restores the auditable database-backed `live_billing_lifecycle` release gate after deployed v39 had regressed to environment-only checkout control;
- the legacy Paddle management path remains management-only for the existing subscriber;
- public paid checkout remains fail-closed under NJW-42.

## Remaining launch acceptance

The remaining work is deliberately narrower than a domain migration:

1. interactive browser acceptance for WatchdogIndex authentication, including Google sign-in return, email/passwordless flows where used, session persistence and logout;
2. interactive address/search acceptance so browser-bound Google restrictions are proven from the new origin;
3. bounded review of other public Watchdog `/property/*` SEO surfaces before changing their canonical ownership; do not blind-replace old-domain references that belong to the still-active tax-relief site;
4. controlled real Stripe Live lifecycle under NJW-42 using signed provider evidence;
5. only after those passes, decide which legacy Watchdog application URLs should redirect to WatchdogIndex while leaving the tax-relief root/content intact.

The automated browser available in the current execution environment is blocked by administrator network policy from navigating to the public site, so interactive OAuth and browser-restricted Google acceptance must not be claimed from automation evidence that does not exist.

## Governing runbook

All remaining steps, validation and rollback are governed by:

`property/docs/watchdog-domain-cutover-runbook.md`

No broad redesign, marker expansion or unrelated feature work belongs in this cutover.
