# Watchdog OWASP ASVS 5.0.0 Level 2 Readiness Baseline

**Program:** Watchdog `/property/`  
**Baseline date:** 2026-08-19  
**Target:** OWASP Application Security Verification Standard 5.0.0, Level 2  
**Assurance statement:** This is an internal readiness assessment. It is not an OWASP certification, endorsement, or independent verification.

## Purpose

Use ASVS as Watchdog's technical application-security requirements catalog while the product is still being built. Every applicable Level 2 requirement should eventually have one of these dispositions: `verified`, `partial`, `not verified`, or `not applicable`, with an evidence path and dated review.

OWASP ASVS 5.0.0 is the pinned version for this baseline. Requirement references must use the versioned form `v5.0.0-x.y.z` so future ASVS revisions do not silently change the meaning of evidence.

## Current evidence already available

| Security area | Current Watchdog evidence | Baseline status | Next no-cost action |
|---|---|---|---|
| Encoding, sanitization, validation | Edge Functions and frontend validation patterns; `property/tests/security-contracts.mjs` | Partial | Build requirement-level test/evidence map for untrusted inputs and output contexts. |
| Authentication | Supabase Auth; authenticated Edge Function patterns; verification-code flow | Partial | Inventory every authentication path and document equivalent strength/recovery behavior. |
| Session management | Supabase browser sessions and server-side bearer verification | Partial | Document session lifecycle, expiry, sign-out, refresh, and re-authentication requirements. |
| Authorization | RLS, entitlements, developer checks, access-boundary audit | Strong partial | Map authorization evidence requirement-by-requirement and add dynamic tests for sensitive routes. |
| OAuth/OIDC | Google/Supabase authentication integration | Partial | Record OAuth/OIDC flow, redirect allowlist, state/PKCE responsibilities, token exposure boundaries. |
| Cryptography | Provider TLS, signed Stripe/Paddle webhooks, opaque tokens and hashes | Partial | Inventory cryptographic uses and ensure algorithms/keys are provider-managed or replaceable. |
| Secure communication | HTTPS production hosting; HSTS contract | Partial | Add repeatable production TLS/HSTS evidence and external grade evidence when available. |
| Configuration | Security headers, deployment policy, source inventory | Partial | Inventory production security-sensitive settings and fail-closed defaults. |
| Data protection | RLS, privacy policy, telemetry minimization, consent ledger patterns | Partial | Map data classification, retention, export/deletion, and connector transfers. |
| Logging/error handling | Incident runbook and sanitized telemetry rules | Partial | Verify production logs never expose tokens, secrets, sensitive profile values, or raw provider payloads. |
| API/web services | Authenticated Edge Functions, provider-signature webhooks, CORS contracts | Strong partial | Inventory every externally reachable API and classify auth, authorization, rate-limit and replay controls. |
| File handling | Limited current scope | Not verified | Inventory every upload/download/render path before marking requirements applicable or N/A. |
| Architecture/secure coding | Git source-of-truth deployment policy and CI security contracts | Partial | Build threat models for auth, billing, marketing, AI, exports, and material connectors. |
| WebRTC | No material Watchdog use identified in this baseline | Candidate N/A | Re-evaluate if voice/video or browser real-time media is introduced. |

## Priority Level 2 verification queue

The first requirement-level reviews should focus on the highest-impact Watchdog boundaries:

1. **Authentication documentation** — document all sign-in, recovery and verification paths and the controls applied to each.
2. **One-time code handling** — verify out-of-band/one-time verification codes cannot be successfully reused.
3. **Session lifecycle** — document all session-producing systems, expiry/termination behavior, and re-authentication for sensitive account changes.
4. **Authorization** — demonstrate server/database authorization independently of client-side hiding for developer, paid-tier, account and record boundaries.
5. **OAuth/OIDC** — verify transaction binding, redirect constraints, PKCE/state/nonce responsibilities and token exposure.
6. **Backend-to-backend communication** — identify service identities, scopes and least privilege; replace static privileged credentials where practical.
7. **Security logging** — document required security events and prohibited sensitive fields.
8. **Data protection** — classify customer profile, lead, verification, billing metadata and public-record data; link retention/deletion requirements.
9. **Secure communication** — retain repeatable TLS/HSTS evidence for production domains.
10. **Configuration** — document fail-closed behavior, security headers, secret boundaries and production configuration ownership.

## Verification record template

For each applicable Level 2 requirement, record:

- ASVS ID using `v5.0.0-x.y.z`;
- applicability and rationale;
- status: verified / partial / not verified / N/A;
- implementation owner/component;
- evidence path(s);
- test method and most recent date;
- residual risk;
- remediation or next review date.

## Completion rule

Watchdog must not state that it "meets ASVS Level 2" merely because this file exists. A Level 2 conformance statement should require a complete applicability decision across the Level 2 requirement set, evidence for every applicable requirement, current testing, and a deliberate claim review. Independent validation remains preferred before a strong public assurance statement.

## Official reference

OWASP Application Security Verification Standard: `https://owasp.org/www-project-application-security-verification-standard/`
