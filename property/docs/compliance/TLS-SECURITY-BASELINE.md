# Watchdog TLS / HTTPS Security Baseline

**Baseline date:** 2026-08-19  
**Scope:** Watchdog production web domains and browser-facing application routes.  
**Status:** Internal readiness evidence. No SSL Labs grade is claimed until an external result is captured.

## Required controls

- Production application traffic must use HTTPS.
- HTTP requests should redirect to HTTPS without exposing authenticated content over plaintext.
- Certificates must be valid for the requested hostname and monitored for expiry.
- `Strict-Transport-Security` must be present on production responses with a deliberate max-age.
- `X-Content-Type-Options: nosniff`, frame protection, referrer policy and permissions policy must remain in the deployment security-header contract.
- TLS/certificate termination is provider-managed unless an explicit architecture decision documents otherwise.
- HSTS `includeSubDomains` and browser preload must not be enabled casually; all affected subdomains must be inventoried first.

## Current evidence

- `vercel.json` security headers are asserted by `property/tests/security-contracts.mjs`.
- Production canonical URLs use HTTPS.
- Application/payment return URLs in current billing code use HTTPS production origins.

## Evidence still required

1. Dated production response capture for each canonical Watchdog domain.
2. Certificate subject/issuer/expiry and hostname validation evidence.
3. HTTP-to-HTTPS redirect evidence.
4. Negotiated modern TLS protocol/cipher evidence.
5. HSTS value review against subdomain strategy.
6. A dated SSL Labs result for the production domain when available at no cost.

## Grade policy

Watchdog must not publish "SSL Labs A+" unless a current Qualys SSL Labs test for the exact production hostname reports A+. A grade is point-in-time evidence, not a broad security certification.

## HSTS/preload decision

HSTS is a security control; preload is an operational commitment. Before `includeSubDomains` or preload is adopted, inventory every active and planned subdomain and confirm each can remain HTTPS-only. Record the decision in the compliance log.

## Next no-cost implementation

Add a repeatable production TLS check that records:

- final HTTPS URL;
- redirect status;
- certificate validity window;
- negotiated TLS version;
- HSTS header;
- key browser security headers.

Run the check after material hosting/domain changes and retain sanitized output as evidence.
