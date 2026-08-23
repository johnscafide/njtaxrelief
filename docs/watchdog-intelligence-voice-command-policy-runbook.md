# Watchdog Intelligence Voice vNext — Command Policy Runbook

**Status:** Production contract  
**Date:** 2026-08-23  
**Linear:** NJW-265  
**Policy version:** `watchdog-command-policy-vnext-1`  
**Contextual Analyst contract:** `contextual-analyst-v4-command-gates`

## Purpose

Voice and typed Ask Watchdog requests share one command-safety contract. Voice is not an authorization mechanism and does not create a second execution stack.

The command policy exists to keep harmless read-only requests fast while preserving explicit human control for internal changes and the existing Watchdog approval system for consequential actions.

## Enforcement architecture

```text
voice or typed user request
  ↓
visible transcript / Ask Watchdog composer
  ↓
POST /api/watchdog-intelligence-analyst
  ↓
server command classification
  ├─ prohibited → block before Analyst
  ├─ reversible, not confirmed → 409 confirmation required
  ├─ approval-required, not prepared → 409 approval workflow required
  ├─ approval-required + Prepare for review → rewrite as non-executing proposal
  └─ neutral/read-only/confirmed reversible → existing governed Analyst
        ↓
existing JWT + plan/add-on + Analyst tool + RLS/user-scoping controls
```

The same-origin Analyst transport is the command-policy enforcement choke point. Browser UI classification is never authoritative.

## Command classes

### Read-only

Examples:

- Open/show/view evidence or source lineage.
- Read or explain a current brief/report/score.
- What changed?
- Why was this flagged?

Policy:

- No confirmation is required for harmless read-only analysis/navigation.
- Requests that require Analyst reasoning still use the existing governed Analyst.
- A future local UI navigation action may execute immediately only when the target is explicit and harmless.

### Reversible internal changes

Examples:

- Add/remove a property from a Watchlist.
- Save/remove a comparison set, filter or tag.
- Create a follow-up/internal task, note or draft.
- Draft a client brief or other internal creative artifact.

Policy:

- The first request stops before the Analyst with HTTP 409.
- The user receives an explicit Confirm / Cancel UI.
- Confirming resubmits the same original request with `command_confirmation=confirmed`.
- Confirmation only permits the request to enter governed Watchdog tooling.
- **Confirmation is not authorization.** It does not bypass entitlements, RLS, permissions, target validation, or an action-specific approval requirement.
- No write is considered successful unless an approved Watchdog tool actually records and returns the outcome.

Current implementation note: the existing Analyst tool set is principally read-only. This contract therefore establishes the safe gate for future reversible tools without falsely representing that a mutation occurred today.

### Approval-required consequential actions

Examples:

- Send/email/text/message/call a client, lead or customer.
- Publish an Insight or external content.
- Launch/schedule paid advertising, broadcasts, newsletters or direct mail.
- Purchase, charge, refund or modify billing.
- Delete an account or significant user/workspace data.
- Submit/file/initiate a legal or appeal workflow.
- Write/sync to CRM, BoldTrail, Kit or another external provider.

Policy:

- The first request stops before the Analyst with HTTP 409.
- The UI offers **Prepare for review**, not Execute.
- If selected, the server rewrites the request into a non-executing proposal and explicitly forbids send, publish, launch, purchase, billing, deletion, submission, filing, mailing, calling, messaging, sync, or external mutation.
- The response states that no external or consequential action was executed.
- Any future execution remains owned by the existing action-specific Watchdog approval mechanism.

### Prohibited

Examples:

- Bypass RLS, plan gates, permissions, approvals, security controls or entitlements.
- Reveal service-role keys, credentials, secrets or access/refresh tokens.
- Grant unrestricted/admin/developer authority through a spoken request.
- Modify RLS/security policy through Voice.
- Enable always-listening/hot-mic behavior by command.
- Clone or impersonate another person's voice.

Policy:

- HTTP 403 before the Analyst is called.
- No prompt is forwarded upstream.
- No confirmation can make the prohibited request permissible.
- UI clearly states that no action was taken.

## Server-owned invariants

`/api/watchdog-intelligence-analyst` must:

1. Require a user Bearer token.
2. Use only the Supabase publishable key when forwarding to `intelligence-analyst`.
3. Classify the original prompt server-side.
4. Override any client-supplied command-policy execution fields.
5. Prevent prohibited, unconfirmed reversible and unprepared consequential requests from reaching the Analyst.
6. Force approval-required requests into a non-executing proposal before forwarding.
7. Preserve the original Analyst JWT, entitlement, session, tool and RLS/user-scoping controls.

## Human-control UX

The contextual Analyst panel must:

- Keep Voice transcript review before submission.
- Show Confirm / Cancel for reversible requests.
- Show Prepare for review / Cancel for approval-required requests.
- Show a hard blocked state for prohibited requests.
- Never treat a spoken “yes” captured before the explicit gate as confirmation for a pending action.
- Keep keyboard focus and mobile touch targets accessible.
- Explicitly state when a result is proposal-only or when confirmation merely released the request into governed tools.

## Privacy and evidence

This command layer does not change raw-audio retention. Browser-native Voice still does not upload raw microphone audio on the primary path, and written Watchdog output remains authoritative.

Command classification must not alter source facts, governed scores, evidence lineage, historical findings, or user ownership boundaries.

## Validation

Required executable contracts:

```bash
node property/tests/watchdog-intelligence-command-policy-contract.mjs
node property/tests/watchdog-contextual-voice-contract.mjs
node property/tests/watchdog-intelligence-voice-contract.mjs
node property/tests/watchdog-intelligence-narration-contract.mjs
```

The access-boundary GitHub Actions workflow must run the command-policy contract on every relevant main/PR change.

Production checks:

- `property/js/watchdog-intelligence-command-policy.js` serves `watchdog-command-policy-vnext-1` on `www.watchdogindex.com`.
- `property/js/watchdog-contextual-analyst.js` serves `contextual-analyst-v4-command-gates`.
- `/api/watchdog-intelligence-analyst` remains POST-only and private/no-store.
- No new runtime error group is attributable to the command-policy transport.

An authenticated customer-session canary should verify 403/409/proposal-only behavior whenever a safe signed-in test session is available. Do not substitute an unauthenticated request for that evidence.

## Rollback

If a regression is found:

1. Roll back the command-policy release together with its contextual UX and Analyst transport changes so client and server contracts stay aligned.
2. Keep typed Analyst access available through the last known-good governed path.
3. Do not remove or weaken existing entitlement, JWT, RLS, approval, billing, provider, or security gates to restore Voice functionality.
4. Record the regression and rollback evidence on NJW-265 before re-enabling the affected command class.

## Future write-tool rule

When real reversible or consequential mutation tools are added, they must introduce a server-owned structured action contract containing explicit action type, target, user/organization scope, entitlement result, confirmation/approval state, idempotency/audit identity, and outcome. The current `confirmed` UI state must never be reused as a universal permission token.
