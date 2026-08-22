# Watchdog Privileged Access Governance Baseline — 2026-08-22

**Budget:** $0  
**Scope:** Watchdog `/property/` application, Supabase-backed privileged application roles, internal developer-only surfaces, service-role backed server functions, and backoffice privileged sessions.  
**Frameworks:** SOC 2 Security, NIST CSF 2.0 Govern/Protect, OWASP ASVS 5.0 Access Control, ISO/IEC 27001 access-control readiness.

## Objective

Watchdog must be able to answer, with retained evidence: who or what has privileged access, why that access exists, how it is granted, how it is revoked, what boundaries prevent self-promotion, and when the access was last reviewed.

This document is a sanitized governance baseline. It intentionally does not list account identifiers, emails, credentials, tokens, provider secrets, or exploitable operational detail.

## Privileged access classes observed in repository evidence

### 1. Watchdog developer role

Repository evidence shows a server-evaluated developer check through `public.is_watchdog_developer()`. The function evaluates the authenticated user's profile role on the server and is executable by authenticated users only. Browser-side hiding is not treated as the authorization boundary.

Developer status is privileged because it can unlock internal product/data/compliance surfaces and bypass ordinary paid-plan checks where explicitly designed.

### 2. Server/service role

Supabase Edge/API functions use server-held service-role credentials for administrative database operations. Service-role credentials must never be exposed to browser code, logs, static files, client configuration, screenshots, or compliance evidence.

Service-role use is machine privilege, not user privilege. Every server function using it should independently authenticate/authorize the caller before performing user-impacting or internal actions.

### 3. Backoffice privileged session

The backoffice API maintains a separate privileged session model with bounded expiry, token hashing, revocation state, request-fingerprint evidence, failed-login tracking, and developer verification for initial setup. This access class needs periodic review because it can expose operational workflows beyond ordinary customer functionality.

### 4. Provider/operator administrative access

GitHub, Supabase, Vercel, Stripe and other Tier 1 provider consoles can create material production changes even when no application role changes. Repository evidence cannot prove the current provider-member list, so provider-console membership remains an external operational evidence item to be reviewed manually without committing identities publicly.

## Mandatory governance rules

1. **No self-promotion from browser clients.** Customer-accessible profile updates must not be able to change server-managed account-role or plan-entitlement fields.
2. **Server-side developer evaluation.** Developer-only actions must rely on a server/RPC authorization decision, not DOM visibility, local storage, client-provided plan values, or query parameters.
3. **Service-role isolation.** Service credentials remain server-only. Possession of a normal user token must not imply service-role capability.
4. **Least privilege.** Privilege is granted only for a documented operational need and removed when that need ends.
5. **Separate human and machine privilege.** Human developer/admin access and machine service credentials are reviewed separately because their grant/revocation mechanisms differ.
6. **Material privileged changes require evidence.** Grant, removal, role-model change, new administrator surface, new service-role function, or provider-console membership change should produce a dated review record.
7. **No public identity roster.** Access-review evidence stored in this public repository must use role/count/status summaries only. Named identities belong in a private operational record when such a store exists.
8. **Sensitive actions should eventually require stronger authentication.** MFA/AAL2 enforcement remains an open readiness gap and should be prioritized for developer/admin actions when a no-cost supported path is verified.

## Review cadence

Until an external audit scope is established:

- perform a formal privileged-access review at least quarterly;
- perform an out-of-cycle review after any material role model, admin surface, provider membership, credential, or incident change;
- retain a sanitized summary in the compliance program;
- retain private identity-level evidence only in an appropriate non-public system.

The twice-daily compliance process may perform narrower control checks, but those do not replace the periodic human/account inventory review.

## Current evidence and conclusions

### Positive controls observed

- `protect_profile_entitlement_fields()` blocks authenticated/anonymous profile updates from changing `account_role` or `plan_tier`.
- profile RLS restricts normal profile access to the owning authenticated user.
- `is_watchdog_developer()` is a server-side `security definer` role check limited to authenticated execution.
- `access-guard.js` uses the server-side developer RPC and separately resolves entitlement state before revealing gated surfaces.
- `api/compliance-log.js` and other internal APIs independently re-check developer status server-side rather than trusting the page guard.
- backoffice setup requires a signed-in Watchdog developer token and subsequent privileged access uses a distinct revocable bounded session.

### Gaps that remain open

- repository evidence does not establish the current named population of developer/admin/provider-console accounts;
- there is not yet retained quarterly joiner/mover/leaver review evidence;
- MFA/AAL2 is not yet proven as enforced for all privileged human access;
- provider-console roles and organization-level permissions must be reviewed directly in each provider;
- service-role usage should be continuously inventoried so new administrative functions cannot appear without authorization checks;
- current production emergency/break-glass access procedures are not yet formally documented.

## Access review evidence requirements

A periodic review should record, without placing secrets or unnecessary personal data in this repository:

- review date and reviewer role;
- systems reviewed;
- number of active privileged human accounts by system/role;
- number/class of active machine/service credentials;
- whether each privilege still has a business need;
- whether terminated/inactive/stale access was found;
- whether MFA/AAL2 is enforced where available;
- whether provider-console memberships match expected owners/operators;
- role or permission changes completed;
- residual exceptions and owner;
- next review date.

Use `property/docs/compliance/PRIVILEGED-ACCESS-REVIEW-TEMPLATE.md` for retained summaries.

## Next no-cost actions

1. Perform the first identity-level review directly against Supabase, GitHub, Vercel and other Tier 1 providers without committing personal identifiers publicly.
2. Inventory repository uses of `SUPABASE_SERVICE_ROLE_KEY` and verify caller authorization around every user-impacting path.
3. Establish a joiner/mover/leaver checklist for future team growth.
4. Document a break-glass/emergency privileged-access procedure.
5. Continue the no-cost MFA/AAL2 feasibility work for privileged human actions.
