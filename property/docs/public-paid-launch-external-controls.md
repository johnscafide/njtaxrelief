# Watchdog public paid launch: external controls

_Last updated: 2026-08-25_

## Current release posture

The controlled Stripe Live billing lifecycle is accepted in production. `live_billing_lifecycle` is `passed`, while Checkout remains intentionally `controlled` and public enrollment remains closed.

Accepted Live evidence includes:

- new Agent purchase
- signed entitlement promotion
- cancellation and reactivation
- full refund
- Agent -> Pro upgrade with paid proration
- Pro -> Agent downgrade with customer credit
- duplicate webhook idempotency
- out-of-order webhook handling
- signed `invoice.payment_failed` acceptance

NJW-42 is complete. Stripe Customer Portal legal links are user-confirmed configured. External uptime ownership is also closed: the scheduled GitHub monitor names `johnscafide` as owner, opens/updates a GitHub incident on failure, checks canonical WatchdogIndex.com first, and retains NJPropertyTaxRelief.com as an intentional coexistence check.

The four items below are the remaining external/manual controls before broad public paid enrollment.

## 1. Counsel review

Have counsel review the production versions of:

- `https://www.watchdogindex.com/property/terms`
- `https://www.watchdogindex.com/property/privacy`
- `https://www.watchdogindex.com/property/refunds`
- `https://www.watchdogindex.com/property/data-use`
- material product disclaimers and Data Methodology language
- public-source licensing, redistribution and derived-intelligence posture
- the relationship between Watchdog software and separately provided real-estate/tax/professional services

Questions to resolve explicitly:

1. Is the current operator/entity identification correct for a paid SaaS launch?
2. Should Watchdog operate through a separate LLC or other entity before public paid enrollment?
3. Are the liability limitation, indemnity, disclaimer and regulated-decision provisions appropriate for the actual product?
4. Are the current refund/cancellation terms appropriate for monthly and annual subscriptions?
5. Are privacy-request methods, retention language, analytics disclosures and service-provider disclosures sufficient?
6. Do any public-source or third-party datasets require additional attribution, contractual limits or redistribution restrictions?

Do not remove the Refund Policy's `subject to counsel review` status until this review is actually complete.

## 2. New Jersey sales-tax / Stripe Tax determination

Do not enable Stripe Tax merely to clear the launch checklist. First obtain a tax-advisor determination covering Watchdog's actual product mix.

The detailed adviser handoff is in `property/docs/public-paid-launch-tax-advisor-brief.md`.

Official New Jersey guidance is relevant in two directions:

- NJ Technical Bulletin TB-72 says ordinary SaaS is generally not subject to Sales Tax when customers receive remote access to software and no software is delivered.
- The same guidance says SaaS that is an **information service** is taxable.
- NJ's Information Services guidance specifically gives access to information such as **property values** and **marketing trends** as examples of taxable information services.

Sources:

- https://www.nj.gov/treasury/taxation/pdf/pubs/tb/tb72.pdf
- https://www.nj.gov/treasury/taxation/infoservices.shtml
- https://nj.gov/treasury/taxation/informationforvendors.shtml

Current production posture: automatic tax remains disabled and no Stripe Tax registration should be added until this determination is documented.

## 3. Business/entity separation

Ask counsel to document, at minimum:

1. The legal person/entity that should contract with Watchdog subscribers and appear in Terms, invoices, Stripe and tax registrations.
2. Whether a separate LLC or other entity should own/operate the Watchdog SaaS rather than having the product contract directly through an individual or brokerage/professional activity.
3. What agreements, bank/payment-account ownership, intellectual-property assignment, assumed-name/DBA filings, and intercompany/professional-service boundaries are needed to make that separation real rather than cosmetic.
4. Whether the current real-estate/tax-service references create any licensing, brokerage-supervision, conflict, advertising or disclosure obligations for the SaaS entity.
5. Whether the current limitation-of-liability and indemnity language is appropriate for the chosen entity structure.

Do not change the operator statement to a new entity until that entity actually exists and has authority to contract.

## 4. E&O / technology liability insurance

Request a quote for a property-data / analytics SaaS business. The quote request should expressly disclose that Watchdog:

- provides subscription property intelligence, monitoring, scores, estimates and reports;
- aggregates public/third-party property records and generates derived analytical outputs;
- serves real-estate and other professional users;
- does not provide a certified appraisal, legal opinion, underwriting decision or consumer report;
- uses hosted cloud infrastructure and third-party payment/authentication providers;
- may offer integrations/API capability to higher tiers.

Ask the broker/insurer to answer:

1. Does the policy cover technology E&O / professional liability claims arising from incorrect data, analytical outputs, reports, software errors or service failure?
2. Is cyber/privacy liability included or separate, and what are the breach-response and incident-response limits?
3. Are claims involving real-estate professionals, property valuation/analytics, tax-related information, public-record data, AI/automated analytical outputs, or API/integration failures excluded or restricted?
4. Are defense costs inside or outside the limit?
5. What retroactive date, deductible/retention, per-claim limit and aggregate limit apply?
6. Are contractual liability, IP/media liability, regulatory/privacy proceedings and business interruption covered or excluded?
7. Does the insurer require any changes to Terms, disclaimers, security controls or incident response before binding coverage?

Record the carrier, policy type, effective date, limits, retention and material exclusions before marking this control complete.

## Completed external-operating controls

### Stripe Customer Portal legal links

User-confirmed on 2026-08-25:

- Terms: `https://www.watchdogindex.com/property/terms`
- Privacy: `https://www.watchdogindex.com/property/privacy`

The Stripe connector became unavailable after the user saved the setting, so release evidence records this as **user-confirmed**, not independently tool-read-back.

### External uptime alert ownership

Passed on 2026-08-25.

- Primary owner: `johnscafide`
- Delivery path: GitHub issue in the Watchdog repository
- Schedule: every 15 minutes
- Failure behavior: open or update one production-availability incident and assign the owner
- Recovery behavior: comment with healthy run and close the incident
- Canonical surface checked first: `https://www.watchdogindex.com/property/`
- Intentional coexistence check: `https://njpropertytaxrelief.com/`
- Workflow: `.github/workflows/production-uptime-check.yml`

## Final public cutover

Only after the four remaining external controls above are resolved or explicitly accepted by the owner:

1. Confirm `live_billing_lifecycle = passed`.
2. Change Checkout release mode from `controlled` to `open`.
3. Keep Teams self-service enrollment closed.
4. Remove the temporary public Agent/Pro checkout guard.
5. Deploy from current main with fresh SHAs.
6. Smoke-test Free -> Agent and Free -> Pro public entry points without completing another unnecessary charge.
7. Verify Customer Portal, Terms, Privacy, Refund Policy and support links.
8. Confirm production monitoring and alert ownership.
9. Record the cutover timestamp and evidence in NJW-89 / NJW-271.

## Current decision

**Technical billing: PASSED**

**Portal legal links: USER-CONFIRMED**

**Uptime alert ownership: PASSED**

**Public paid enrollment: CONTROLLED / NOT YET OPEN**

Remaining reason: counsel review, entity/liability separation, E&O/technology liability insurance review, and tax-adviser determination/Stripe Tax configuration as applicable.
