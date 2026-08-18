# Watchdog Compliance Readiness

## Purpose

Watchdog is building toward independent security, privacy, accessibility and operational assurance while the product is still evolving. This program exists so new features, connectors and workflows are designed with evidence, security and governance from the beginning rather than retrofitted before an audit.

This repository does **not** claim that Watchdog is SOC 2 audited, ISO certified, PCI certified, WCAG conformant, or otherwise independently certified unless a current external report or certificate establishes that claim.

## Frameworks in scope

- SOC 2 Trust Services Criteria, with Security as the baseline and Availability, Confidentiality, Processing Integrity and Privacy evaluated as product scope matures.
- NIST Cybersecurity Framework 2.0 as the organizing governance model.
- OWASP Application Security Verification Standard 5.0 Level 2 as the primary web-application security verification target.
- WCAG 2.2 Level AA as the accessibility target.
- PCI DSS requirements applicable to Watchdog's payment architecture and merchant validation path.
- New Jersey Data Privacy Act requirements applicable to personal and sensitive data processing.
- ISO/IEC 27001 as a future information-security management certification target when commercially justified.
- ISO/IEC 27701 as a future privacy-management target when justified by processing scope.
- ISO/IEC 42001 as a future AI-management target if Watchdog's AI features become material enough to justify certification.

## Operating rules

1. Every compliance change must produce evidence. Policy-only work should identify how operating effectiveness will later be demonstrated.
2. Every new material connector receives a security, privacy, data-flow, credential, retention and vendor-risk review before production use.
3. No website or sales copy may claim a certification, audit result or conformance status that has not been independently established and remains current.
4. Security evidence must never contain customer data, secrets, tokens, private keys, raw authentication material or exploitable implementation detail.
5. Existing controls should be reused and strengthened instead of creating parallel compliance-only systems.
6. High-risk gaps take priority over badge acquisition.
7. The daily compliance task must complete at least one substantive readiness improvement, not a cosmetic edit.
8. Material decisions and accepted risks are recorded in `DECISION-LOG.md` and reflected in the website Compliance Center through `property/data/compliance-log.json`.
9. Framework mappings are maintained in `CONTROL-REGISTER.md`.
10. Formal audits are deferred until core production workflows, billing, material connectors and access architecture are substantially stable.

## Evidence quality

Evidence should be repeatable and reviewable. Preferred evidence includes automated tests, CI results, access-control policies, configuration-as-code, deployment inventories, signed vendor agreements, risk assessments, incident exercises, backup/restore results, accessibility test results, penetration-test reports and dated approval records.

A statement that a control exists is not the same as evidence that the control operates effectively.

## Daily improvement standard

A daily run counts only when it advances one or more of the following:

- security control implementation or testing;
- privacy/data-protection analysis;
- accessibility remediation or automated verification;
- connector/vendor risk management;
- incident-response or recovery preparedness;
- access review or least-privilege enforcement;
- secure SDLC/change-management evidence;
- vulnerability, dependency, secret or code scanning;
- data retention/deletion governance;
- AI governance and model/data risk controls;
- audit-evidence collection or framework mapping;
- remediation of a documented compliance gap.

If a technical change is blocked, a substantive risk assessment, control design, evidence plan or remediation plan may count provided the blocker and next action are recorded.
