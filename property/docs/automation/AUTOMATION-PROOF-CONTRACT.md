# Watchdog Automation Proof Contract

Status: R&D contract, non-executing
Date: 2026-08-19
Tracks: NJW-236, Watchdog Automation Fabric

## Purpose

A consequential Watchdog automation should be reconstructable after the fact. It should be possible to answer: what property was involved, what changed, which evidence existed, which Intelligence model evaluated it, which policy version matched, what approval applied, what external work was proposed or executed, and whether a retry represented the same governed event.

This document defines the first contract for **Proof-Carrying Automation** and the identity layer that supports it, the **Watchdog Property Passport**.

The current production platform does not yet execute policy-driven external actions. Phase 9 is shadow-only. This contract therefore begins as a projection/audit format and must not be interpreted as authorization to create an external write path.

## Core rule

**No meaningful automation without a reconstructable proof chain.**

A proof envelope references governed records. It does not copy every source payload into every downstream system.

## Proof envelope v0.1

```json
{
  "schema_version": "watchdog.automation.proof.v0.1",
  "proof_id": "uuid",
  "created_at": "timestamp",
  "property": {
    "passport_id": "uuid-or-null",
    "pams_pin": "governed-property-id",
    "municipality_code": "string-or-null",
    "block": "string-or-null",
    "lot": "string-or-null",
    "qualifier": "string-or-null"
  },
  "event": {
    "event_id": "integration_events.id",
    "event_type": "intelligence.finding.created",
    "event_key": "stable-source-key",
    "occurred_at": "timestamp",
    "source": "watchdog"
  },
  "intelligence": {
    "job_id": "uuid-or-null",
    "run_id": "uuid-or-null",
    "finding_id": "uuid-or-null",
    "model_key": "string-or-null",
    "model_version_id": "uuid-or-null",
    "prompt_version": "string-or-null",
    "score": 0,
    "confidence": 0,
    "reason_codes": []
  },
  "evidence": {
    "evidence_ids": [],
    "source_ids": [],
    "freshness_as_of": "timestamp-or-null",
    "authority_summary": []
  },
  "policy": {
    "policy_id": "integration_automation_policies.id",
    "policy_group_id": "uuid",
    "version": 1,
    "mode": "shadow",
    "evaluation_id": "integration_policy_evaluations.id",
    "result": "matched",
    "reasons": [],
    "autonomy_tier": 0,
    "required_approval": "human"
  },
  "action": {
    "shadow_action_id": "integration_shadow_actions.id-or-null",
    "action_type": "create_crm_task",
    "target_system": "crm_via_zapier",
    "external_write": true,
    "execution_allowed": false,
    "blocked_reason": "shadow_mode_no_execution"
  },
  "approval": {
    "approval_id": null,
    "actor_type": null,
    "actor_id": null,
    "approved_at": null
  },
  "delivery": {
    "delivery_id": "integration_deliveries.id-or-null",
    "idempotency_key": "original-integration-event-id",
    "attempt_no": null,
    "manual_replay_count": null
  },
  "outcome": {
    "outcome_event_ids": [],
    "observed_at": null,
    "result": null
  }
}
```

## Required invariants

1. `event.event_id` is immutable.
2. Retries and manual replay preserve the original event identity. They do not mint a replacement event just to resend the same work.
3. `policy.version` is immutable once evaluated. A policy change creates a new version.
4. Shadow mode always records `execution_allowed=false`.
5. Evidence references are identifiers with freshness/authority metadata. Missing evidence must remain missing.
6. CRM relationship context never becomes governed property truth merely because it appears in the proof chain.
7. An approval record, when introduced, must identify the exact policy version and action payload approved.
8. A downstream system may retain the proof ID and event ID instead of receiving the entire evidence graph.

## Watchdog Property Passport v0.1

The Property Passport is a durable identity record for the property, not a consumer profile and not a PII warehouse.

### Identity fields

- Watchdog passport ID
- governed PAMS PIN
- municipality / district identifier
- block
- lot
- qualifier
- unit identity when the authoritative source distinguishes units
- current normalized situs address
- governed historical situs-address aliases
- governed parcel/provider identifiers with source and effective dates
- identity-resolution confidence and reason codes
- merge/split/supersession references where supported by authoritative evidence

### Relationship references

The passport may reference, but should not duplicate, verified relationship records such as:

- CRM context record ID
- CRM-to-property link ID
- provider connection ID
- relationship resolution status
- verification evidence ID

It should not promote a person's name, phone number, email address or inferred identity into the parcel truth record.

## Passport resolution order

1. Exact governed parcel identifier
2. Exact municipality + block + lot + qualifier
3. Governed provider parcel identifier already linked to Watchdog identity
4. Normalized address candidate with authoritative corroboration
5. Ambiguous candidate set requiring review

Fail closed when multiple plausible properties remain.

## Proposed storage boundary

Future implementation should separate:

- `property_passports`: durable parcel identity
- `property_passport_aliases`: historical/current governed identifiers
- `automation_proof_envelopes`: compact immutable proof metadata
- existing evidence/finding/model/policy/delivery tables: authoritative referenced records

Do not duplicate complete evidence payloads into the proof table unless retention and sensitivity rules explicitly require it.

## Threat model

### Evidence substitution

Risk: a downstream CRM field is mistaken for authoritative property evidence.

Control: source class and evidence IDs remain explicit; CRM context is marked contextual.

### Replay ambiguity

Risk: a manual retry looks like a second independent business event.

Control: preserve original event ID and idempotency key; increment attempt/replay metadata.

### Policy drift

Risk: months later, the current policy differs from the policy that made the decision.

Control: every proof envelope pins policy ID + immutable version.

### Identity collision

Risk: a normalized address resolves to the wrong parcel/unit.

Control: Passport resolution fails closed on unresolved ambiguity and stores reason codes.

### Excess PII propagation

Risk: automation proof becomes another customer-data warehouse.

Control: reference relationship records; do not denormalize unnecessary person fields into the proof envelope.

## First prototype acceptance

NJW-236 should not be marked complete until one real Watchdog shadow-policy evaluation can be reconstructed from:

1. property identity
2. original integration event
3. Intelligence/finding references when applicable
4. policy version + evaluation
5. projected action
6. replay/idempotency identity when delivery applies

The reconstruction must work without trusting a downstream CRM description as the source of truth.
