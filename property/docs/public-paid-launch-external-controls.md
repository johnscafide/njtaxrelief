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

NJW-42 is complete. The items below are the remaining external/manual controls before broad public paid enrollment.

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

Official New Jersey guidance is relevant in two directions:

- NJ Technical Bulletin TB-72 says ordinary SaaS is generally not subject to Sales Tax when customers receive remote access to software and no software is delivered.
- The same guidance says SaaS that is an **information service** is taxable.
- NJ's Information Services guidance specifically gives access to information such as **property values** and **marketing trends** as examples of taxable information services.

Sources:

- https://www.nj.gov/treasury/taxation/pdf/pubs/tb/tb72.pdf
- https://www.nj.gov/treasury/taxation/infoservices.shtml
- https://nj.gov/treasury/taxation/informationforvendors.shtml

Questions for the tax advisor/accountant:

1. Is Watchdog, or any paid Watchdog tier/feature, a taxable New Jersey information service?
2. If the product contains both software/workflow functionality and taxable information-service functionality, how should the transaction be characterized or apportioned?
3. What New Jersey registrations are required before collecting tax?
4. Does Watchdog currently have physical/economic nexus in any other jurisdiction requiring collection?
5. What Stripe product tax codes and registrations should be configured if tax collection is required?

Current production posture: automatic tax remains disabled and no Stripe Tax registration should be added until this determination is documented.

## 3. Business/entity and insurance

Before broad paid launch, document:

- the legal entity that contracts with subscribers
- how that entity is separated from brokerage/professional activity
- an E&O / technology professional liability quote appropriate for property-data / analytics SaaS
- whether cyber liability should be included or separate
- effective date and coverage limits if coverage is bound

This is not an engineering gate and must not be marked complete from code alone.

## 4. Stripe Customer Portal legal links

The Live Customer Portal should surface Watchdog's current legal pages:

- Terms: `https://www.watchdogindex.com/property/terms`
- Privacy: `https://www.watchdogindex.com/property/privacy`

Verify those links in the Live portal after saving the configuration. Do not change subscription behavior while doing this.

## 5. External uptime alert ownership

The production uptime workflow exists, but launch needs a named operational owner and a verified delivery path.

Document:

- primary alert owner
- backup owner if applicable
- delivery destination
- one successful test alert
- acknowledgement/escalation expectation

## 6. Final public cutover

Only after the external controls above are resolved or explicitly accepted by the owner:

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

**Public paid enrollment: CONTROLLED / NOT YET OPEN**

Reason: external legal, tax, entity/insurance, portal-link and alert-ownership controls remain outside engineering acceptance.
