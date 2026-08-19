# Watchdog NIST Cybersecurity Framework 2.0 Profile

**Baseline date:** 2026-08-19  
**Scope:** Watchdog `/property/` SaaS, supporting APIs, Supabase functions, production hosting, billing and material connectors.  
**Status:** Internal profile, not a certification.

## Method

This profile uses the six NIST CSF 2.0 Functions: **Govern, Identify, Protect, Detect, Respond, Recover**. The Current Profile describes evidence visible today; the Target Profile describes the operating state Watchdog should reach before a paid external assurance engagement.

| Function | Current profile | Target profile | Priority no-cost gap |
|---|---|---|---|
| Govern | Compliance charter, control register, connector register, deployment policy, certification-claim rules and twice-daily improvement cadence exist. | Cyber risk decisions, owners, exceptions, suppliers and evidence are consistently recorded and periodically reviewed. | Add explicit risk register, control owners, exception acceptance and recurring vendor review dates. |
| Identify | Material connectors and several critical workflows are inventoried; data-source and production-function inventories exist. | Assets, data classes, external dependencies, business-critical workflows and risk scenarios are complete and current. | Create consolidated asset/data-flow inventory and risk register. |
| Protect | RLS, entitlements, developer authorization, signed provider webhooks, server-authoritative pricing, security headers and deployment controls exist. | Least privilege, secure configuration, MFA/privileged access, data minimization, secure SDLC and recovery safeguards are consistently evidenced. | Formalize privileged-access review, ASVS mapping, secrets/dependency scanning evidence and retention rules. |
| Detect | Security contracts and reliability telemetry provide some automated detection; source monitoring exists for data changes. | Security-relevant events, anomalies, failed control checks and provider incidents have defined detection paths and owners. | Define security event catalog, alert thresholds, review cadence and evidence retention. |
| Respond | Incident-response runbook and first tabletop exercise are retained. | Incidents have repeatable triage, containment, communications, evidence preservation, lessons learned and connector escalation. | Run connector/credential-revocation tabletop and define notification decision path. |
| Recover | Restore-drill workflow exists and change rollback/source reconciliation is documented. | Business-critical recovery objectives are defined, tested, measured and updated after changes. | Define provisional RTO/RPO by critical service and retain measured restore evidence. |

## Initial risk themes

1. **Identity and privilege risk** — developer/service-role access can create high impact if mis-scoped.
2. **Connector expansion risk** — each new provider may change data flow, privacy, availability and credential exposure.
3. **Sensitive/profile data risk** — user-entered financial and household details require minimization and clear purpose/retention controls even when they do not meet a statutory sensitive-data definition.
4. **Billing integrity risk** — subscription and marketing payment flows require provider authenticity, server-authoritative pricing and lifecycle reconciliation.
5. **Public-record/product inference risk** — public property data may be combined into derived intelligence; use cases must avoid misleading claims, prohibited profiling or accidental person-level exposure.
6. **Availability/recovery risk** — auth, Supabase, hosting and data-provider failures can block paid workflows.
7. **AI governance risk** — future AI features can create data leakage, explainability, hallucination and automated-decision risks unless scoped and tested.

## Target maturity before external SOC/ISO work

- Every critical control has an owner, evidence path and review cadence.
- Material production connectors have completed risk reviews and offboarding procedures.
- Privileged access is periodically reviewed and evidenced.
- Vulnerability management has operating evidence and remediation expectations.
- ASVS Level 2 applicability mapping is complete for the production application.
- Data-protection assessments reflect live sensitive/high-risk processing.
- Incident and recovery exercises have measured results and tracked remediation.
- WCAG testing covers representative public and authenticated journeys.
- PCI scope and applicable merchant validation path are documented for the live checkout architecture.

## Official reference

NIST Cybersecurity Framework 2.0: `https://www.nist.gov/cyberframework`
