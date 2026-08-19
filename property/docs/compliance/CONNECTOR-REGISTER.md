# Watchdog Material Connector Register

**Purpose:** Track third-party services and external data connections that can affect Watchdog security, privacy, availability, payment, AI, communications or compliance scope.

**Last updated:** 2026-08-19

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
| Customer CRM / generic webhook connections | Customer-controlled CRM and workflow interoperability | `property/integrations/`, `supabase/functions/integration-*`, `integration_*` tables | Live | Contact identity, relationship/stage/activity context and property associations may enter Watchdog; governed property-change events may leave Watchdog to customer-selected HTTPS endpoints. Tier 1 personal/customer data. | Per-connection scope and consent, hashed inbound token, Vault-backed HMAC, idempotency/replay handling, payload allowlisting, retention/deletion, endpoint ownership, audit, error minimization, rotation/revocation and Intelligence opt-in. |
| Zapier | Automation / integration marketplace | Phase 2 design in `property/docs/integrations-phase1.md` and NJW-52 | Planned | May relay Watchdog events and customer CRM/workflow context; exact categories depend on customer workflow. | Partner/app review, least-privilege triggers/actions, authentication, disclosures, consent, retention/subprocessors, logs, deletion/offboarding, webhook signing and privacy update. |

## Phase 1 CRM / webhook review record

- **Connector:** Customer CRM / generic webhook connections
- **Business owner:** Watchdog
- **Technical owner:** Watchdog
- **Status:** Live
- **Approval date:** 2026-08-19
- **Business purpose:** Provide a secure generic two-way data-exchange boundary so customers can connect CRM and workflow systems without Watchdog storing their CRM password.
- **Data received from provider:** Allowlisted contact identifier/details, relationship or lead stage, activity timestamp, tags and property associations/context.
- **Data transmitted to provider:** Customer-subscribed Watchdog events. Phase 1 production event is `property.signal.changed` with governed property-change context.
- **Data classification:** Personal, Internal and Public property intelligence. CRM/contact context is treated as Tier 1 personal/customer data.
- **Customer/account data involved:** Yes.
- **Authentication method:** Signed-in Watchdog JWT for connection management; random per-connection inbound token for external webhook senders; HMAC-SHA256 for outbound delivery verification; internal Vault-backed token for scheduled delivery worker execution.
- **Credentials/secrets location:** Inbound token is shown once and only its SHA-256 hash is stored. Outbound HMAC secrets and the internal worker token are stored in Supabase Vault.
- **Scopes/permissions and least-privilege justification:** `crm.context.ingest` is required for inbound CRM context. `intelligence.context.read` is optional and disabled by default. CRM write scopes are reserved for future phases and are not exercised by the Phase 1 generic bridge.
- **Webhook authentication/replay controls:** Per-connection token authentication inbound; stable event/idempotency keys; unique event constraints; signed outbound timestamp/body; receiving systems are expected to verify HMAC and de-duplicate the `Idempotency-Key`.
- **Encryption expectations:** Outbound destinations must use public HTTPS. Redirects are not followed. Local/private-looking destinations are rejected.
- **Provider retention/deletion behavior:** Varies by customer-selected destination. Customers remain responsible for the receiving provider's retention and processing settings.
- **Watchdog retention/deletion behavior:** Watchdog retains normalized CRM context, audit records and delivery history needed to operate the integration. Arbitrary raw CRM payload bodies are not stored as the normalized CRM context record. A formal retention schedule must be finalized before broad external connector expansion.
- **Subprocessors/onward transfers reviewed:** Customer chooses the destination in Phase 1. Zapier, Make and each named direct CRM connector require their own review before Watchdog represents them as supported named providers.
- **Privacy policy impact:** CRM/integration data-category language should be added before broad public launch of named integrations.
- **Data protection assessment required:** To determine before named CRM connector/public Zapier launch.
- **Security/assurance evidence reviewed:** Staging trigger queue test; Vault secret round-trip; staging scheduler-to-worker HTTP 200; production scheduler-to-worker HTTP 200; Supabase security advisor review.
- **Availability/failure behavior:** Delivery worker runs every minute; up to five attempts with increasing backoff; 8-second outbound timeout; delivery/response/error history retained; customers can pause or revoke a connection.
- **Incident/security contact path:** Watchdog security/operations process; integration audit and delivery history provide connection-level evidence.
- **Offboarding procedure:** Revoke connection, clear inbound token hash and outbound secret reference, delete Vault signing secret, cancel pending deliveries and stop future trigger fan-out.
- **Credential revocation test:** Rotation and revocation paths are implemented; revocation removes usable credentials and cancels pending deliveries.
- **Reviewer/approval:** Watchdog internal implementation review, 2026-08-19.
- **Residual risks / accepted exceptions:** Generic HTTPS destination ownership is not independently proven in Phase 1. Private/local destinations and redirects are blocked; endpoint-verification challenge/response can be added before broader embedded marketplace use.
- **Next review date or trigger:** Before public Zapier publication, before any named direct CRM integration, or on a material scope/retention/authentication change.

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
