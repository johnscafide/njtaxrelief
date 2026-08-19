# Verified CRM-to-Property Resolution Review

**Status:** Production foundation live, first real review candidate pending  
**Review date:** 2026-08-19  
**Related issues:** NJW-229, NJW-228, NJW-227, NJW-52

## Purpose

Phase 6 turns normalized customer CRM relationship context into defensible Watchdog property relationships without using contact-name similarity as proof of ownership or property association.

The relationship graph is designed to improve CRM-aware Watchdog Intelligence while preserving a strict distinction between customer-controlled CRM context and governed Watchdog property facts.

## Evidence policy

Relationship evidence is evaluated in the following order:

1. **Explicit provider/PAMS property reference.** An explicit Watchdog/PAMS-style property identifier can establish a verified relationship because the property reference itself is supplied as structured relationship evidence.
2. **Exact verified-address candidate.** An allowlisted CRM address that exactly matches a governed New Jersey parcel street address and ZIP may create a review candidate. It is not automatically verified.
3. **User verification.** A signed-in eligible user may explicitly verify or reject a candidate. A manually entered PAMS relationship is validated against the governed parcel service before it can be saved as verified.
4. **Future separately reviewed mappings.** Any additional mapping method must have its own evidence and security review before it can create verified relationships.

Watchdog does not use fuzzy contact/owner name similarity to create a CRM-to-property relationship.

## Ownership and seller-intent boundary

A verified CRM-to-property relationship means that the CRM record is confirmed to relate to the governed property for Watchdog workflow purposes. It does **not** by itself mean:

- the CRM contact is the legal owner;
- the CRM contact is a seller;
- the CRM contact intends to transact;
- the CRM contact is distressed or motivated;
- Watchdog has replaced or modified the governed property ownership record.

Ownership and property facts remain governed separately by Watchdog source lineage.

## BoldTrail evidence enrichment

The Phase 4 bulk contact-list endpoint does not provide enough property-address evidence for reliable relationship resolution. Phase 6 therefore uses the individual BoldTrail/kvCORE contact-detail endpoint server-side with the existing Vault-held provider credential.

Only the following address evidence classes are considered by the current resolver:

- BoldTrail primary address (`primary_address`, city, state and ZIP)
- BoldTrail property-of-interest address (`poi_address`, city, state and ZIP)

A primary address is labeled as CRM contact-address evidence. A property-of-interest address is labeled as CRM property-interest evidence. Neither class is treated as ownership proof.

The reusable provider credential never enters browser-visible resolver state.

## Data minimization

The resolver does not retain the raw provider contact-detail response.

Address enrichment is written through the service-only `integration_set_crm_resolution_address` database helper. That helper can write only:

- normalized CRM property-address text used for resolution;
- `address_source`;
- `address_city`;
- `address_state`;
- `address_zip`.

The resolver does not use this path to add email, phone, notes, arbitrary CRM payload fields or reusable credentials.

## Parcel-match contract

Current automatic candidate generation requires:

- New Jersey address evidence;
- a five-digit ZIP;
- exact normalized street-address equality;
- exact ZIP equality;
- a governed NJ parcel/PAMS result.

Common street suffixes and cardinal directions are normalized before comparison. Unit identifiers remain part of the normalized address. The provider query is narrowed by ZIP and street-number prefix, then Watchdog performs the exact normalized comparison itself.

One unique matching parcel creates a candidate with a high evidence score. Multiple matching parcels remain ambiguous and require explicit user selection. No candidate is promoted to verified automatically from address evidence alone.

## Resolution state and background processing

`integration_crm_resolution_state` is the server-only work-state table for the resolver. Supported states are:

- pending
- enriched
- no_address
- non_nj
- no_match
- candidate
- ambiguous
- error

The worker processes small batches to avoid hammering the CRM provider. Production scheduling runs every five minutes with a default batch of 20 contacts. Provider/network failures use delayed retry state rather than being treated as a match or permanent negative conclusion.

CRM records whose provider `source_updated_at` changes are returned to pending resolution so new relationship evidence can be reconsidered.

## User review workflow

The Integration Center contains a Phase 6 CRM-to-property resolution module for Teams/developer users. It shows:

- records assessed;
- candidates requiring review;
- verified relationships;
- unresolved records;
- evidence source for each candidate;
- CRM address evidence and governed parcel address side by side;
- PAMS identifier and municipality;
- evidence confidence;
- explicit indication that no name match was used;
- Verify Relationship and Reject actions.

Verification requires an explicit user action and produces an audit record. The UI states that verification confirms a Watchdog workflow relationship and does not declare legal ownership.

Verified relationships are immediately available to the completed Phase 5 CRM-aware Intelligence path when the customer has separately enabled CRM Intelligence permission.

## Security controls

- `integration_crm_resolution_state` has RLS enabled.
- `anon` and `authenticated` have no direct table privileges on the resolution-state table.
- `integration_seed_crm_resolution` has no anon/authenticated EXECUTE permission.
- `integration_mark_crm_resolution_pending` has no anon/authenticated EXECUTE permission.
- `dispatch_due_crm_resolution` has no anon/authenticated EXECUTE permission.
- `integration_set_crm_resolution_address` has no anon/authenticated EXECUTE permission.
- `integration-crm-resolver` requires a valid Watchdog JWT and rechecks effective plan server-side; current native resolution is Teams/developer only.
- `integration-crm-resolution-worker` is not browser-authenticated and instead requires a dedicated Vault-backed internal token.
- A production request with an invalid worker token returned HTTP 401 Unauthorized.
- The provider token remains in Supabase Vault and is fetched server-side only.

Supabase Security Advisor reports the expected `RLS enabled, no policy` informational notice for `integration_crm_resolution_state`, which is intentional for this server-only table. The Phase 6 privileged helper functions were not introduced as browser-executable functions. Existing unrelated project-wide Security Advisor warnings remain separate remediation work.

## Initial real-account production evidence

The first controlled production batch processed 20 live BoldTrail CRM contacts conservatively:

- 15 had no usable primary address;
- 3 had non-New-Jersey primary addresses;
- 1 had an NJ address but no exact governed parcel match;
- 1 provider detail request timed out and entered retry state;
- 0 candidates were created;
- 0 relationships were invented.

Subsequent controlled batches continued to fail closed when address evidence was absent. The resolver was then expanded to consider the separately labeled BoldTrail property-of-interest address and previously unresolved records were re-queued once for reassessment. No verified/rejected relationships were altered by that re-queue.

As of this review, there are still zero real address candidates, zero verified Phase 6 relationships and zero rejected candidates. Background scanning continues in small batches.

## Remaining acceptance

Phase 6 should remain In Progress until a real provider record produces a review candidate and the following end-to-end acceptance is completed:

1. Confirm the candidate in the signed-in Integration Center.
2. Verify or reject it explicitly.
3. Confirm the corresponding `integration_crm_property_links` state and integration audit event.
4. For a verified relationship, ask the Phase 5 CRM-aware Analyst about that property and confirm the relationship is returned through `get_crm_context`.
5. Confirm no external prose provider is required for the CRM relationship evidence in the current privacy boundary.

Do not fabricate a production relationship merely to close the acceptance test.