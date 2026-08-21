# Watchdog Session Security Baseline — 2026-08-21

**Budget constraint:** $0  
**Assurance status:** Internal security-readiness evidence. This document is not an external certification or penetration-test result.

## Purpose

Establish an explicit, testable session-security position for the Watchdog `/property/` application while the product remains under active development.

## Framework mapping

- OWASP ASVS 5.0.0 Level 2 — Authentication and Session Management
- NIST CSF 2.0 — Protect / Identity Management, Authentication and Access Control
- SOC 2 — Security
- ISO/IEC 27001 readiness — identity and access management

## Current repository evidence

The centralized browser runtime in `property/js/supabase-runtime.js` configures:

- PKCE for OAuth (`flowType: 'pkce'`);
- persistent browser sessions;
- automatic access-token refresh;
- URL session detection;
- an environment-specific Supabase storage key;
- same-origin continuation URLs restricted to the `/property/` application boundary.

The existing `property/tests/auth-asvs-contract.mjs` prevents silent removal of those controls.

## Sign-out semantics

Watchdog's JavaScript client uses Supabase Auth. Supabase documents JavaScript `signOut()` as **global by default**: the affected user's refresh-token-backed sessions are terminated across devices unless a narrower scope is explicitly requested.

Watchdog therefore adopts the following policy:

1. User-facing **Sign out** actions must retain global sign-out semantics.
2. Application code must not silently introduce `{ scope: 'local' }` or `{ scope: 'others' }` for the ordinary account sign-out path without a documented security/product decision.
3. A future “sign out this device only” feature must be separately labeled and must not replace the global account sign-out control.

A new automated contract, `property/tests/session-security-contract.mjs`, scans first-party `/property/` JavaScript for explicit narrow-scope logout regressions.

## Important residual risk: access-token lifetime

Global sign-out revokes affected refresh tokens/sessions, but an access JWT that was already issued can remain valid until the token's `exp` time. This means logout is not equivalent to immediate revocation of every already-issued access token.

For ordinary low-risk reads this may be an acceptable residual risk. For future high-risk actions, Watchdog should not rely only on possession of a still-unexpired JWT after logout. Sensitive operations should use stronger server-side checks where justified, such as current-session validation and/or an elevated Authenticator Assurance Level.

## MFA / AAL2 status

Supabase supports MFA and exposes an Authenticator Assurance Level (`aal1` / `aal2`) in the active session. Repository evidence does **not** currently demonstrate that Watchdog requires AAL2 for all users or for sensitive actions.

Therefore:

- no claim is made that Watchdog currently enforces MFA;
- no claim is made that current sessions satisfy ASVS Level 2 MFA requirements;
- sensitive-action AAL2 enforcement remains a tracked gap rather than being marked implemented;
- introducing AAL2 enforcement must include both UI flow and server/database enforcement, not a browser-only check.

## Session lifetime status under the $0 constraint

Supabase documents optional time-boxed sessions, inactivity timeout and single-session enforcement as plan-dependent features. Watchdog currently has no retained evidence proving those settings are enabled in production.

Accordingly, this baseline does not claim:

- a maximum session lifetime;
- an inactivity timeout;
- single-session-per-user enforcement.

Those controls remain future options if available within the then-current product/budget constraints. Until then, Watchdog should prioritize controls that are available at no additional cost: PKCE, least privilege, global sign-out, short-lived access tokens as configured by the auth provider, authorization/RLS checks, security-sensitive action review, and MFA/AAL2 implementation if available without added cost.

## No-cost operating rules

1. Do not log access tokens, refresh tokens, authorization headers or raw auth session objects.
2. Do not place bearer tokens in URLs or analytics payloads.
3. Keep OAuth continuation URLs same-origin and within `/property/`.
4. Preserve automatic refresh-token rotation behavior provided by the auth platform.
5. Keep global user sign-out semantics unless a narrower action is deliberately labeled and reviewed.
6. Re-evaluate high-risk workflows such as account deletion, billing changes, connector credential changes, developer/admin actions, large exports and future AI/CRM actions for recent-authentication or AAL2 requirements.
7. Treat any future change to session persistence, token storage, sign-out scope, MFA enforcement or OAuth flow as a security-sensitive change requiring evidence and control-register reconciliation.

## Validation added in this tranche

`property/tests/session-security-contract.mjs` verifies:

- the central runtime still uses PKCE, persistent sessions and auto refresh;
- same-origin `/property/` redirect restrictions remain present;
- first-party application JavaScript does not explicitly downgrade normal logout to local/other-session scopes;
- obvious auth-token/authorization values are not deliberately written to browser console statements in first-party JavaScript.

## Residual risk

- MFA/AAL2 is not yet proven as enforced.
- Production provider-side JWT expiry and session settings have not been independently captured as evidence in this tranche.
- Existing access JWTs may remain usable until expiry after refresh-session revocation.
- Some older pages instantiate Supabase clients directly rather than exclusively consuming the centralized runtime, increasing configuration-drift risk.

## Next no-cost actions

1. Inventory every direct `createClient()` auth configuration and consolidate or contract-test deviations.
2. Determine whether TOTP MFA can be enabled and enforced using the existing Supabase plan with no added cost.
3. Classify sensitive actions that should require recent authentication or AAL2 before execution.
4. Capture the production JWT expiry setting without recording secrets.
5. Add a server-side current-session/AAL rule before enabling any action whose risk justifies immediate session-revocation guarantees.

## Official platform references reviewed

- Supabase Auth — Signing out: global/local/others session scopes and refresh-token revocation behavior.
- Supabase Auth — User sessions: access/refresh token lifecycle, session lifetime controls and post-signout access-token residual validity.
- Supabase Auth — Multi-Factor Authentication: AAL1/AAL2 and server/database enforcement guidance.
