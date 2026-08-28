# Watchdog Supabase project boundary

Last verified: 2026-08-28

This document is the operator source of truth for the Supabase project that backs the Watchdog `/property` product. It exists to prevent accidental work against a similarly named or historical Supabase project.

## Production project

- Project ref: `uvkvaxljhhngydvlrzom`
- Region: `us-east-1`
- Current status at last verification: `ACTIVE_HEALTHY`
- Production API origin: `https://uvkvaxljhhngydvlrzom.supabase.co`

Treat this project as the production ledger for Watchdog unless a later repository change explicitly replaces this document and the production client configuration together.

## Operator rules

1. Before any production database, Auth, Storage, Cron, or Edge Function change, verify the connected project ref is exactly `uvkvaxljhhngydvlrzom`.
2. Never infer the production target from a project display name. Supabase display names are not a safe deployment boundary.
3. Inspect current production state before changing schema or functions. Repository code can lag a deployed Edge Function, so do not redeploy from git merely because a local copy exists.
4. For every database change, preserve RLS and entitlement boundaries. Public-schema tables must not become broadly readable or writable as a side effect of an operational fix.
5. Never expose a service-role key or secret in browser code, documentation, logs, screenshots, or Linear evidence.
6. Use the publishable client key only where browser access is intentionally governed by RLS. Server-only operations stay server-owned.
7. Do not use another Supabase project as a substitute production target to make a test pass. Staging or development evidence must remain labeled staging or development.
8. After a production mutation, verify the exact schema/function behavior and record concrete evidence in the mapped Linear issue.

## Security telemetry boundary

Watchdog private request-security telemetry currently lives in the `watchdog_security` schema. The active tables are:

- `watchdog_security.public_request_security_events`
- `watchdog_security.public_request_rate_limits`

These are private operational signals. Report aggregate event types and bounded request counts only. Do not expose or request raw IP addresses. Anti-extraction controls around public-record-derived data provide friction and detection, not secrecy.

## Quick preflight

Before production work, confirm all of the following:

- connected project ref is `uvkvaxljhhngydvlrzom`;
- project status is healthy;
- current GitHub `main` has been inspected;
- deployed Edge Function versions are checked when the task touches Edge Functions;
- relevant RLS/ACL state is understood before any write;
- the mapped Linear issue is reused rather than duplicated.

If any of those checks fail, stop the production mutation and choose another executable backlog item rather than guessing the environment contract.
