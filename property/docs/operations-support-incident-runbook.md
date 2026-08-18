# Watchdog operations, support and incident runbook

## Purpose

This runbook defines the minimum operating process for Watchdog Property Intelligence once customers depend on the platform. It covers support intake, service health, incident triage, customer communication, continuity and the boundary between public status information and private diagnostics.

## Customer support surface

Customer entry points:

- `/property/support/` for signed-in account-linked support requests.
- `hello@njpropertytaxrelief.com` when a customer cannot sign in.
- `/property/faq/` for common property-data questions.
- `/property/data-methodology/` for source/method questions.
- `/property/refunds/` for cancellation/refund policy.
- `/property/status/` for privacy-safe operational status.

Target response posture at launch:

- Account access or work-blocking issue: acknowledge within two business days, sooner when practical.
- Routine product/data question: acknowledge within two business days.
- Security/privacy report: treat as high priority and restrict discussion to the minimum necessary people and records.
- Payment credentials must never be requested in a support request. Full card numbers, passwords, service-role keys and database passwords are prohibited in tickets.

## Support request handling

1. Confirm the request belongs to the signed-in user or verify the sender through the account email when sign-in is unavailable.
2. Classify: account, access, data, technical, billing, other.
3. Determine whether the issue is customer-specific or a possible platform incident.
4. Use sanitized request IDs, route names and release versions when troubleshooting. Do not paste raw customer/property payloads into public issue trackers.
5. If the issue is reproducible and platform-wide, open or update a private/internal incident record.
6. Record the resolution in the support request and close only after the customer-facing action is clear.

## Uptime monitoring

`.github/workflows/production-uptime-check.yml` executes from GitHub-hosted runners every 15 minutes after the workflow reaches the default branch. It checks:

- the public NJ Property Tax Relief root page;
- the Watchdog `/property/` entry point;
- successful HTTP response after redirects;
- an expected page-content marker, so a generic error page returning HTTP 200 does not count as healthy.

The monitor never signs in, reads customer data or tests billing. A failed run is a triage signal, not automatic proof of an outage.

## Public status boundary

`/property/status/` consumes `public-platform-status`, a read-only Edge Function that exposes only:

- overall state: operational, degraded, major outage or unknown;
- broad components: Watchdog web app, Account services, Property data, Background services;
- active incident count;
- broad recently-resolved component/time entries.

The public endpoint must not expose incident titles, internal routes, request IDs, release diagnostics, metadata, customer identifiers, property records or billing state.

If the status backend cannot complete its query, the public page reports **unknown**. It must never convert an unavailable status check into “all systems operational.”

## Incident severity

### Critical

Use when customers broadly cannot access Watchdog, authentication is broadly unavailable, customer data integrity may be at risk, or a severe security/privacy event is suspected.

Actions:

1. Stop risky recurring jobs or deployments if they could worsen the incident.
2. Preserve logs/evidence.
3. Identify the last known healthy release and data recovery point.
4. Publish a privacy-safe degraded/outage status when impact is confirmed.
5. Invoke continuity/restore procedures when required.
6. Do not reopen service until authentication, customer data boundaries and paid entitlement state are reconciled.

### Warning / degraded

Use when an important feature is failing or materially slow but the core service remains available. Isolate the component, stop only the affected automation when possible, and keep unaffected customer workflows available.

### Informational

Use for isolated/recoverable errors that do not materially affect customer workflows. Track recurrence and promote to an incident when frequency or impact becomes meaningful.

## Recovery and continuity

Use `property/docs/continuity-and-restore.md` for database restore procedure and evidence requirements.

Current verified baseline from the August 18, 2026 isolated restore rehearsal:

- RPO observed: 0 minutes.
- RTO observed: 3 minutes.
- Production restore remained isolated from the live project.
- Database/Auth/migration/Storage/billing-provider reconciliation completed.

The operating objective remains RPO <= 24 hours and RTO <= 4 hours until repeated drills justify tighter public commitments.

## Customer data portability

Authenticated customers can request a JSON export through the Account page. `export-my-data` returns only rows associated with the signed-in user from the explicit export allowlist, plus owned organization metadata. Optional Intelligence tables are skipped when they are not installed in the current release.

The export does not clone Watchdog's raw statewide public-source warehouse or payment credentials. Public-source records remain governed by their source terms.

## Billing-provider boundary

This operations runbook is provider-neutral. The configured Live payment processor is the monetary transaction source of record, but Watchdog authorization is controlled by the normalized server-side entitlement contract after verified signed provider events are processed.

Changing payment processors requires a new controlled Live lifecycle acceptance before paid enrollment is considered release-ready.

## Production promotion boundary

Merging code is not equivalent to launching customer-visible Intelligence. Production promotion requires:

1. all non-billing engineering/staging gates green;
2. real Live billing lifecycle evidence from the selected provider before paid enrollment;
3. explicit authorization for production migrations/functions;
4. ordered migration/function deployment;
5. authenticated plan/role smoke checks;
6. security/performance advisor delta review;
7. scheduler/worker activation only after fail-closed checks;
8. rollback/stop controls verified;
9. customer visibility enabled last.
