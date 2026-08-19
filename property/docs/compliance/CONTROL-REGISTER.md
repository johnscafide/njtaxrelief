# Watchdog Compliance Control Register

**Program status:** Readiness in progress  
**Last updated:** 2026-08-19  
**Assurance status:** No independent certification or SOC report is claimed by this document.

## Status key

- **Implemented**: control is present with identifiable evidence.
- **Partial**: some control components exist but scope/evidence is incomplete.
- **Planned**: control is accepted into the roadmap but is not yet operating.
- **External validation pending**: internally implemented but requires an independent assessor, scan, test or attestation.

| ID | Control area | Framework mapping | Status | Current evidence | Primary gap / next action |
|---|---|---|---|---|---|
| WCR-GOV-001 | Compliance governance | SOC 2, NIST CSF Govern, ISO 27001 | Implemented | `property/docs/compliance/README.md`, `api/_compliance-data.js` | Continue twice-daily evidence collection and assign owners as team grows. |
| WCR-GOV-002 | Certification claim control | SOC 2, ISO 27001, consumer protection | Implemented | Compliance charter and automated compliance contracts | Extend claim review to marketing/release copy if certification language is ever introduced. |
| WCR-GOV-003 | Internal compliance evidence access | SOC 2 Security/Confidentiality, NIST Protect, OWASP ASVS, ISO 27001 | Implemented | `api/compliance-log.js`, `api/_compliance-data.js`, `property/js/compliance.js`, `property/tests/compliance-contracts.mjs` | Keep operational evidence out of the static `/property/` webroot and reassess repository visibility before storing richer external audit evidence. |
| WCR-SDLC-001 | Authorization boundary testing | SOC 2 Security, OWASP ASVS Access Control, NIST Protect | Implemented | `.github/workflows/access-boundary-audit.yml`, `property/scripts/audit_access_boundaries.mjs` | Add dynamic authenticated-route verification where static assertions are insufficient. |
| WCR-SDLC-002 | Application security contracts | SOC 2 Security, OWASP ASVS, NIST Protect | Implemented | `property/tests/security-contracts.mjs` | Expand coverage for dependency, secret and code scanning and maintain ASVS requirement-level mapping. |
| WCR-CHG-001 | Git source of truth / production reconciliation | SOC 2 Change Management, NIST Protect, ISO 27001 | Implemented | `supabase/functions/DEPLOYMENT-POLICY.md`, production inventory controls | Extend equivalent evidence discipline to every material connector and infrastructure component. |
| WCR-IAM-001 | Database row-level access and entitlements | SOC 2 Security, OWASP ASVS Access Control | Implemented | `property/tests/security-contracts.mjs`, Supabase migrations | Add periodic privileged-access review evidence and formal joiner/mover/leaver process as team grows. |
| WCR-PAY-001 | Signed payment webhooks | SOC 2 Security, OWASP ASVS, PCI DSS | Implemented | Stripe/Paddle checks in `property/tests/security-contracts.mjs` | Complete merchant PCI scope determination and applicable SAQ/ASV requirements before scaled production billing. |
| WCR-PAY-002 | Server-authoritative pricing | SOC 2 Processing Integrity, OWASP ASVS | Implemented | Marketing checkout security contracts | Maintain tests for every new paid workflow. |
| WCR-IR-001 | Incident response runbook | SOC 2 Security/Availability, NIST Respond, ISO 27001 | Implemented | `property/docs/incident-response-runbook.md` | Maintain the runbook and reconcile future exercises/incidents against it. |
| WCR-IR-002 | Incident response tabletop exercise | SOC 2 Security/Availability, NIST Respond/Recover, ISO 27001 | Implemented | `property/docs/compliance/INCIDENT-TABLETOP-2026-08-19.md` | Add a reusable incident record template, define provisional RTO/RPO targets and run a future connector-focused exercise. |
| WCR-LOG-001 | Privacy-safe reliability telemetry | SOC 2 Privacy, NJDPA, NIST Protect/Detect | Implemented | `property/docs/incident-response-runbook.md` | Verify telemetry providers/configuration against documented minimization requirements. |
| WCR-PRIV-001 | Privacy notice and consumer rights | NJDPA, SOC 2 Privacy, ISO 27701 | Implemented | `property/privacy/index.html` | Perform periodic data-inventory-to-policy reconciliation as features/connectors change. |
| WCR-PRIV-002 | Sensitive financial-data consent | NJDPA, SOC 2 Privacy, ISO 27701 | Partial | Privacy policy and product consent design | Create/maintain formal data-protection assessment evidence for sensitive-data workflows. |
| WCR-VEND-001 | Material connector/vendor review | SOC 2 Security/Confidentiality, NIST Govern, ISO 27001 | Partial | `property/docs/compliance/CONNECTOR-REGISTER.md`, compliance charter | Verify live status and complete detailed reviews for Tier 1 connectors first, then backfill remaining material connectors. |
| WCR-ACC-001 | WCAG 2.2 AA target | WCAG 2.2 AA, SOC 2 availability/usability risk support | Planned | Existing UI test workflows and application code | Establish automated accessibility baseline plus manual keyboard/screen-reader audit. |
| WCR-VULN-001 | Vulnerability management | SOC 2 Security, NIST Identify/Protect/Detect, OWASP ASVS | Partial | Security contract CI | Verify/enable dependency alerts, secret scanning, push protection and code scanning; establish remediation SLAs. |
| WCR-PEN-001 | Independent penetration test | SOC 2 Security, OWASP ASVS | External validation pending | None yet | Perform once production architecture and material connectors are substantially stable. |
| WCR-BCP-001 | Backup/restore testing | SOC 2 Availability, NIST Recover, ISO 27001 | Partial | `.github/workflows/njw-42-isolated-restore-drill.yml` | Review latest drill evidence, recovery objectives and production coverage. |
| WCR-AI-001 | AI governance | ISO 42001, NIST Govern, SOC 2 Processing Integrity/Privacy | Planned | Product architecture and compliance charter | Inventory AI uses, model/data flows, human review requirements, prohibited uses and evaluation evidence as AI features mature. |
| WCR-SOC-001 | SOC 2 readiness assessment | SOC 2 | Planned | This control register and linked evidence | Engage readiness assessor after core workflows, billing, access architecture and material connectors stabilize. |
| WCR-ISO-001 | ISO/IEC 27001 certification readiness | ISO/IEC 27001 | Planned | NIST/SOC-aligned controls will provide reusable evidence | Reassess commercial need after SOC 2 readiness matures. |

## Required connector review fields

Every new material connector should eventually have a dated record containing:

- business purpose and owner;
- data received and data transmitted;
- data classification, including personal or sensitive data;
- authentication/credential method and rotation/revocation process;
- permissions/scopes and least-privilege justification;
- storage locations and retention/deletion behavior;
- subprocessors or onward transfers where relevant;
- encryption expectations;
- webhook/signature/replay controls where applicable;
- failure modes and incident contact path;
- privacy-policy/DPA impact;
- security documentation or assurance reports reviewed;
- production approval decision and reviewer;
- offboarding/revocation procedure.

## Audit-readiness gate

A formal SOC 2 readiness engagement should be considered when all of the following are substantially true:

1. Core authentication and entitlement architecture is stable.
2. Primary billing flow is live and its PCI scope is documented.
3. Material production data connectors are known and inventoried.
4. Privileged access and change management operate consistently.
5. Incident response and recovery controls have been exercised.
6. Vulnerability management is operating with evidence and remediation expectations.
7. Privacy data-flow and sensitive-processing assessments reflect the live product.
8. Compliance evidence has accumulated over time rather than being reconstructed immediately before an audit.
