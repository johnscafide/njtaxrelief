# Watchdog Proof-Carrying Automation + Property Passport R&D

Status: prototype / research milestone

## Goal

Make significant Watchdog automation reconstructable without copying full internal evidence, CRM payloads, or free-form AI reasoning into downstream systems.

## Track A: proof-carrying automation

Watchdog retains the full internal automation proof in `integration_automation_proofs`. External systems receive a deliberately smaller reference object created by `integration_create_automation_proof_reference(...)`.

### External proof reference

Format: `wdp_<32 lowercase hex characters>`.

The `external_minimal` disclosure can contain only:

- proof reference + SHA-256 digest
- PAMS PIN
- event type + occurrence time
- Intelligence opportunity type, score, confidence, evidence coverage, model key/version
- evidence count, governed-available ratio, newest observation time
- policy group/version/result/reasons/approval requirement
- verified relationship status/method/time
- approval status
- `execution_allowed=false`

It does not include CRM contact names, email addresses, phone numbers, raw CRM payloads, evidence payload bodies, prompts, secrets, provider credentials, or unrestricted policy JSON.

`integration_reconstruct_automation_proof(...)` is an authenticated Watchdog-side reconstruction path. It checks user ownership/entitlement, recomputes the SHA-256 digest from the retained full envelope, returns `digest_valid`, and preserves `execution_allowed=false`.

### Production acceptance on 2026-08-20

A real Phase 9 matched shadow decision with a human-approved projected CRM write produced a `wdp_...` reference. Reconstructing that reference returned the original event, finding/run, governed evidence, verified CRM-property relationship, policy/evaluation, approval, and idempotency identity with `digest_valid=true`. The approval remained non-executable and the real integration-delivery table remained empty.

## Track B: Property Passport

Prototype RPC: `integration_get_property_passport(p_pams_pin text)`.

### Canonical identity rule

**PAMS PIN is the only canonical key in v0.1.**

Addresses, municipality/block/lot/qualifier, provider IDs, CRM property references, and relationship evidence are corroborating identity evidence. They cannot silently replace the PAMS identity.

A deterministic non-secret Watchdog passport ID is derived from the exact PAMS PIN:

`wdp_prop_<first 24 hex characters of SHA-256(PAMS PIN)>`

This is an identity reference, not an authorization token.

### Resolution states

- `resolved`: at least one exact-PAMS Watchdog source exists and observed property address / block-lot-qualifier evidence is non-conflicting.
- `ambiguous`: the same PAMS PIN is associated with more than one normalized property address or more than one block/lot/qualifier identity. Fail closed.
- `unresolved`: no exact-PAMS Watchdog source exists. Fail closed.

`identity_usable_for_policy` is true only for `resolved`. The Passport never sets `execution_allowed=true`.

### Explicit fail-closed rules

- exact PAMS PIN required
- no fuzzy address resolution
- no person-name matching
- CRM address can never become canonical property identity
- ambiguous identities fail closed
- unresolved identities fail closed
- unit/qualifier conflicts fail closed
- a verified CRM relationship supports relationship context, not ownership proof
- a Passport never authorizes an external action by itself

### Address and alias handling

Current and observed addresses may be collected from exact-PAMS Watchdog records for consistency checking. CRM candidate addresses are deliberately excluded from canonical-address selection.

Historical aliases are **not yet governed** in v0.1. The prototype returns an empty historical-alias set with `historical_aliases_status=not_governed_yet` instead of pretending current observations form an authoritative address history.

### Provider IDs

Only verified provider references may be surfaced. Provider references do not override PAMS identity. Missing provider IDs are represented as missing evidence, not inferred.

### CRM relationships

The Passport may return counts and verification methods/times for verified CRM-to-property links. It does not return contact names, email addresses, phone numbers, or raw CRM payloads.

## Threat model

### Threat: downstream CRM sees unnecessary PII
Mitigation: downstream systems receive `external_minimal`; full reconstruction remains authenticated inside Watchdog.

### Threat: forged proof reference
Mitigation: opaque reference is only a lookup key; reconstruction recomputes the retained envelope digest and reports `digest_valid`.

### Threat: proof reference used as authorization
Mitigation: reference and Passport are explicitly non-secret; every response retains `execution_allowed=false`. Separate policy, approval and future execution gates remain mandatory.

### Threat: stale or conflicting property address silently rewrites identity
Mitigation: PAMS remains canonical. Conflicting exact-PAMS address or parcel evidence produces `ambiguous` and fails closed.

### Threat: CRM contact name/address creates false property ownership
Mitigation: no person-name matching; CRM addresses cannot become canonical; verified relationship evidence is kept distinct from ownership verification.

### Threat: unit/condo collision
Mitigation: qualifier/unit disagreement is treated as identity ambiguity. A future unit identity extension must use governed parcel/qualifier evidence before it can resolve.

### Threat: provider ID collision
Mitigation: provider IDs are secondary aliases scoped to their provider and cannot supersede PAMS.

### Threat: cross-user proof enumeration
Mitigation: reference reconstruction and Passport RPCs require authentication, Pro+/Teams/developer entitlement, and user-owned proof/relationship records. Browser roles have no direct table access to proof-reference storage.

## Current limitations / next research

1. Add a governed historical-address/alias provider before historical aliases become authoritative.
2. Formalize condo/unit identity beyond existing parcel qualifier evidence.
3. Add provider-scoped alias records only after source-specific uniqueness contracts are verified.
4. Do not expose a public Property Passport API until the security/compliance review and disclosure scopes are finalized.
5. Do not use Passport identity as proof of ownership, seller intent, occupancy, distress, or transaction authority.
