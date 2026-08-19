# Watchdog Cybersecurity and Compliance Risk Register

**Program:** Watchdog `/property/`  
**Created:** 2026-08-19  
**Budget constraint:** $0 internal readiness  
**Framework mapping:** NIST CSF 2.0, SOC 2, OWASP ASVS 5.0.0, ISO/IEC 27001, NJDPA, PCI DSS, WCAG 2.2 AA

## Purpose

This register converts framework gaps into explicit risks that can be prioritized, treated, accepted, monitored, or transferred. It is intentionally sanitized: it identifies control themes and evidence paths without publishing secrets, customer data, exploit instructions, or sensitive architecture details.

NIST CSF 2.0 is used as the primary organizing framework because it treats cybersecurity as an enterprise risk-management problem across Govern, Identify, Protect, Detect, Respond, and Recover.

## Rating method

- **Likelihood:** Low / Medium / High based on exposure, maturity, and observed controls.
- **Impact:** Low / Medium / High based on potential confidentiality, integrity, availability, privacy, financial, or customer-trust effect.
- **Priority:** Low / Medium / High / Critical. This is an internal prioritization, not CVSS.
- **Treatment:** Mitigate / Accept / Avoid / Transfer / Monitor.

## Active risks

| ID | Risk | NIST CSF 2.0 | Related frameworks | Likelihood | Impact | Priority | Current controls/evidence | Treatment / next no-cost action |
|---|---|---|---|---|---|---|---|---|
| WR-001 | Authentication strength may not yet satisfy the selected ASVS Level 2 target for every user path, particularly enforced MFA and consistency across providers. | GV.RM, PR.AA | OWASP ASVS V6; SOC 2 Security | Medium | High | High | Supabase Auth, Google OAuth, PKCE runtime configuration, provider allowlist | Mitigate: complete auth-path inventory; document MFA posture; determine whether L2 requirement can be met or whether target/compensating-control decision must change. |
| WR-002 | Sensitive account changes may not consistently require recent re-authentication, and users may not have a single surface to review/terminate all active sessions. | PR.AA | OWASP ASVS V7; SOC 2 Security | Medium | High | High | Supabase session handling and explicit sign-out paths | Mitigate: inventory sensitive mutations; add re-auth requirements where supported; document session inventory/termination capability. |
| WR-003 | Authorization controls are strong in several server/database boundaries but incomplete dynamic evidence could allow a regression to go undetected. | PR.AA, DE.CM | OWASP ASVS V8; SOC 2 Security | Low-Medium | High | High | RLS, entitlements, developer API checks, access-boundary CI | Mitigate: add authenticated negative tests for developer, plan, record-owner, and export boundaries. |
| WR-004 | OAuth/OIDC provider expansion can introduce redirect, token, provider-configuration, or account-linking risk if new providers bypass the established PKCE/redirect wrapper. | GV.SC, PR.AA | OWASP ASVS V10; SOC 2 Security | Medium | High | High | Centralized `supabase-runtime.js`, PKCE, same-origin `/property/` redirect normalization, provider feature flags | Mitigate: make central runtime mandatory for all providers; add contract tests; require connector/security review before provider enablement. |
| WR-005 | Material connectors may process personal or operational data without complete risk, retention, offboarding, and least-privilege evidence as integrations expand. | GV.SC, ID.AM, PR.DS | SOC 2; ISO 27001; NJDPA | Medium | High | High | Connector register and review template | Mitigate: complete Tier 1 connector reviews and require review before new production activation. |
| WR-006 | Accessibility defects may block keyboard, assistive-technology, zoom, reflow, or error-recovery use even when automated scans pass. | GV.RM, ID.IM | WCAG 2.2 AA | Medium | Medium-High | High | Automated axe/Playwright baseline and manual test protocol | Mitigate: perform manual keyboard/focus/reflow testing on representative public and authenticated journeys and log defects. |
| WR-007 | Payment architecture changes could expand PCI scope or accidentally cause prohibited cardholder data to enter Watchdog systems/logs. | GV.RM, PR.DS | PCI DSS; SOC 2 | Low-Medium | High | High | Stripe-hosted Checkout design, signed webhooks, PCI scope memo | Avoid/Mitigate: prohibit card-entry fields and raw card data; inventory every payment entry point; re-scope after billing architecture changes. |
| WR-008 | Public privacy disclosures can drift from live data collection, analytics, integrations, retention, or legal classification as the product changes. | GV.PO, ID.AM | NJDPA; SOC 2 Privacy; ISO 27701 | Medium | High | High | Privacy policy, DPA baseline, connector register | Mitigate: field-level data inventory and recurring policy-to-system reconciliation before new high-risk processing launches. |
| WR-009 | Dependency, secret, and code-scanning coverage may be incomplete or dependent on repository/platform settings that are not yet retained as auditable evidence. | ID.RA, PR.PS, DE.CM | SOC 2; OWASP ASVS; ISO 27001 | Medium | High | High | Security-contract CI | Mitigate: verify available GitHub-native alerts/scanning settings; document remediation expectations; retain evidence without purchasing tools. |
| WR-010 | Backup existence does not prove recoverability or acceptable recovery time/data-loss objectives for every critical production component. | PR.IR, RC.RP | SOC 2 Availability; ISO 27001 | Medium | High | High | Isolated restore-drill workflow; incident tabletop | Mitigate: define provisional RTO/RPO by system, review latest restore evidence, and close coverage gaps. |
| WR-011 | Security events may not be consistently detectable across authentication, authorization, billing, connector, and administrative changes. | DE.CM, DE.AE | SOC 2 Security; OWASP ASVS V16 | Medium | High | High | Audit logs in selected workflows, incident runbook, privacy-safe telemetry guidance | Mitigate: define required security-event taxonomy and verify event coverage without logging sensitive values. |
| WR-012 | AI-derived insights may create privacy, accuracy, provenance, or automated-decision risks as Watchdog Intelligence expands. | GV.RM, GV.PO, ID.RA | ISO 42001; SOC 2; NJDPA | Medium | High | High | Compliance charter; source-fact and evidence patterns | Mitigate: inventory AI use cases, input/output data classes, human-review boundaries, prohibited uses, provenance, and evaluation evidence before higher-risk use. |
| WR-013 | Repository visibility may expose sanitized-but-useful implementation details if richer audit evidence, vulnerability reports, or provider reports are later committed. | GV.RM, PR.DS | SOC 2 Confidentiality; ISO 27001 | Medium | Medium-High | High | Protected Compliance Center API; rule against secrets/exploit-enabling evidence | Avoid: keep sensitive evidence out of public webroot/repo; reassess repository/private evidence store before external reports or detailed vulnerabilities are retained. |
| WR-014 | Security and compliance claims could exceed actual evidence, creating customer, contractual, or regulatory risk. | GV.PO, GV.OV | SOC 2; consumer protection; WCAG; PCI | Low | High | High | Trust Center disclaimers, claim-guard tests, control register | Mitigate: retain automated claim checks and require evidence/scope/date before any conformance or certification language. |

## Review discipline

1. New material connectors, auth providers, payment flows, AI features, or sensitive-data workflows must trigger a risk-register review.
2. A control marked `Implemented` in the control register does not automatically close a risk; operating effectiveness and scope still matter.
3. Closed risks should be retained with closure date, evidence, and rationale rather than deleted.
4. Risks requiring paid external validation remain open or monitored under the $0 constraint; internal mitigations should continue meanwhile.
5. Risk ratings must be revised when evidence changes rather than kept artificially stable for reporting purposes.

## Immediate priorities

The next no-cost treatment tranche is WR-001 through WR-004 because identity and authorization are foundational to every authenticated Watchdog workflow. WR-006, WR-008, WR-009, and WR-010 remain parallel high-value work for accessibility, privacy, vulnerability management, and recovery readiness.
