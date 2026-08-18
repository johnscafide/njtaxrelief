# Watchdog Material Connector Register

**Purpose:** Track third-party services and external data connections that can affect Watchdog security, privacy, availability, payment, AI, communications or compliance scope.

**Last updated:** 2026-08-18

A connector being listed here does not mean it is production-live. Status must be verified and updated as integrations move from planned to configured to live to retired.

## Status key

- **Observed**: referenced in current repository or privacy documentation; production status still needs explicit verification in this register.
- **Planned**: intended integration not yet approved for production.
- **Live**: production use has been explicitly verified and reviewed.
- **Retired**: credentials revoked, production use stopped and retention/offboarding handled.

## Current inventory seed

| Connector / service | Category | Evidence it exists | Status | Data-risk notes | Required review before/while live |
|---|---|---|---|---|---|
| Supabase | Authentication, database, Edge Functions | `property/js/access-guard.js`, `supabase/` | Observed | Account data, profile data, saved-property linkage and privileged service operations may be processed. | RLS/role review, privileged access, backups, retention, region/subprocessor posture, incident contacts, key rotation and production inventory. |
| Vercel | Hosting and deployment | `vercel.json` | Observed | Application delivery, deployment metadata and standard request/log data. | Account MFA/access, deployment permissions, log minimization, domains/TLS, security headers, incident/recovery procedures. |
| Google Sign-In | Identity provider | `property/docs/google-auth-branding.md`, privacy policy | Observed | Identity/profile data and authentication tokens/scopes. | OAuth scopes, redirect URIs, app verification, revocation, account-linking behavior and privacy disclosures. |
| Google Maps / address services / Street View | Mapping and address functionality | privacy policy and application references | Observed | Addresses/search context can be sent to Google services. | API restrictions, key restrictions, terms, retention expectations, privacy disclosure and unnecessary-data minimization. |
| Google Analytics | Analytics | privacy policy | Observed | Device/usage/attribution telemetry. | Consent/opt-out behavior, retention, data-sharing settings, IP/data minimization and policy reconciliation. |
| Microsoft Clarity | Product analytics / session behavior | privacy policy | Observed | Session interaction telemetry; form masking requirements are material. | Masking verification, consent/opt-out behavior, retention, sensitive-field exclusion and policy reconciliation. |
| EmailJS | Email/form delivery | privacy policy | Observed | Form/contact information may be transmitted for delivery. | Data categories, retention, credentials, sender abuse controls, DPA/subprocessors, incident path and migration/offboarding plan. |
| Esri / New Jersey public-data services | Public property/geospatial data | privacy policy, `property/docs/data-factory.md` | Observed | Primarily public property/geospatial data; availability and licensing/source integrity remain material. | Terms/licensing, provenance, availability/fallbacks, update cadence, integrity checks and confirmation that account data is not unnecessarily sent. |
| Stripe | Payments | `supabase/functions/stripe-webhook/index.ts`, security contracts | Observed | Payment events and billing identifiers; card data scope depends on checkout architecture. | PCI scope/SAQ determination, webhook signing/replay controls, least privilege, retention, refunds/disputes, account MFA/access and incident process. |
| Paddle | Subscription/payment integration | `supabase/functions/paddle-webhook/index.ts`, security contracts | Observed | Subscription/payment events and entitlement changes. | Confirm whether production-active; signature/replay controls, account access, data retention, tax/payment role, offboarding and overlap with Stripe. |

## Required review record for every new material connector

Copy this section for each approved connector or maintain the same fields in a future structured register.

- **Connector:**
- **Business owner:**
- **Technical owner:**
- **Status:** Planned / Live / Retired
- **Approval date:**
- **Business purpose:**
- **Data received from provider:**
- **Data transmitted to provider:**
- **Data classification:** Public / Internal / Personal / Sensitive / Payment / Authentication
- **Customer/account data involved:**
- **Authentication method:**
- **Credentials/secrets location:** Record the secret manager/location category only, never the secret itself.
- **Scopes/permissions and least-privilege justification:**
- **Webhook authentication/replay controls:**
- **Encryption expectations:**
- **Provider retention/deletion behavior:**
- **Watchdog retention/deletion behavior:**
- **Subprocessors/onward transfers reviewed:**
- **Privacy policy impact:**
- **Data protection assessment required:** Yes / No / To determine
- **Security/assurance evidence reviewed:**
- **Availability/failure behavior:**
- **Incident/security contact path:**
- **Offboarding procedure:**
- **Credential revocation test:**
- **Reviewer/approval:**
- **Residual risks / accepted exceptions:**
- **Next review date or trigger:**

## Risk-tier guidance

### Tier 1 — High materiality

Payments, authentication, sensitive financial/profile data, CRM/contact data, voice/SMS/email communications, AI providers receiving non-public information, privileged infrastructure or any provider capable of changing account entitlements or production data.

### Tier 2 — Moderate materiality

Analytics, marketing platforms, address services and non-sensitive user-context integrations where privacy, tracking or account metadata may be transmitted.

### Tier 3 — Lower materiality

Public-data feeds that do not receive account/user data. These still require provenance, licensing/terms, integrity, availability and change-management review.

Risk tier determines review depth, not whether a connector is reviewed at all.
