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

This is a domain cutover, not a platform move.

The existing Vercel project, GitHub repository, Supabase project, production database, users, entitlements, saved properties, reports, analytics history, markers, Data Center data, integrations and product code remain in place.

The migration remains additive until acceptance passes:

1. retain `njpropertytaxrelief.com` during authenticated and provider validation;
2. keep `watchdogindex.com` and `www.watchdogindex.com` attached to Vercel project `njtaxrelief`;
3. add the new host to auth, OAuth, Maps/Places, CORS and provider allowlists before removing any old-host allowance;
4. validate the application on `www.watchdogindex.com`;
5. converge canonical/public URL generation on `https://www.watchdogindex.com` only after auth and route acceptance;
6. run the controlled Stripe Live lifecycle against final production return URLs;
7. persist the billing release-gate pass before public paid checkout opens;
8. then redirect `njpropertytaxrelief.com` path-for-path to `www.watchdogindex.com` with permanent redirects;
9. keep ownership of the old domain as an SEO/backlink migration asset.

## Verified execution state

Vercel now returns:

- `https://watchdogindex.com/` → permanent redirect to `https://www.watchdogindex.com/`;
- `https://www.watchdogindex.com/` → HTTP 200;
- `https://www.watchdogindex.com/property/` → HTTP 200 and the Watchdog property application.

A routing issue remains before final canonical cutover: the new-domain root currently serves the legacy NJ Property Tax Relief homepage, while the Watchdog entry experience lives at `/property/`. Resolve that routing boundary without rewriting the product or disrupting the old domain before the old-domain redirect stage.

Production Supabase Edge preparation is live and additive:

- `report-share` v18 accepts both old and new Watchdog origins and no longer has a single hard-coded CORS origin;
- `create-portal-session` v26 accepts both old and new origins;
- `create-checkout-session` v39 accepts both old and new origins;
- the legacy Paddle management path remains management-only for the existing subscriber;
- public paid checkout remains fail-closed under NJW-42;
- billing/share canonical return generation has not been irreversibly flipped while auth and root routing remain under validation.

The remaining external configuration checks are Supabase Auth URL configuration, Google OAuth/Maps/Places domain restrictions where applicable, then canonical SEO/share/billing URL convergence and old-domain redirects.

## Governing runbook

All remaining steps, validation and rollback are governed by:

`property/docs/watchdog-domain-cutover-runbook.md`

No broad redesign, marker expansion or unrelated feature work belongs in this cutover.
