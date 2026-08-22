# Watchdog primary-domain launch decision

**Decision date:** August 22, 2026  
**Status:** Acquired, attached and serving; cutover validation in progress  
**Launch umbrella:** NJW-271  
**Execution issue:** NJW-272

## Approved primary domain

**`watchdogindex.com`** is the approved primary production domain for Watchdog.

The production serving topology verified on August 22, 2026 is:

- canonical serving host: `https://www.watchdogindex.com`;
- apex `https://watchdogindex.com` permanently redirects to `https://www.watchdogindex.com`;
- both hosts are attached to the existing Vercel `njtaxrelief` project.

The cutover will align to this working topology rather than add a competing apex/www redirect layer.

The public/master brand remains **Watchdog**. The domain does not rename the company to “Watchdog Index.” Product naming remains governed by `watchdog-brand-architecture.md`:

- Watchdog — master brand/platform;
- Watchdog Score — canonical result;
- ROBUST Framework — methodology;
- Watchdog Index — geographic/time-series measurement family;
- Watchdog Atlas — public exploration experience.

## Migration posture

This is a Watchdog application-domain cutover, not a platform move and not a requirement to retire the entire NJPropertyTaxRelief.com site.

The existing Vercel project, GitHub repository, Supabase project, production database, users, entitlements, saved properties, reports, analytics history, markers, Data Center data, integrations and product code remain in place.

The shared Supabase Authentication Site URL may remain `https://njpropertytaxrelief.com` during coexistence. WatchdogIndex is enabled through explicit Additional Redirect URLs, and application OAuth code uses the initiating browser origin. This avoids forcing legacy NJPropertyTaxRelief.com authentication flows to land on WatchdogIndex before migration acceptance.

The migration remains additive until acceptance passes:

1. retain `njpropertytaxrelief.com` and its current root/content experience during authenticated and provider validation;
2. keep `watchdogindex.com` and `www.watchdogindex.com` attached to Vercel project `njtaxrelief`;
3. keep explicit Supabase Auth redirect coverage for both WatchdogIndex hosts while retaining legacy-domain redirect coverage;
4. add the new hosts to Google Maps/Places browser-key referrer restrictions and any provider allowlists that are actually domain-bound;
5. validate the Watchdog application on `www.watchdogindex.com`;
6. route the WatchdogIndex root into the Watchdog application without changing the NJPropertyTaxRelief.com root;
7. converge Watchdog `/property/*` canonical/public URL generation on `https://www.watchdogindex.com` only after auth, Maps/Places and route acceptance;
8. run the controlled Stripe Live lifecycle against WatchdogIndex and persist the billing release-gate pass before public paid checkout opens;
9. migrate or redirect only legacy Watchdog application paths where evidence supports it. Do **not** blanket-redirect the entire NJPropertyTaxRelief.com domain while its tax-relief content remains intentionally active;
10. keep ownership of the old domain and preserve intentional legacy content, backlinks and search equity.

## Verified execution state

Vercel now returns:

- `https://watchdogindex.com/` → permanent redirect to `https://www.watchdogindex.com/`;
- `https://www.watchdogindex.com/` → HTTP 200;
- `https://www.watchdogindex.com/property/` → HTTP 200 and the Watchdog property application;
- `https://www.watchdogindex.com/property/onboarding/` → HTTP 200.

A routing issue remains before final canonical cutover: the new-domain root currently serves the legacy NJ Property Tax Relief homepage, while the Watchdog entry experience lives at `/property/`. Resolve that boundary with host-specific routing so the old domain root remains intact.

Production Supabase Edge preparation is live and additive:

- `report-share` v19 accepts both old and new production origins and generates share URLs from the approved production host that initiated the request;
- `create-portal-session` v27 accepts both old and new production origins and returns Stripe Portal users to the initiating approved host;
- `create-checkout-session` v40 accepts both old and new production origins, generates Stripe success/cancel/Portal returns from the initiating approved host, and restores the auditable database-backed `live_billing_lifecycle` release gate after deployed v39 had regressed to environment-only checkout control;
- the legacy Paddle management path remains management-only for the existing subscriber;
- public paid checkout remains fail-closed under NJW-42.

## Remaining provider-bound work

The owner has added WatchdogIndex to Supabase Auth Additional Redirect URLs while intentionally retaining the existing Supabase Site URL.

Repository evidence in `GOOGLE-MAPS-KEY-RESTRICTION.md` still shows the browser Maps key restricted only to:

- `https://njpropertytaxrelief.com/*`
- `https://www.njpropertytaxrelief.com/*`

Before normal WatchdogIndex traffic is routed into the application, add:

- `https://www.watchdogindex.com/*`
- `https://watchdogindex.com/*`

Retain the legacy referrers during coexistence.

After Google browser-domain acceptance is evidenced, proceed with host-specific WatchdogIndex root routing, Watchdog canonical/OG/schema migration, authenticated/search/mobile acceptance, and the controlled Stripe lifecycle under NJW-42.

## Governing runbook

All remaining steps, validation and rollback are governed by:

`property/docs/watchdog-domain-cutover-runbook.md`

No broad redesign, marker expansion or unrelated feature work belongs in this cutover.
