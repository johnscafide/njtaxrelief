# Watchdog Intent-to-Automation Contract

Status: R&D milestone accepted, suggestion-only
Date: 2026-08-20
Track: NJW-237

## Purpose

Watchdog can translate a professional's plain-English business objective into a structured automation proposal while keeping authority separate from language.

The compiler does not activate a workflow. It proposes triggers, policy constraints, Watchdog steps, downstream capabilities, data scopes, risk class, autonomy tier and a shadow-test plan.

## Compiler principle

**Natural language can describe intent. Structured, versioned policy controls authority.**

A prompt is input to a proposal. It is never permission to act.

## Production compiler

Canonical public RPC:

`integration_compile_automation_intent(objective text, untrusted_external_context jsonb)`

Current versions:

- base deterministic compiler: `intent-compiler-v0.1`
- composed appeal-review + client-draft wrapper: `intent-compiler-v0.2`
- autonomy contract: `autonomy-v1`

The v0.2 wrapper handles the more complex appeal-review/client-draft example and delegates all other supported intents to v0.1.

The compiler is deliberately suggestion-only:

- `suggestion_only=true`
- `activation_allowed=false`
- `tier4_prompt_grant_allowed=false`
- there is no execution adapter in the compiler

## Storage and privacy boundary

The compiler ledger is `integration_intent_compilations`.

It stores:

- user ID
- compiler version
- autonomy contract version
- SHA-256 hash of the objective
- optional SHA-256 hash of external context
- structured intent key/status/risk/tier proposal
- structured plan
- questions
- constraints
- timestamp

It does **not** have columns for the raw objective or raw external context.

This is intentional. The caller receives the proposal in the response, while the audit ledger retains the structured result and hashes needed to correlate/reconstruct compiler behavior without becoming another CRM-notes warehouse.

## Supported proposal families

### Assessment / appeal review

Primary trigger: `property.signal.changed`

Typical proposal:

- require verified property relationship
- require governed evidence
- evidence coverage/materiality review
- load property snapshot
- run Intelligence
- summarize governed evidence
- propose a reversible CRM review task

Requested autonomy tier: 2.

### Closing follow-up

Primary trigger: `intelligence.finding.created`

Typical proposal:

- governed Closing Review exception
- verified property relationship
- load proof
- internal review
- reversible CRM follow-up task

Requested autonomy tier: 2.

### Permit lifecycle follow-up

Primary trigger: `property.signal.changed`

Typical proposal:

- governed permit semantics required
- no legal conclusion from a missing/count-gap signal
- verify permit lifecycle evidence
- internal notification
- reversible research task

Requested autonomy tier: 2.

### Watchlist notification

Primary trigger: `watchlist.alert`

Typical proposal:

- materiality review
- internal Watchdog notification only

Requested autonomy tier: 1.

### Report distribution

Primary trigger: `report.ready`

Typical proposal:

- verified relationship required
- verify report access
- propose reversible CRM record update/reference

Requested autonomy tier: 2.

### Human-approved client communication

Primary trigger: `intelligence.finding.created`

Typical proposal:

- governed finding evidence
- verified relationship
- prepare evidence summary and draft
- external send is Tier 3 and requires human approval tied to proof

Requested autonomy tier: 3.

### Composed appeal review + client draft

The v0.2 compiler can represent the product example as one suggestion without accidentally making the communication send-capable:

- assessment material-change trigger
- governed evidence and verified relationship
- property snapshot + Intelligence + evidence summary
- CRM review task as proposed Tier 2 work
- client email **draft** as proposed Tier 2 work
- the actual send is explicitly excluded from the plan and described as a future Tier 3 human-approved action with proof required

## Unsupported and ambiguous intent

Unsupported language does not cause the compiler to invent a connector or action.

The response becomes `needs_clarification` or `unsupported`, with questions/constraints describing what is missing.

Examples of required clarification include:

- which supported Watchdog event is the primary trigger
- which system receives the proposed result
- what property/relationship scope applies
- whether a communication is draft-only or a separately approved send

High-impact destructive/financial/bulk-message/subscription-changing requests are blocked by the research compiler rather than mapped to a generic action.

## Autonomy contract v1

### Tier 0: Observe only

Allowed class: observe.

No external execution.

### Tier 1: Internal notification

Allowed classes:

- observe
- internal notification

No external writes.

### Tier 2: Reversible workflow writes

Possible class: reversible external write.

Activation is currently unsupported. Escalation requires successful shadow history, idempotency, provider/connection kill switches, a reversible-action contract and explicit activation outside the compiler.

### Tier 3: Human-approved external actions

Possible class: human-approved external action.

Activation is currently unsupported. Requires Tier 2 controls plus per-action human approval, proof reference, expiry/audit trail and a separately enabled execution adapter.

### Tier 4: Bounded autonomous actions

Activation is currently unsupported.

Requirements explicitly include:

- cannot be granted by prompt
- demonstrated reliability with positive and negative outcomes
- bounded domain/action budget
- rollback or compensating action
- idempotency
- provider/global kill switches
- security/compliance approval
- explicit developer/admin promotion
- continuous monitoring and automatic demotion

**No user prompt, CRM note, model output or compiler result can grant Tier 4.**

## Prompt-injection boundary

External CRM text, notes, emails, property remarks and webhook payloads are untrusted data.

The compiler accepts external context only as an explicitly labeled untrusted JSON object. It reports:

- `trusted=false`
- `used_for_authority=false`
- `stored_raw=false`

External context cannot alter:

- autonomy tier authority
- required approval
- scopes
- policy status
- provider/connection kill switches
- source authority
- retention rules

A production test supplied external context containing instructions to ignore approvals, grant Tier 4, disable kill switches and send immediately. The resulting Watchlist plan stayed Tier 1, suggestion-only and activation-disabled; the external context remained untrusted and unused for authority.

## Privilege-escalation boundary

The user's objective itself is also incapable of granting authority.

A production test requested a client message **without approval** and explicitly requested **Tier 4**. The compiler:

- classified the underlying action as a Tier 3 client-communication proposal
- kept `activation_allowed=false`
- kept `tier4_prompt_grant_allowed=false`
- added a constraint saying the Tier 4/approval-bypass request was ignored

## Shadow handoff

Every supported plan includes a shadow handoff before any future activation review.

Current recommendation:

- policy status: shadow
- 30-day review window
- no external execution
- measure events considered, matched, skipped, projected actions and later outcomes when available

The compiler writes no automation policy and creates no delivery.

## Production acceptance suite

On 2026-08-20, production compiled these representative professional intents:

| Intent | Result | Tier proposed | Trigger | Activation |
| --- | --- | ---: | --- | --- |
| Assessment / appeal review | `appeal_review` | 2 | `property.signal.changed` | false |
| Closing exception follow-up | `closing_followup` | 2 | `intelligence.finding.created` | false |
| Permit lifecycle follow-up | `permit_followup` | 2 | `property.signal.changed` | false |
| Watchlist material change | `watchlist_notification` | 1 | `watchlist.alert` | false |
| Report ready / CRM reference | `report_distribution` | 2 | `report.ready` | false |
| Approved client communication | `client_communication` | 3 | `intelligence.finding.created` | false |

All supported results were:

- suggestion-only
- activation-disabled
- Tier 4 prompt grant disabled
- accompanied by constraints
- handed off to shadow design

An intentionally vague objective returned `needs_clarification` with three questions rather than an invented integration.

### Determinism check

The exact same Watchlist objective was compiled twice in immediate succession. After removing the unique `compilation_id`, the two structured responses were JSON-equal.

This demonstrates deterministic behavior for the tested input against the same production event corpus and compiler version.

## Threat model

### External-context prompt injection

Risk: a CRM note or webhook payload contains authority-changing instructions.

Control: external context is untrusted, hashed for audit correlation, never stored raw, and never used for authority.

### User-prompt privilege escalation

Risk: user wording requests Tier 4, approval bypass or weakened guardrails.

Control: the compiler detects privilege-escalation language, ignores it for authority and adds an explicit constraint.

### Unsupported integration hallucination

Risk: the compiler invents a provider, event or action.

Control: unsupported/ambiguous objectives stop at questions/constraints.

### Compiler-to-execution confused deputy

Risk: a valid proposal is mistaken for authorization.

Controls:

- suggestion-only response
- activation false
- no execution adapter
- Tier 2–4 production autonomy contracts have activation disabled
- separate shadow/policy and future activation gates

### Raw-context retention

Risk: compiler audit becomes another store of CRM notes or sensitive free text.

Control: compilation ledger stores hashes and structured plan, not raw objective/context columns.

### Tier drift

Risk: the meaning of a tier changes after historical plans were compiled.

Control: each compilation pins `autonomy_contract_version`.

## R&D milestone result

NJW-237's first research milestone is accepted because production now demonstrates:

1. at least five representative professional intents compile to structured proposals
2. plans declare capabilities/data scopes, risk class, proposed autonomy tier and shadow handoff
3. unsupported intent produces clarification rather than invention
4. external prompt injection cannot alter authority
5. user privilege-escalation wording cannot grant Tier 4 or bypass approval
6. same tested input/compiler/corpus produces the same structured proposal
7. autonomy escalation requirements are versioned and auditable
8. the compiler stores structured/hashes rather than raw external context

This milestone does **not** create a live activation path. Tier 2–4 execution remains separately gated and disabled.
