# Watchdog Compliance Decision Log

This log records material security, privacy, accessibility, assurance and governance decisions for the Watchdog `/property/` platform. It is intended to preserve the reasoning behind controls so future changes can be reviewed against prior decisions instead of relying on memory.

Do not place credentials, customer data, tokens, private keys, raw production payloads or exploitable implementation details in this log.

---

## 2026-08-18 — Establish compliance readiness before formal certification

**Decision ID:** WCR-2026-08-18-001  
**Frameworks:** SOC 2, NIST CSF 2.0, OWASP ASVS 5.0, ISO/IEC 27001  
**Decision:** Establish a permanent compliance-readiness program now rather than waiting until the product is complete.

**Reasoning:** Watchdog is still adding major workflows, integrations and data sources. Controls built during development are cheaper and more reliable than controls retrofitted immediately before an audit. Starting now also creates historical evidence for change management, access control, incident response, privacy and recovery practices.

**Evidence created:**

- `property/docs/compliance/README.md`
- `property/docs/compliance/CONTROL-REGISTER.md`
- `api/_compliance-data.js`
- `property/compliance/index.html`
- `property/tests/compliance-contracts.mjs`

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

**Reasoning:** Connectors can change data flows, credential exposure, retention, subprocessors, privacy obligations, incident dependencies and compliance scope. Public-data connectors generally present less risk than integrations that transmit account, financial, communications, CRM, voice, AI or payment information, but each material integration must be classified rather than assumed safe.

**Minimum review fields:** Business purpose, data in/out, classification, credentials, scopes, retention, encryption, subprocessors, webhook/auth controls, privacy/DPA impact, assurance evidence, failure/incident path, offboarding and production approval.

**Residual risk:** Existing integrations need to be backfilled into the future vendor/connector inventory.

**Next action:** Create the vendor and connector inventory and review template.

---

## 2026-08-18 — Existing automated security contracts are formal evidence

**Decision ID:** WCR-2026-08-18-004  
**Frameworks:** SOC 2, OWASP ASVS 5.0, NIST CSF 2.0  
**Decision:** Treat repeatable CI security assertions as audit evidence and expand them over time instead of maintaining a separate compliance-only test suite that duplicates product security controls.

**Current evidence includes:**

- `.github/workflows/access-boundary-audit.yml`
- `property/tests/security-contracts.mjs`
- Supabase RLS/entitlement migration assertions
- payment webhook signature assertions
- CORS/origin restrictions
- server-authoritative pricing assertions
- deployment security header assertions

**Reasoning:** A control executed automatically during changes is stronger and easier to reproduce than a narrative saying the control exists.

**Residual risk:** Static assertions do not replace penetration testing, dynamic scanning, dependency/secret scanning or complete OWASP ASVS verification.

**Next action:** Expand the compliance evidence map and add missing technical verification categories.

---

## 2026-08-18 — Keep detailed logs useful but sanitized

**Decision ID:** WCR-2026-08-18-005  
**Frameworks:** SOC 2, NJDPA, NIST CSF 2.0, ISO/IEC 27001  
**Decision:** Maintain a detailed website-accessible developer Compliance Center and repository decision log, but prohibit security evidence from containing secrets, customer information, raw tokens or unnecessarily exploitable implementation detail.

**Reasoning:** Compliance evidence must be specific enough to prove what happened without becoming a secondary security risk.

**Implementation:** The Compliance Center is developer-gated in the Watchdog UI, is marked `noindex,nofollow,noarchive,nosnippet`, and displays a sanitized structured log. The underlying repository remains the source of truth.

**Residual risk:** Because the repository is public, all committed compliance artifacts must continue to be written as public-safe records even when the UI is developer-gated.

**Next action:** Keep automated checks validating required log structure and rejecting obvious secret patterns in compliance artifacts.

---

## 2026-08-18 — Require server-side developer verification for operational compliance evidence

**Decision ID:** WCR-2026-08-18-006  
**Frameworks:** SOC 2, NIST CSF 2.0, OWASP ASVS 5.0, ISO/IEC 27001  
**Decision:** Do not rely on client-side hiding as the only access boundary for the Compliance Center evidence feed.

**Reasoning:** A browser-only gate can prevent normal navigation but does not stop a caller from requesting a known static evidence URL directly. Internal governance information should require an authenticated developer decision on the server as well.

**Implementation:** `/property/compliance` remains developer-gated and excluded from indexing. Detailed log data is loaded through `/api/compliance-log`; the endpoint validates the Watchdog bearer session and developer entitlement before returning data, disables caching, opts out of indexing/snippets, and returns a non-descriptive not-found response to unauthorized callers. The previous static `/property/data/compliance-log.json` file was removed from the webroot and the structured evidence now lives in the API-side module `api/_compliance-data.js`.

**Evidence:**

- `api/compliance-log.js`
- `api/_compliance-data.js`
- `property/js/compliance.js`
- `property/compliance/index.html`
- `property/tests/compliance-contracts.mjs`

**Residual risk:** The repository itself remains public, so committed records must remain sanitized regardless of website protection.

**Next action:** Revisit repository visibility before richer external audit evidence or penetration-test materials are stored in Git.

---

## 2026-08-18 — Run compliance improvement sessions twice daily

**Decision ID:** WCR-2026-08-18-007  
**Frameworks:** SOC 2, NIST CSF 2.0, ISO/IEC 27001  
**Decision:** Run the recurring compliance-readiness workflow at approximately 1:00 AM and 12:00 PM Eastern Time every day indefinitely. Each session must complete at least one substantive improvement and may complete multiple related improvements when appropriate.

**Reasoning:** The objective is continuous risk reduction and evidence accumulation, not satisfying an artificial one-item quota. Two daily review windows better match an actively changing SaaS platform and increase the chance that security/compliance work evolves with product development.

**Residual risk:** Frequency does not equal quality; substantive evidence and periodic human review remain required.

**Next action:** Prioritize high-risk technical and governance gaps rather than low-value documentation volume.
