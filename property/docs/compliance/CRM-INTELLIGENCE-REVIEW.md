# CRM-Aware Watchdog Intelligence Review

**Status:** Production foundation live, signed-in UI acceptance pending  
**Review date:** 2026-08-19  
**Related issues:** NJW-227, NJW-228, NJW-52

## Purpose

Phase 5 allows Watchdog Intelligence to use customer-authorized CRM relationship and workflow context without treating CRM data as governed property truth.

## Authorization boundary

CRM context is eligible only when all of the following are true:

- The Watchdog user is signed in.
- The user has an eligible Pro+, Teams or developer entitlement.
- The integration connection is active.
- The connection contains the `intelligence.context.read` scope.
- The customer explicitly enabled `intelligence_access` for that connection.

Turning off the connection-level Intelligence permission removes the connection from the CRM Intelligence read set.

## Initial data-minimization contract

The Phase 5 CRM Analyst context may return approved relationship/workflow fields including:

- CRM contact display name
- lead stage
- relationship/deal context
- last activity timestamp when supplied
- tags
- explicit property reference/address when supplied
- source/system source
- assigned-agent references
- provider/source update timestamps

The initial Analyst context intentionally does not return:

- email
- phone
- arbitrary raw CRM payloads
- reusable provider credentials

## Property relationship policy

`integration_crm_property_links` is the only Phase 5 relationship graph used for property-scoped CRM Intelligence.

Accepted relationship methods are explicit provider property reference, manual verification, verified address workflow, or a separately reviewed external mapping.

Watchdog must not infer ownership, seller intent, personal distress or a property relationship merely because a CRM contact name resembles a property-owner name.

A production smoke test confirmed:

- an explicit PAMS-style property reference created a verified link with confidence 1.0;
- a name-only CRM record created no link;
- all smoke records and links were deleted after validation.

The first production BoldTrail dataset currently contains 1,456 unique normalized contacts and no explicit PAMS property references, so the correct current verified-link count is zero.

## Intelligence response boundary

Phase 5 CRM-specific Ask Watchdog requests use `intelligence-crm-analyst` and `intelligence-crm-context` rather than widening the existing governed property Analyst.

CRM-specific responses are deterministic in the initial release. CRM record content is not sent to the external prose-model provider. Ordinary governed property questions continue to use the existing Analyst path.

The CRM Analyst retains protected-characteristic targeting refusals and seller-intent/distress inference refusals.

## Audit evidence

Every successful CRM context read writes metadata-only evidence to `intelligence_crm_access_log`, including:

- user
- Analyst session reference
- authorized connection IDs
- access mode
- record count
- property-scope count
- fields returned
- hashed query fingerprint when a search is used
- timestamp

The access log does not store the CRM payload or raw prompt text.

The normal integration audit log also records `intelligence.crm_context.read` events.

## Security controls

- `integration_crm_property_links` has RLS enabled and no direct anon/authenticated read or write grants.
- `intelligence_crm_access_log` has RLS enabled and no direct anon/authenticated read or write grants.
- `integration_refresh_explicit_crm_links` has no public, anon or authenticated EXECUTE permission; service role only.
- `integration_set_provider_unique_context_total` has no public, anon or authenticated EXECUTE permission; service role only.
- `intelligence-crm-context` requires Supabase JWT verification and rechecks current entitlement and connection permission.
- `intelligence-crm-analyst` requires Supabase JWT verification and independently rechecks current entitlement.

Supabase Security Advisor reports the expected informational `RLS enabled, no policy` notices for the two deliberately server-only Phase 5 tables. Existing unrelated project-wide advisor warnings remain separate remediation work.

## BoldTrail acceptance completed alongside Phase 5

- Initial real account sync: 1,456 seen and 1,456 normalized, succeeded.
- First scheduled incremental sync: succeeded using the saved cursor.
- Incremental overlap processed one contact, not the full CRM.
- Stored state after the incremental run: 1,456 rows, 1,456 distinct external contacts, zero duplicates.
- Consecutive failures: zero.
- Provider returned to idle with no last error.
- `records_synced_total` now represents current unique normalized context rows rather than cumulative repeat upsert operations.

## Remaining acceptance

1. Send one real CRM-specific question through the signed-in Ask Watchdog UI and verify the `get_crm_context` tool call, CRM access-log row and usage telemetry.
2. Keep BoldTrail token replacement and destructive disconnect/revocation testing as a separate controlled Phase 4 lifecycle acceptance step. Do not disconnect a live customer CRM solely to manufacture test evidence.
