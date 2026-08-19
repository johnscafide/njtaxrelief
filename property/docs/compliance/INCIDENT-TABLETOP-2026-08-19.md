# Watchdog Incident Response Tabletop — 2026-08-19

**Exercise ID:** WCR-IR-TTX-2026-08-19-001  
**Status:** Completed internal tabletop  
**Scope:** Watchdog `/property/` application, authentication boundary, billing-sensitive workflows, reliability telemetry and production change management  
**Framework mapping:** SOC 2 Security/Availability, NIST CSF 2.0 Respond/Recover, ISO/IEC 27001 incident management, OWASP ASVS operational security support

## Purpose

Exercise the existing Watchdog incident-response runbook without using customer data or making destructive production changes. The objective is to verify that a plausible multi-customer security/reliability event can be classified, assigned, contained, investigated, communicated and closed using existing documented controls.

## Scenario

A newly deployed authenticated workflow begins returning authorization failures to multiple legitimate users shortly after a release. At the same time, the reliability signal shows a sharp increase in repeated application errors. There is no evidence that data was disclosed, but the event affects access to a paid workflow and could reflect either a defective entitlement change or an authorization regression.

No live credentials, customer identifiers, request payloads, property addresses or production secrets were used during this exercise.

## Walkthrough

1. **Detect and classify.** The event qualifies for immediate incident handling because it affects an authenticated paid flow across multiple users and may involve an authorization boundary.
2. **Preserve privacy-safe evidence.** Retain route, release identifier, error class, occurrence count and timing only. Do not collect query strings, addresses, tokens, full request bodies or customer identifiers unless a later investigation establishes a narrowly justified need.
3. **Assign ownership.** Open an incident record, name one response owner and one verifier, and prevent parallel uncoordinated production edits.
4. **Check recent change evidence.** Compare the affected route and release against committed source, the latest deployment changes and the production inventory/fingerprint records before making a corrective deployment.
5. **Contain.** Prefer disabling or rolling back the affected feature/release path when safe rather than attempting multiple unreviewed hotfixes. Preserve the known-good path for unaffected users.
6. **Investigate authorization first.** Validate authenticated session handling, developer/plan entitlement checks and server-side authorization boundaries before treating the issue as a client-only rendering problem.
7. **Verify recovery end to end.** After mitigation, test browser → API → database behavior for an authorized user and confirm that an unauthorized user remains denied.
8. **Communicate.** If customer-visible impact persists or involved paid-flow availability, communicate what users experienced, when it began, the affected feature and the next update point without exposing internal implementation detail.
9. **Close with evidence.** Resolve only after the error signal stops, the affected flow passes, the authorization boundary remains intact and any emergency production change is reconciled back to Git and inventory.

## Control observations

### Controls that supported the exercise

- A written incident-response runbook already defines severity, response, customer communication and telemetry minimization.
- Access-boundary and security-contract tests provide repeatable checks for authentication, entitlement and security invariants.
- Git is documented as the source of truth for Supabase Edge Function deployments, with production reconciliation requirements.
- The compliance evidence feed is developer-gated and server-authorized, limiting exposure of operational governance records.

### Gaps identified

1. There is not yet a single standardized incident record template for preserving timestamps, owner, affected service, containment decision, customer-impact decision, verification result and corrective actions.
2. Recovery objectives are not yet expressed as formal service-level RTO/RPO targets for the whole Watchdog platform.
3. The exercise did not use a live staging environment or simulate provider outages, so technical recovery timing remains unmeasured.
4. A future exercise should cover a third-party connector or credential-revocation scenario, because connector failures can create different containment and communication requirements.

## Decisions

- Keep incident evidence privacy-minimized by default.
- Require one named incident owner and one independent verifier for material incidents when staffing permits.
- Treat paid-flow authorization regressions as material even when there is no evidence of data disclosure.
- Require emergency fixes to be reconciled back to source-of-truth and production inventory before incident closure.

## Residual risk

This tabletop demonstrates that the documented response process is coherent, but it does not prove real-world response speed, staging recovery capability, provider coordination, or independent effectiveness. Those require future exercises and eventually external validation.

## Next no-cost actions

1. Add a reusable incident record template under `property/docs/compliance/`.
2. Define provisional internal RTO/RPO targets for critical Watchdog workflows and validate them against current backup/restore capabilities.
3. Run a future connector-focused tabletop covering provider outage or credential revocation.
4. Retain future exercise records as dated evidence and track remediation to closure.
