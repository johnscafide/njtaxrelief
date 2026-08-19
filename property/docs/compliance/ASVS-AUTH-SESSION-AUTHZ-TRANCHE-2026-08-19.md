# Watchdog ASVS 5.0.0 Level 2 Identity & Authorization Verification Tranche

**Date:** 2026-08-19  
**Scope:** Authentication, session management, authorization, OAuth/OIDC  
**Assurance:** Internal verification only; no OWASP certification or full ASVS Level 2 conformance claim.

## Why this tranche

Identity and authorization are foundational to every authenticated Watchdog workflow. OWASP ASVS 5.0.0 is the pinned stable standard. This tranche starts requirement-level evidence using only requirements verified against the official ASVS 5.0.0 materials.

## Observed implementation evidence

- `property/js/supabase-runtime.js` centralizes the Supabase browser client for known Watchdog environments.
- The runtime sets `flowType: 'pkce'`, enables session persistence and refresh, and normalizes OAuth redirects through a same-origin `/property/` allow boundary.
- OAuth providers are centrally feature-flagged; Google is currently enabled in the observed runtime while Apple, Facebook, and LinkedIn OIDC are disabled by default.
- Authenticated server/database controls elsewhere in the application include bearer-session validation, RLS, plan entitlements, and developer checks.
- Explicit sign-out behavior exists in application code, but a complete active-session inventory/termination surface has not yet been verified.

## Requirement-level records

| ASVS requirement | Applicability | Status | Watchdog evidence | Residual gap / next action |
|---|---|---|---|---|
| `v5.0.0-6.1.1` Authentication security documentation including anti-automation/rate-limiting strategy and Level 2 MFA expectation | Applicable | **Partial** | Supabase Auth is the identity provider; centralized auth runtime exists | Document provider-side anti-automation/rate-limit controls and confirm production settings. L2 requires MFA; Watchdog does not currently have evidence that MFA is enforced for all users. |
| `v5.0.0-6.3.3` MFA or qualifying combination of authentication mechanisms for Level 2 | Applicable | **Not verified** | Google OAuth is enabled; provider may itself support MFA | Provider capability is not equivalent to Watchdog enforcing MFA. Decide whether to enforce MFA/strong second factor for the selected L2 target or document a deliberate target/compensating-control decision. |
| `v5.0.0-6.3.4` Multiple authentication pathways documented and consistently protected | Applicable | **Partial** | Provider list centralized in `property/js/supabase-runtime.js`; legacy email magic-link UI is programmatically removed; additional providers default disabled | Inventory every actual production auth/recovery path, including provider-side recovery/account linking, before marking verified. |
| `v5.0.0-7.5.1` Full re-authentication before sensitive authentication-attribute changes | Applicable | **Not verified** | Supabase session exists and sensitive account surfaces are authenticated | Inventory email/phone/MFA/recovery mutations and require recent authentication where the product permits those changes. |
| `v5.0.0-7.5.2` Users can view and, after re-authentication, terminate any/all active sessions | Applicable | **Not verified** | Explicit sign-out exists | No complete Watchdog active-session management surface/evidence was identified in this tranche. Assess Supabase capabilities and add user-facing/session-admin control if needed. |
| `v5.0.0-7.6.1` Federated RP/IdP session lifetime and termination behave as documented | Applicable | **Partial** | Supabase manages federated session issuance/refresh; application persists and auto-refreshes browser session | Document actual configured session lifetime, refresh behavior, logout propagation expectations, and re-authentication boundaries in production. |
| `v5.0.0-7.6.2` Session creation requires user consent or explicit user action | Applicable | **Partial** | OAuth sign-in is initiated through explicit `WatchdogAuth.signIn`/provider action | Add an automated/browser test demonstrating no new application session is silently created merely by visiting a protected route. |
| `v5.0.0-8.1.1` Authorization documentation defines function- and data-level restrictions based on permissions/resource attributes | Applicable | **Partial / strong evidence** | RLS, plan entitlement tests, developer gate, access-boundary audit, control register | Consolidate authorization model into a formal matrix covering roles/plans/resources and retain dynamic negative tests. |

## OAuth/OIDC implementation findings

ASVS 5.0 introduced a dedicated OAuth/OIDC chapter. The full V10 Level 2 requirement-by-requirement mapping remains a follow-on tranche, but the implementation already has several positive design signals:

- PKCE is explicitly selected in the Supabase client runtime.
- OAuth redirection is normalized to the current origin and restricted to `/property/`, with onboarding handled through a controlled redirect helper.
- New providers are not implicitly enabled merely because their code exists; they are controlled through a centralized provider flag map.

These are useful controls, but they do not by themselves prove every V10 requirement. Provider configuration, redirect URI registration, account-linking semantics, token validation, state/nonce responsibilities, and recovery behavior still require verification against the live Supabase/provider configuration.

## Material finding: MFA gap against chosen ASVS target

The most important result of this tranche is **not a vulnerability claim**, but a standards-target mismatch requiring an explicit decision: ASVS 5.0.0 Level 2 includes an MFA requirement (`v5.0.0-6.3.3`), and current repository evidence does not establish that Watchdog enforces MFA for every user.

Until this is resolved, Watchdog must not state that it meets ASVS Level 2. Under the current $0 constraint, the next step is to assess whether existing Supabase/provider capabilities can enforce an acceptable second factor without added cost and, if not, retain the gap transparently while continuing all other Level 2 controls.

## No-cost verification added

`property/tests/auth-asvs-contract.mjs` protects several currently observable design requirements:

- PKCE remains enabled;
- sessions remain auto-refreshed and persisted through the centralized runtime;
- OAuth redirects remain constrained to same-origin `/property/` destinations;
- legacy email magic-link signup UI remains removed;
- additional auth providers remain disabled by default until deliberately reviewed/enabled.

This static contract is evidence of configuration intent, not proof of provider-side settings or runtime security effectiveness.

## Next tranche

1. Complete the V10 OAuth/OIDC Level 2 applicability map.
2. Document production Supabase session lifetime and provider-side authentication controls.
3. Determine a no-cost MFA path or formally record the unresolved L2 gap.
4. Create the Watchdog role/plan/resource authorization matrix and dynamic negative tests.
5. Inventory sensitive account mutations requiring recent re-authentication.
