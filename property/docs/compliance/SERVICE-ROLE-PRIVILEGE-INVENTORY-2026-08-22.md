# Watchdog Service-Role Privilege Inventory — 2026-08-22

**Status:** Initial repository-derived inventory; not a claim of complete production coverage.  
**Budget:** $0  
**Frameworks:** SOC 2 Security, NIST CSF Protect, OWASP ASVS Access Control, ISO/IEC 27001.

## Purpose

The Supabase service role bypasses ordinary row-level security and is therefore a high-privilege machine identity. Any server path using `SUPABASE_SERVICE_ROLE_KEY` must be treated like privileged access: server-only, purpose-limited, independently authenticated/authorized where user-initiated, auditable, and revocable.

This inventory intentionally records file/function classes only. It does not contain credential values, user identities, private provider configuration, or production payloads.

## Repository-observed service-role usage seed

A repository search on 2026-08-22 identified service-role references across several server-side classes, including:

- backoffice operational functions and recovery/login paths;
- product analytics and platform-event reporting;
- data export and support workflows;
- verification-code workflows;
- source monitoring and ingestion;
- payment/webhook processing;
- marketing and analytics workflows;
- municipal/data endpoints;
- automation and integration workflows;
- server API helpers used by internal product surfaces.

Examples observed in repository paths include `supabase/functions/backoffice-recover/`, `supabase/functions/backoffice-dev-login/`, `supabase/functions/export-my-data/`, `supabase/functions/product-analytics/`, `supabase/functions/report-platform-event/`, `supabase/functions/request-verify-code/`, `supabase/functions/source-monitor-ingest/`, `supabase/functions/paddle-webhook/`, `supabase/functions/watchdog-automation/`, and server-side `api/` handlers.

The search result is a discovery seed, not proof that every reference is deployed or currently live.

## Required review classification

Each service-role-backed path should be classified into one of these authorization models:

1. **Provider-authenticated webhook** — caller authenticity is established by provider signature/secret verification before privileged mutation.
2. **Authenticated end-user action** — bearer session is validated and the operation is restricted to that user's authorized scope before service-role access is used.
3. **Developer/admin action** — authenticated caller receives an independent server-side developer/admin authorization decision before privileged operation.
4. **Internal scheduled/system job** — invocation channel is not public customer input and is protected by deployment/runtime secrets or platform controls.
5. **Public ingestion with constrained privilege** — endpoint may accept unauthenticated input only when payload, rate, destination, and privileged effects are tightly bounded and abuse-resistant.

Any path that cannot be assigned and evidenced should remain an open compliance finding.

## Mandatory controls

- Never place service-role credentials in `/property/` browser code, static HTML, client configuration, local storage, analytics, screenshots, or public logs.
- Never treat RLS as the authorization control after a service-role client is created; service role bypasses it.
- Authenticate and authorize before privileged user-impacting reads or writes.
- Validate and bound all caller-controlled identifiers and payloads.
- Prefer least-privilege RPCs or narrow database operations instead of broad administrative queries where practical.
- Do not return service-role-derived data beyond the caller's legitimate scope.
- Use no-store/private response caching for sensitive administrative responses.
- Record material privileged actions in an audit/event trail where appropriate.
- Re-review a path when its invocation model, data scope, connector, or authorization behavior changes.

## First review queue

Priority order for deeper no-cost review:

1. account/data export and deletion-related functions;
2. developer/backoffice/admin functions;
3. billing/payment/webhook functions;
4. connector credential and automation functions;
5. analytics/reporting functions that aggregate customer data;
6. public or semi-public ingestion endpoints;
7. remaining service-role references.

## Current residual risk

The repository contains numerous service-role references, and this initial inventory has not yet completed a function-by-function caller-authorization classification. The presence of the key name in server code is expected, but every use increases the importance of verifying that privileged database access cannot be reached through a weak caller boundary.

## Next no-cost actions

1. Complete the first function-by-function classification for the highest-risk queue above.
2. Add automated checks preventing service-role secret references from entering first-party browser JavaScript or static HTML.
3. Record exceptions and remediation in the risk/control registers.
4. Reconcile the inventory against `supabase/functions/PRODUCTION-INVENTORY.json` so repository-only and production-live paths are distinguished.
