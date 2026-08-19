# Watchdog Seven-Track Compliance Readiness Sprint — 2026-08-19

**Budget constraint:** $0  
**Assurance status:** Internal readiness only; no new certification or third-party assurance claim is created by this sprint.

## 1. OWASP ASVS 5.0.0 Level 2

- **Action completed:** Established a version-pinned ASVS 5.0.0 Level 2 readiness baseline, evidence map, priority verification queue and requirement-record template.
- **Framework/control area:** OWASP ASVS; SOC 2 Security; NIST Protect.
- **Evidence:** `property/docs/compliance/ASVS-5-L2-BASELINE.md`, existing `property/tests/security-contracts.mjs` and access-boundary tests.
- **Rationale:** Watchdog needs requirement-level security evidence before any strong ASVS alignment/conformance language is defensible.
- **Residual risk:** Full Level 2 applicability and verification across the complete requirement set is not yet complete.
- **Next no-cost step:** Start authentication/session/authorization/OAuth requirement-by-requirement mapping.

## 2. NIST CSF 2.0

- **Action completed:** Created Watchdog Current and Target Profiles across Govern, Identify, Protect, Detect, Respond and Recover, including priority gaps and initial risk themes.
- **Framework/control area:** NIST CSF 2.0; SOC 2; ISO 27001 readiness.
- **Evidence:** `property/docs/compliance/NIST-CSF-2-PROFILE.md`.
- **Rationale:** A Current/Target comparison prevents compliance work from becoming a disconnected checklist and creates a repeatable risk-management view.
- **Residual risk:** The profile is currently program-level and still needs deeper Category/Subcategory mappings and named control owners.
- **Next no-cost step:** Add a formal risk register and map the highest-risk workflows to CSF Categories/Subcategories.

## 3. WCAG 2.2 AA

- **Action completed:** Established a WCAG 2.2 AA conformance baseline, representative journey inventory, manual test protocol and automated evidence plan. Added an axe-core/Playwright public accessibility baseline that retains findings as CI artifacts.
- **Framework/control area:** WCAG 2.2 Level AA; product accessibility.
- **Evidence:** `property/docs/compliance/WCAG-2.2-AA-BASELINE.md`, `property/tests/public-accessibility-baseline.mjs`, `.github/workflows/zero-cost-compliance-readiness.yml`.
- **Rationale:** Automated scans alone cannot establish conformance, but repeatable automated evidence catches regressions and creates a defect baseline while manual testing is built out.
- **Residual risk:** Authenticated flows and manual keyboard/screen-reader testing are not yet complete; site-wide conformance must not be claimed.
- **Next no-cost step:** Expand the staging scan to Dashboard/Home/Account and record manual keyboard/focus evidence.

## 4. HTTPS / TLS / external grade readiness

- **Action completed:** Documented the TLS/HSTS evidence standard and added a repeatable production script that records HTTPS redirect behavior, certificate validity, negotiated protocol, HSTS and browser security headers.
- **Framework/control area:** OWASP ASVS Secure Communication; NIST Protect; SOC 2 Security.
- **Evidence:** `property/docs/compliance/TLS-SECURITY-BASELINE.md`, `property/scripts/tls_readiness_check.mjs`, `.github/workflows/zero-cost-compliance-readiness.yml`, `vercel.json`.
- **Rationale:** A public grade is point-in-time evidence; the underlying configuration should be measured continuously and independently of a badge.
- **Residual risk:** No current SSL Labs A+ result is claimed or retained yet, and production evidence may reveal configuration items requiring remediation.
- **Next no-cost step:** Review generated production evidence and capture a dated free SSL Labs result for the canonical domain when available.

## 5. PCI DSS / SAQ readiness

- **Action completed:** Documented current payment architecture and cardholder-data boundary. The observed subscription flow creates a server-side Stripe Checkout Session and redirects to provider-hosted checkout; SAQ A is treated only as a likely candidate pending complete eligibility review.
- **Framework/control area:** PCI DSS; SOC 2 Processing Integrity/Security; OWASP ASVS.
- **Evidence:** `property/docs/compliance/PCI-SCOPE-MEMO.md`, `supabase/functions/create-checkout-session/index.ts`, `property/tests/security-contracts.mjs`.
- **Rationale:** Keeping card entry outside Watchdog materially reduces technical exposure and future PCI scope.
- **Residual risk:** Final SAQ selection and required ASV scanning are external validation dependencies; payment architecture changes can alter scope.
- **Next no-cost step:** Search schemas/logging/support paths for prohibited card-data collection and inventory all payment entry points.

## 6. New Jersey Data Privacy Act

- **Action completed:** Created a data-protection assessment baseline for Watchdog profile processing and corrected the internal legal classification: ordinary income/mortgage/profile financial facts are personal data but are not automatically the NJDPA's sensitive financial credential category.
- **Framework/control area:** NJDPA; SOC 2 Privacy; ISO 27701 readiness.
- **Evidence:** `property/docs/compliance/NJDPA-DATA-PROTECTION-ASSESSMENT.md`, `property/privacy/index.html` as policy reconciliation target.
- **Rationale:** Correct statutory classification matters; stronger voluntary safeguards can be kept without inaccurately describing the law.
- **Residual risk:** The public privacy policy still requires wording reconciliation to remove the overbroad sensitive-data statement and should be reviewed carefully as a whole rather than patched blindly.
- **Next no-cost step:** Reconcile the public policy against the DPA, then create field-level purpose/retention/transfer inventory.

## 7. Public Security & Trust Center

- **Action completed:** Published `/property/trust/` with factual statements about access controls, hosted payments, privacy, secure development, accessibility target, incident readiness and framework use.
- **Framework/control area:** Security assurance communications; consumer transparency; certification-claim governance.
- **Evidence:** `property/trust/index.html`, `property/tests/seven-readiness-contracts.mjs`.
- **Rationale:** Customers need understandable security information without exposing internal evidence or implying certifications that do not exist.
- **Residual risk:** The page should be periodically reconciled with the live product and linked from the shared public footer/navigation once that change can be safely propagated across the site.
- **Next no-cost step:** Add Trust Center links to shared public legal/footer surfaces and keep claims covered by automated contracts.

## Automated claim/evidence guard added

`property/tests/seven-readiness-contracts.mjs` now verifies that all seven tracks remain present and that the Trust Center does not silently change into unsupported certification claims.

## External dependencies intentionally deferred under $0 budget

- independent SOC/ISO assessments;
- independent penetration test;
- PCI Approved Scanning Vendor validation;
- paid/manual accessibility audit;
- other paid certification platforms or consultants.

These do not stop Watchdog from building the controls and operating evidence needed before external validation becomes affordable.
