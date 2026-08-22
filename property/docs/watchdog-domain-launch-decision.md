# Watchdog primary-domain launch decision

**Decision date:** August 22, 2026  
**Status:** Approved and acquired; cutover in progress  
**Launch umbrella:** NJW-271  
**Execution issue:** NJW-272

## Approved primary domain

**`watchdogindex.com`** is the approved primary production domain for Watchdog.

Canonical public host after acceptance:

`https://watchdogindex.com`

`www.watchdogindex.com` should redirect permanently to the apex after the new host is verified.

The public/master brand remains **Watchdog**. The domain does not rename the company to “Watchdog Index.” Product naming remains governed by `watchdog-brand-architecture.md`:

- Watchdog — master brand/platform;
- Watchdog Score — canonical result;
- ROBUST Framework — methodology;
- Watchdog Index — geographic/time-series measurement family;
- Watchdog Atlas — public exploration experience.

## Migration posture

This is a domain cutover, not a platform move.

The existing Vercel project, GitHub repository, Supabase project, production database, users, entitlements, saved properties, reports, analytics history, markers, Data Center data, integrations and product code remain in place.

The migration must be additive until acceptance passes:

1. retain `njpropertytaxrelief.com` while the new host is attached and tested;
2. attach `watchdogindex.com` and `www.watchdogindex.com` to the existing Vercel `njtaxrelief` project;
3. add the new host to auth, OAuth, Maps/Places, CORS and provider allowlists before removing any old-host allowance;
4. validate the full application on the new domain;
5. switch canonical/public URL generation only after the host is healthy;
6. run the controlled Stripe Live lifecycle against final production return URLs;
7. persist the billing release-gate pass before public paid checkout opens;
8. then redirect `njpropertytaxrelief.com` path-for-path to `watchdogindex.com` with permanent redirects;
9. keep ownership of the old domain as an SEO/backlink migration asset.

## Current execution state

At the first Vercel project check after acquisition, `watchdogindex.com` had been purchased but had not yet appeared as an assigned domain on project `njtaxrelief`.

Repository preparation has started additively. Stripe Checkout and Customer Portal server origin boundaries now accept `watchdogindex.com` and `www.watchdogindex.com` while continuing to accept the existing production domain. Their default/public return host has intentionally **not** been changed yet.

Do not flip canonical tags, share URLs, `PUBLIC_SITE_URL`, authentication Site URL, old-domain redirects, or public Stripe return URLs until the new Vercel host is attached and verified.

## Governing runbook

All remaining steps, validation and rollback are governed by:

`property/docs/watchdog-domain-cutover-runbook.md`

No broad redesign, route restructuring, marker expansion or unrelated feature work belongs in this cutover.