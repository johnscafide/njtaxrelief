# Watchdog Provisional Recovery Objectives

**Date:** 2026-08-20  
**Budget:** $0 internal readiness  
**Frameworks:** SOC 2 Availability, NIST CSF 2.0 Recover, ISO/IEC 27001  
**Status:** Provisional internal objectives; not an SLA or external assurance claim.

## Purpose

Define measurable recovery priorities before a production incident occurs. These objectives are deliberately conservative and must be revised when measured restore evidence, provider capabilities, product criticality, or contractual commitments change.

## Recovery tiers

| Tier | System / capability | Provisional RTO | Provisional RPO | Recovery priority |
|---|---|---:|---:|---|
| 0 | Authentication, authorization, entitlement enforcement, core database integrity | 4 hours | 24 hours | Restore safe authenticated access and authoritative account/property state first. Fail closed where authorization state cannot be trusted. |
| 1 | Core property lookup, saved-property state, billing entitlement state, critical APIs | 8 hours | 24 hours | Restore customer-critical read/write workflows after identity and authorization integrity are established. |
| 2 | Intelligence summaries, reports, exports, connector-fed enrichment | 24 hours | 24 hours | Restore only after source provenance, authorization and dependency health are verified. |
| 3 | Marketing, analytics, non-critical content, convenience integrations | 72 hours | 72 hours | These may remain unavailable while higher tiers recover. |

RTO means the target elapsed time to restore an acceptable service capability after a qualifying disruption. RPO means the maximum targeted data-loss window. These are engineering targets, not promises to customers.

## Recovery order and gates

1. Confirm incident containment and that recovery will not reintroduce the triggering condition.
2. Establish trustworthy identity, authorization and secrets/credential state.
3. Restore the authoritative database into an isolated target when a destructive recovery is required.
4. Reconcile schema/migration history, authentication records, storage metadata and billing entitlement state before declaring the data layer recovered.
5. Restore Tier 1 customer workflows and validate negative authorization boundaries.
6. Restore enrichment/connectors incrementally; do not allow a failed dependency to fabricate zero/default factual values.
7. Restore lower-tier marketing/analytics integrations last.
8. Record actual recovery elapsed time, observed data-loss window, failed checks, exceptions and follow-up remediation.

## Existing evidence

The repository contains `.github/workflows/njw-42-isolated-restore-drill.yml`, an isolated-target logical backup/restore rehearsal. It enforces a non-production restore target, reconciles database/auth/migration/billing/storage metadata, calculates measured recovery time, and persists sanitized continuity evidence. Production data is not uploaded as a workflow artifact.

The existence of this workflow is evidence of a recovery-control design. It does not by itself prove that a recent drill has passed or that every production component meets the provisional objectives. A dated successful run is required for operating-effectiveness evidence.

## Recovery evidence required per drill

- drill date and release/version;
- recovery scope and isolated target;
- start/completion timestamps;
- measured RTO and RPO;
- reconciliation checks performed and pass/fail result;
- excluded components or known limitations;
- whether any sensitive backup artifact was retained;
- incident/recovery owner;
- remediation items and due priority.

## Residual risks

- Provider-level outages can exceed Watchdog-controlled recovery objectives.
- A logical database restore does not automatically prove restoration of every external connector or third-party service.
- Storage object metadata reconciliation does not necessarily prove independent restoration of every underlying binary object.
- Objectives are not yet backed by enough repeated measured drills to make an external availability commitment.
- Recovery procedures must evolve as new connectors and AI workflows become material.

## Next no-cost actions

1. Review the latest available isolated-restore run and compare measured recovery time with these provisional objectives.
2. Add a connector/credential-revocation recovery tabletop covering a compromised material integration.
3. Maintain a recovery dependency inventory for Tier 0 and Tier 1 systems.
4. Re-rate WR-010 only after retained measured evidence demonstrates repeatability.
