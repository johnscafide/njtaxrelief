# Watchdog Automation Proof Contract

Status: R&D milestone accepted, non-executing
Date: 2026-08-20
Tracks: NJW-236, Watchdog Automation Fabric

## Purpose

A consequential Watchdog automation should be reconstructable after the fact. It should be possible to answer: what property was involved, what changed, which evidence existed, which Intelligence model evaluated it, which policy version matched, what approval applied, what external work was proposed, and whether a retry represented the same governed event.

This document defines the first accepted contract for **Proof-Carrying Automation** and the identity layer that supports it, the **Watchdog Property Passport**.

Policy-driven external execution remains disabled. Phase 9 is shadow-only. This contract is therefore a provenance, verification and reconstruction layer. It is not authorization to create an external write path.

## Core rule

**No meaningful automation without a reconstructable proof chain.**

A proof envelope references governed records. It does not copy every source payload into downstream systems.

## Production proof envelope

Production `integration_automation_proofs` currently retains the complete Watchdog-side reconstruction envelope. The envelope contains these top-level sections:

- property
- event
- intelligence
- evidence
- relationship
- policy
- authorization
- delivery
- generated timestamp and schema/proof type

It does **not** denormalize CRM contact names, email addresses or phone numbers into the proof.

### Required invariants

1. The original integration event ID is immutable.
2. Retries and manual replay preserve the original event identity and idempotency identity.
3. A policy version is immutable once evaluated. A policy change creates a new version.
4. Shadow mode always records `execution_allowed=false`.
5. An approval decision does not independently grant execution. Phase 9 approvals remain `execution_allowed=false` at the database level.
6. Evidence references retain freshness and authority metadata. Missing evidence remains missing.
7. CRM relationship context does not become governed property truth merely because it appears in the proof chain.
8. External systems should normally retain an opaque Watchdog proof reference, not the complete internal evidence graph.

## External disclosure contract: `watchdog-proof-ref/v1`

External systems receive a minimal proof reference shaped for provenance rather than data replication.

The opaque identifier format is:

`wdp_<32 lowercase hex characters>`

The external-minimal representation may include:

- opaque proof reference
- SHA-256 digest of the stored Watchdog proof envelope
- governed PAMS PIN
- source event type and occurrence time
- Intelligence opportunity type, score, confidence, evidence coverage and model/version
- evidence count, governed-evidence ratio and newest observation time
- policy group/version/result/reason codes/approval requirement
- verified relationship status/method/time
- latest approval status
- `execution_allowed=false`

It intentionally excludes:

- CRM contact name
- email
- phone
- raw CRM payload
- complete evidence payloads
- internal relationship IDs
- complete policy decision JSON
- secrets, credentials or webhook signing material

A full Watchdog-side reconstruction is available only through the authenticated/entitled reconstruction path and remains user-owned.

## Proof integrity

A proof reference stores a SHA-256 digest of the complete Watchdog proof envelope. Reconstruction recomputes that digest from the stored proof.

The required verification result is:

`digest_valid=true`

A digest mismatch must never be treated as verified provenance.

## Production acceptance: proof-carrying automation

A real Phase 9 shadow decision was used for the first acceptance run.

Proof:
- proof ID: `9ab5a847-0228-4030-9cb5-4cd850112057`
- external proof reference: `wdp_af4a16cb40fe42ffa743a994f7b4c149`
- digest: `60977102e2d24c39b8e41c3cc5fe09642376334503ed2f828ed6895332b5c087`

The external-minimal representation successfully exposed only the approved disclosure fields while keeping `execution_allowed=false`.

Starting from only the opaque proof reference, Watchdog successfully reconstructed:

1. the original integration event and idempotency identity
2. governed PAMS property identity
3. Intelligence finding, run, model and version
4. governed evidence references and freshness/authority metadata
5. the verified CRM-to-property relationship state
6. policy group, immutable version and evaluation result
7. approval state
8. the original no-execution authorization state

The reconstructed stored envelope re-hashed to the same digest with `digest_valid=true`.

No external delivery was created during this acceptance. That is intentional: this milestone proves an export-safe provenance reference and Watchdog-side reconstruction without expanding automation authority.

## Watchdog Property Passport v0.1

The Property Passport is a durable property identity construct, not a consumer profile and not a PII warehouse.

The first implementation is computed from governed/current Watchdog records instead of creating another standalone personal-data store.

### Canonical identity rules

- canonical key: exact PAMS PIN
- exact PAMS PIN is required for policy-usable resolution
- CRM address cannot become canonical property truth
- fuzzy address resolution is disabled
- person-name matching is disabled
- unresolved identity fails closed
- ambiguous identity fails closed
- unit/qualifier conflicts fail closed
- historical aliases remain unavailable until supported by governed historical identity evidence

### Evidence classes currently considered

- governed property lookup records
- user-owned saved property records
- user-owned Intelligence findings
- verified CRM-to-property relationship records
- automation proof records
- verified ownership-verification records when present

The Passport may expose relationship state and verification method, but it does not infer ownership from a CRM relationship.

### Identity states

`resolved`
: One consistent identity exists across the available exact source classes. It may be used as property identity context for policy evaluation.

`ambiguous`
: Multiple normalized addresses or block/lot/qualifier identities exist for the same exact key. It fails closed and is not policy-usable.

`unresolved`
: No exact supporting Watchdog source class is present. It fails closed and is not policy-usable.

## Production acceptance: Property Passport

A real proof-linked property was evaluated:

- PAMS PIN `2122_57_13`
- passport ID `wdp_prop_b0e311d0a10516474e25d907`
- identity status `resolved`
- identity usable for policy: true
- exact source classes: 4
- distinct normalized addresses: 1
- distinct block/lot/qualifier identities: 1
- verified CRM relationships: 1
- verified ownership relationships: 0
- automation proofs: 1
- execution allowed: false

The canonical parcel resolved to one consistent situs address and block/lot identity. The CRM relationship remained a relationship record; no ownership conclusion was inferred.

A deliberately nonexistent exact PAMS PIN was also tested. It produced:

- identity status `unresolved`
- zero source classes
- zero relationships
- zero proofs
- `identity_usable_for_policy=false`
- `execution_allowed=false`

No naturally ambiguous user parcel was present in the current production corpus during this milestone, so ambiguity behavior is structurally enforced but has not yet been demonstrated with a genuine conflicting production parcel.

## Threat model

### Evidence substitution

Risk: a downstream CRM field is mistaken for authoritative property evidence.

Controls:
- external proof is a Watchdog-generated reference
- governed source classes remain explicit internally
- CRM relationship is contextual only
- CRM address cannot become canonical Passport truth

### Proof tampering

Risk: a downstream activity references provenance that no longer matches the stored Watchdog decision.

Controls:
- opaque proof reference
- stored SHA-256 digest
- reconstruction recomputes the digest
- mismatched digest is not valid provenance

### Reference enumeration

Risk: a user attempts to reconstruct another user's proof by guessing references.

Controls:
- opaque random reference
- proof-reference table is not directly readable by browser roles
- reconstruction requires authentication, entitlement and matching `user_id`

### Replay ambiguity

Risk: a manual retry looks like a second independent business event.

Control: preserve original event ID and idempotency identity; attempt/replay metadata is separate.

### Policy drift

Risk: the current policy differs from the one that made the historical decision.

Control: every proof pins policy group, policy ID and immutable version/evaluation.

### Identity collision

Risk: an address resolves to the wrong parcel or unit.

Controls:
- exact PAMS key is canonical
- fuzzy resolution cannot independently make a Passport policy-usable
- multiple address or block/lot/qualifier identities fail closed

### Excess PII propagation

Risk: the proof or Passport becomes another customer-data warehouse.

Controls:
- external proof contains no CRM contact identity fields
- Passport contains property identity and relationship-state metadata, not CRM contact records
- complete proof remains Watchdog-side
- downstream systems should store the opaque proof reference, not copy the proof graph

### Approval confusion

Risk: `approved` is interpreted as permission to execute.

Control: the Phase 9 approval schema forces `execution_allowed=false`; proof and Passport contracts do not create an execution adapter.

## Access and security position

The public-schema proof/passport RPCs are intentionally callable by authenticated users because they power user-facing Pro+/Teams functionality. Each function checks:

- `auth.uid()`
- Watchdog automation entitlement
- user ownership of the underlying proof/reference where applicable

The proof-reference table has RLS enabled and browser roles do not have direct table access.

Supabase's security advisor therefore reports the authenticated SECURITY DEFINER RPCs as warnings by design. This is not treated as an advisor-clean state. The project also retains unrelated pre-existing security warnings and leaked-password protection remains disabled.

## R&D milestone result

The first NJW-236 milestone is accepted because one real existing Watchdog shadow workflow can now:

1. generate an internal proof without exposing secrets or unnecessary person data
2. issue an external-minimal opaque provenance reference
3. reconstruct the exact source event, property, Intelligence, evidence, relationship, policy and approval context from that reference
4. verify proof integrity with a digest
5. resolve the governed property through the Property Passport
6. fail closed on an unresolved property identity
7. preserve `execution_allowed=false` throughout

This milestone does **not** approve public API availability or autonomous external writes. Those require separate security, product and autonomy gates.
