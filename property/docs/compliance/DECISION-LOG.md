# Watchdog Compliance Decision Log

This log records material security, privacy, accessibility, assurance and governance decisions for the Watchdog `/property/` platform. It is intended to preserve the reasoning behind controls so future changes can be reviewed against prior decisions instead of relying on memory.

Do not place credentials, customer data, tokens, private keys, raw production payloads or exploitable implementation details in this log.

---

## 2026-08-18 — Establish compliance readiness before formal certification

**Decision ID:** WCR-2026-08-18-001  
**Frameworks:** SOC 2, NIST CSF 2.0, OWASP ASVS 5.0, ISO/IEC 27001  
**Decision:** Establish a permanent compliance-readiness program now rather than waiting until the product is complete.

**Reasoning:** Watchdog is still adding major workflows, integrations and data sources. Controls built during development are cheaper and more reliable than controls retrofitted immediately before an audit. Starting now also creates historical evidence for change management, access control, incident response, privacy and recovery practices.

**Evidence created:** `property/docs/compliance/README.md`, `property/docs/compliance/CONTROL-REGISTER.md`, `api/_compliance-data.js`, `property/compliance/index.html`, `property/tests/compliance-contracts.mjs`.

**Residual risk:** Internal readiness work is not equivalent to independent assurance.

**Next action:** Continue closing high-risk control gaps and accumulating operating evidence.

---

## 2026-08-18 — Defer paid formal audits until architecture is substantially stable

**Decision ID:** WCR-2026-08-18-002  
**Frameworks:** SOC 2, ISO/IEC 27001, ISO/IEC 27701, ISO/IEC 42001  
**Decision:** Do not pursue expensive formal certification/audit work solely for a badge while core product architecture, billing, material connectors and access patterns are still undergoing substantial change.

**Reasoning:** A rapidly changing system increases audit rework and can make recently collected evidence unrepresentative. Watchdog should become audit-ready first, then engage external assessors against a system that resembles the production platform customers will actually use.

**Residual risk:** Some enterprise prospects may request external assurance before Watchdog has completed it.

**Trigger to revisit:** Core workflows, billing, access architecture and the majority of material production connectors are stable enough to define a durable audit scope.

---

## 2026-08-18 — Treat every material connector as a compliance change

**Decision ID:** WCR-2026-08-18-003  
**Frameworks:** SOC 2, NIST CSF 2.0, NJDPA, ISO/IEC 27001, ISO/IEC 27701  
**Decision:** Adding a new material third-party connector must trigger a security/privacy/vendor/data-flow review rather than being treated as a normal feature-only change.

**Reasoning:** Connectors can change data flows, credential exposure, retention, subprocessors, privacy obligations, incident dependencies and compliance scope. Each material integration must be classified rather than assumed safe.

**Residual risk:** Existing integrations need to be backfilled into the vendor/connector inventory.

---

## 2026-08-18 — Existing automated security contracts are formal evidence

**Decision ID:** WCR-2026-08-18-004  
**Frameworks:** SOC 2, OWASP ASVS 5.0, NIST CSF 2.0  
**Decision:** Treat repeatable CI security assertions as audit evidence and expand them over time instead of maintaining a separate compliance-only test suite that duplicates product security controls.

**Residual risk:** Static assertions do not replace penetration testing, dynamic scanning, dependency/secret scanning or complete OWASP ASVS verification.

---

## 2026-08-18 — Keep detailed logs useful but sanitized

**Decision ID:** WCR-2026-08-18-005  
**Frameworks:** SOC 2, NJDPA, NIST CSF 2.0, ISO/IEC 27001  
**Decision:** Maintain detailed developer compliance evidence while prohibiting credentials, customer information, raw tokens or unnecessarily exploitable implementation detail.

**Residual risk:** Because the repository is public, committed compliance artifacts must remain public-safe records.

---

## 2026-08-18 — Require server-side developer verification for operational compliance evidence

**Decision ID:** WCR-2026-08-18-006  
**Frameworks:** SOC 2, NIST CSF 2.0, OWASP ASVS 5.0, ISO/IEC 27001  
**Decision:** Do not rely on client-side hiding as the only access boundary for the Compliance Center evidence feed.

**Implementation:** Detailed log data is loaded through `/api/compliance-log`, which validates the Watchdog bearer session and developer entitlement; the previous static webroot evidence file was removed.

**Residual risk:** The repository itself remains public, so committed records must remain sanitized.

---

## 2026-08-18 — Run compliance improvement sessions twice daily

**Decision ID:** WCR-2026-08-18-007  
**Frameworks:** SOC 2, NIST CSF 2.0, ISO/IEC 27001  
**Decision:** Each compliance session must complete at least one substantive improvement and may complete multiple related improvements when appropriate.

**Reasoning:** The objective is continuous risk reduction and evidence accumulation, not satisfying an artificial one-item quota.

---

## 2026-08-19 — Exercise incident response before a real incident

**Decision ID:** WCR-2026-08-19-001  
**Frameworks:** SOC 2 Security/Availability, NIST CSF 2.0 Respond/Recover, ISO/IEC 27001, OWASP ASVS 5.0  
**Decision:** Perform and retain sanitized internal tabletop exercises rather than treating a written runbook alone as proof of operational readiness.

**Evidence:** `property/docs/compliance/INCIDENT-TABLETOP-2026-08-19.md`.

**Residual risk:** A tabletop does not prove real-world response time or external-provider coordination effectiveness.

---

## 2026-08-19 — Establish risk register and expose ASVS identity target gaps

**Decision ID:** WCR-2026-08-19-003  
**Frameworks:** NIST CSF 2.0 Govern/Identify/Protect, SOC 2 Security, OWASP ASVS 5.0.0 Level 2, ISO/IEC 27001  
**Decision:** Convert compliance gaps into a maintained cybersecurity risk register and begin requirement-level ASVS verification with authentication, session management, authorization, and OAuth/OIDC.

**Evidence:** `property/docs/compliance/RISK-REGISTER.md`, `property/docs/compliance/ASVS-AUTH-SESSION-AUTHZ-TRANCHE-2026-08-19.md`, `property/tests/auth-asvs-contract.mjs`.

**Residual risk:** MFA enforcement, provider-side settings, session lifecycle and full OAuth/OIDC applicability remain incomplete.

---

## 2026-08-20 — Establish field-level privacy inventory and minimize demographic/profile use

**Decision ID:** WCR-2026-08-20-002  
**Frameworks:** NJDPA, SOC 2 Privacy/Confidentiality, NIST CSF Govern/Identify/Protect, ISO/IEC 27701  
**Decision:** Maintain a field-level personal-data inventory for Watchdog onboarding and treat optional demographic/financial-profile fields as elevated privacy data even where they do not meet a statutory sensitive-data definition. Do not use demographic answers for housing audience targeting, eligibility decisions, protected-trait inference, or alteration of source facts.

**Reasoning:** The onboarding schema now contains meaningful first-party context including persona, housing status, age band, household income band, household size, ZIP, goals and professional context. A generic statement that Watchdog stores “profile data” is insufficient for minimization, deletion, connector review, or privacy-policy reconciliation. The schema already provides useful controls: own-row RLS, anonymous revocation, bounded payloads, allow-listed values, `prefer_not` choices, and an explicit database prohibition on demographic housing targeting. The compliance program now records those controls at field level and requires future connectors to identify exact fields transferred.

**Evidence created:**

- `property/docs/compliance/PERSONAL-DATA-INVENTORY-2026-08-20.md`
- `supabase/migrations/20260819150000_required_watchdog_onboarding_v1.sql`
- `property/docs/compliance/CONTROL-REGISTER.md`

**Residual risk:** Repository evidence does not yet prove every production copy, analytics/log event, backup, downstream Intelligence consumer, deletion path, or third-party transfer. The `responses` JSON snapshot duplicates structured profile data and therefore increases retention/deletion surface.

**Next action:** Verify that `intelligence_personalization=false` is honored by every downstream consumer, trace account/profile deletion across both structured columns and `responses`, define provisional retention periods, and extend the inventory to analytics/logs/backups and connector transfers.