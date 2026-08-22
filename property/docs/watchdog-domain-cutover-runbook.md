# Watchdog domain cutover runbook

**Status:** Prepared, awaiting final primary-domain decision  
**Date:** August 22, 2026  
**Launch umbrella:** NJW-271  
**Rule:** Perform one deliberate cutover. Do not partially migrate public surfaces before the final domain is owned and approved.

## Purpose

The domain is the remaining owner-level brand launch decision. This runbook prepares the migration so the domain choice itself does not trigger a second round of product work.

The cutover must preserve existing indexed URLs, authentication, billing, analytics, email, API, integrations, security boundaries, and rollback capability.

## Inputs required from the owner

Before production migration begins:

- final primary Watchdog domain;
- whether `www` or apex is canonical;
- any defensive/product domains to redirect;
- registrar/DNS control confirmed;
- trademark/domain-risk review completed to the owner's satisfaction.

## Canonical URL policy

Once the final domain is selected:

1. Pick exactly one canonical host.
2. Redirect all alternate Watchdog hosts to that canonical host with permanent redirects only after verification.
3. Preserve path and query string during redirects unless a route has an explicit migration mapping.
4. Do not strand `/property/*` backlinks.
5. Keep the current production domain functioning as a redirect origin for a long migration window.
6. Canonical tags, sitemap URLs, Open Graph URLs, structured data, feeds, and share links must all converge on the same host.

## Pre-cutover inventory

Build an exact inventory immediately before cutover from current `main` and production configuration.

### Public web

- primary landing pages;
- `/property/` application and public pages;
- town/municipality/county pages;
- Insights/articles;
- compare pages;
- pricing/account/support/legal/trust/status surfaces;
- report-share and other public share routes;
- robots.txt and sitemaps;
- manifest/PWA assets if applicable.

### Authentication and identity

Update and verify every applicable origin/redirect allowlist:

- Supabase Site URL;
- Supabase additional redirect URLs;
- Google OAuth authorized JavaScript origins;
- Google OAuth redirect URIs;
- any email verification/recovery return URLs;
- any other identity-provider callback configuration.

Do not remove the old production host until existing sessions and in-flight auth links have been safely handled.

### Supabase Edge Functions and CORS

Search current Edge Function source for hard-coded production origins and update only those that are intentionally domain-bound.

At minimum review:

- CORS origin sets;
- auth return URLs;
- report/share URLs;
- billing success/cancel/portal return URLs;
- email links;
- integration webhook/callback URLs;
- analytics referrer/origin assumptions;
- automation callback URLs.

Preserve localhost/staging origins where intentionally required.

### Stripe

Verify/update:

- Checkout success URLs;
- Checkout cancel URLs;
- Customer Portal return URL;
- product/pricing links that expose the old host;
- webhook endpoint only if its public URL changes;
- branded customer-facing business URL if applicable.

Do not open public paid checkout merely because the domain is ready. The `live_billing_lifecycle` gate must already be `passed`.

### Legacy Paddle

The existing Paddle subscriber management path must continue to work after cutover.

Review only the management/return URLs required for that legacy account. Do not re-enable new Paddle enrollment.

### Google and mapping APIs

Review restrictions that may be tied to the old host:

- Google Maps / Places browser key HTTP referrers;
- address autocomplete keys;
- any Google API OAuth consent/app-domain configuration.

Add the new host before removing the old host so the cutover cannot strand location-dependent search.

### Email and communications

Review:

- verification emails;
- password recovery;
- transactional templates;
- Kit/BoldTrail/marketing links where applicable;
- sender-domain authentication if the new domain will be used for email;
- unsubscribe/privacy/support links;
- invitation/share links.

Changing the website domain does not require changing the email sending domain in the same release unless deliberately approved.

### Integrations

Review every connected provider for domain-bound callbacks or allowlists:

- CRM integrations;
- BoldTrail;
- Kit;
- Zapier/app integrations;
- Google Ads OAuth;
- PCM/direct-mail webhooks and callback links;
- future API documentation/examples.

Do not rotate provider secrets merely because the host changes unless the provider requires it.

### Analytics and monitoring

Update/verify:

- first-party analytics host classification;
- internal-account exclusions;
- referrer handling;
- conversion URLs;
- uptime checks;
- status monitoring;
- error/incident telemetry;
- Search Console / webmaster properties;
- any ad conversion destinations.

Maintain an annotation for the cutover date so traffic/SEO changes are explainable.

## Repository search requirements

Immediately before code changes, search current `main` for:

- `njpropertytaxrelief.com`
- `www.njpropertytaxrelief.com`
- absolute `/property/` URLs where host assumptions matter
- CORS origin arrays
- canonical/meta URL builders
- sitemap generators/static sitemap files
- auth redirect construction
- Stripe return URLs
- email/share URL generation

Do not blind-replace every string. Classify each occurrence as:

- must migrate;
- intentionally historical/documentation;
- staging/local/test;
- legacy redirect origin;
- unrelated text/content.

## Migration implementation

Recommended order:

1. Add the new domain to hosting and DNS without removing the old host.
2. Verify TLS and a non-destructive preview/host binding.
3. Add new auth/OAuth/API/CORS allowlists while retaining old ones.
4. Update repository canonical URL configuration and domain-bound runtime origins.
5. Deploy with both old and new hosts temporarily accepted where security permits.
6. Verify the full application on the new host.
7. Update Stripe return URLs and any provider callbacks that require the canonical host.
8. Re-run authenticated acceptance and core public smoke tests.
9. Change canonical tags/sitemaps to the new host.
10. Add old-host → new-host permanent redirects preserving paths/query strings.
11. Re-verify old backlinks land at the correct new URL.
12. Submit/verify webmaster/search properties and new sitemaps.
13. Monitor auth, 404s, billing, conversions, analytics, and Edge Function errors.
14. Remove obsolete old-host allowlists only after the migration window is proven safe.

## Required acceptance matrix

Before declaring cutover complete, verify at minimum:

| Area | Required proof |
| --- | --- |
| Homepage/public funnel | 200 on canonical host; old host redirects correctly |
| Existing `/property/*` URLs | path-preserving redirect or intentional route mapping |
| Sign in | email/password and Google flow return to canonical host |
| Email verification/recovery | valid links and correct canonical return |
| Property search | Maps/Places/autocomplete operate under key restrictions |
| Authenticated dashboard | loads without CORS/session loop |
| Account & billing | canonical pricing loads; Portal returns correctly |
| Controlled checkout | only if billing gate passed; correct success/cancel return |
| Report/public shares | existing/new share URLs resolve as intended |
| Insights/SEO | canonical/OG/schema/sitemap point to new host |
| Analytics | page/conversion events classify new host correctly |
| Marketing/integrations | callback/redirect paths remain functional |
| Mobile | core launch routes pass current mobile acceptance |
| Security | no widened CORS/API-key/auth allowlist beyond required hosts |

## Redirect policy for the current domain

The current domain should become a migration asset, not disappear.

- Keep domain ownership.
- Redirect permanently to the canonical Watchdog host after cutover validation.
- Preserve paths and queries.
- Do not create redirect chains.
- Do not redirect every legacy page to the new homepage when an equivalent route exists.
- Keep certificate/DNS health monitored during the migration period.

## Rollback

A domain cutover is reversible until the old host/configuration is removed.

Rollback triggers include:

- material auth failure;
- material checkout/Portal failure;
- broad CORS failure;
- broken Google Maps/Places search;
- large unexplained 404 set caused by routing;
- report/share breakage;
- provider callback failure;
- security regression.

Rollback steps:

1. Restore the previous canonical host at the hosting layer.
2. Keep the new host online only as a temporary redirect/diagnostic host if safe.
3. Restore previous canonical/meta/sitemap config from Git history.
4. Re-enable prior provider return URLs/allowlists if they were removed.
5. Keep evidence of the failure in NJW-271 and create a bounded defect for the concrete cause.
6. Retry only after the failed acceptance item is fixed.

## Completion rule

NJW-271 can mark domain cutover complete only when:

- the owner-selected primary domain is live;
- canonical URLs are singular;
- current indexed paths are preserved or explicitly mapped;
- auth/billing/search/integrations work on the new host;
- old-host redirects are verified;
- rollback evidence exists;
- no evidence-backed domain regression remains open.

The domain decision should not be used as a reason to restart product design, add marker scope, or rename the platform away from the canonical brand architecture.
