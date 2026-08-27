# Watchdog public paid launch tax-advisor brief

Status: **written external determination still required before broad public paid enrollment**

Prepared: 2026-08-25  
Reconciled: 2026-08-27

## Product facts to classify

Watchdog Property Intelligence is a web-based subscription product offered through WatchdogIndex.com. The operating entity is recorded as **Watchdog Property Intelligence LLC**, formed in New Jersey on 2026-08-25.

New paid subscriptions use Stripe. Current self-service plans are Agent ($59/month or $590/year), Pro ($129/month or $1,290/year), and Pro+ ($399/month or $3,990/year). Teams remains closed to self-service enrollment.

The product combines software/workflow functionality with property information and Watchdog-derived analysis. Depending on plan and property, customers may receive access to public/third-party property records, normalized property data, property values and assessment/tax information, market context, change monitoring, scores, signals, estimates, rankings, reports, historical observations, and professional workflow tools.

Watchdog does not transfer downloadable prewritten software to the customer. Customers access the service remotely through the web application.

## Registration and Stripe Tax facts already completed or scheduled

These are implementation/registration facts, not a legal conclusion about the taxability of the product:

- EIN notice received 2026-08-25; the EIN value is intentionally not stored in GitHub, Linear, or release evidence.
- NJ-REG completed 2026-08-25.
- New Jersey Sales Tax Certificate of Authority reported available 2026-08-25.
- New Jersey Stripe Tax registration is scheduled for the Certificate of Authority effective date **2026-09-16**.
- Subscription Checkout uses `automatic_tax.enabled=true` and requires billing-address collection.
- Production `create-checkout-session` is v48 as of the 2026-08-27 reconciliation and remains JWT-protected.
- Agent uses Stripe tax code `txcd_10701400` (Website Information Services - Business Use), tool-verified 2026-08-25.
- Pro and Pro+ use of the same code was user-confirmed 2026-08-25.
- Stripe Tax is intentionally not collecting New Jersey tax before 2026-09-16.
- The first controlled New Jersey tax calculation is intentionally pending until on or after 2026-09-16.

The adviser should not infer that the selected tax code is legally correct merely because it is configured. Please confirm or correct it in writing.

## Why a written tax determination is still needed

New Jersey Technical Bulletin TB-72 states that most SaaS is not subject to New Jersey Sales Tax when the customer receives remote access and software is not delivered, but it also states that SaaS meeting the definition of an information service is taxable.

New Jersey Publication ANJ-29 and the Division of Taxation's Information Services guidance describe taxable information services as furnishing information collected, compiled, or analyzed by the seller, and specifically identify paid access to information such as property values and marketing trends as examples where the true object is the information.

Watchdog has a mixed factual profile: it provides substantial workflow/software features, but it also compiles and analyzes property information. The launch team therefore needs an adviser to classify the actual plan bundles rather than relying on a generic “SaaS” label or on the current Stripe configuration.

Official sources checked for this handoff:

- New Jersey Division of Taxation, Information Services: https://www.nj.gov/treasury/taxation/infoservices.shtml
- Publication ANJ-29, Information Services & New Jersey Sales Tax: https://www.nj.gov/treasury/taxation/pdf/pubs/sales/anj29.pdf
- Technical Bulletin TB-72, Cloud Computing (SaaS, PaaS, IaaS): https://www.nj.gov/treasury/taxation/pdf/pubs/tb/tb72.pdf
- New Jersey Sales and Use Tax overview: https://www.nj.gov/treasury/taxation/businesses/salestax/

## Questions for the tax adviser

Please give a written determination, with reasoning, assumptions, and effective date, for each applicable item.

1. Are Watchdog Agent, Pro, and Pro+ subscriptions taxable New Jersey information services under the current feature mix and pricing model?
2. Does the substantial workflow/monitoring/software functionality change the “true object” analysis for any plan?
3. If taxability differs by plan or feature bundle, which plans or separately stated charges are taxable and which are not?
4. If a subscription contains both taxable information services and nontaxable software/workflow functionality, how should the bundled charge be treated?
5. What sourcing rule determines whether a customer receives the service in New Jersey?
6. Is the current New Jersey registration/effective-date setup consistent with the Certificate of Authority and the intended first taxable transaction date of 2026-09-16?
7. Is Stripe tax code `txcd_10701400` appropriate for Agent, Pro, and Pro+, or should the product tax treatment be changed?
8. Is `automatic_tax.enabled=true` with billing-address collection an appropriate implementation for the advised treatment?
9. Are there invoice, receipt, Terms, or checkout disclosures that should be added or changed because of the advised treatment?
10. Are there other states where current or near-term sales create a registration/collection obligation that should be configured before accepting customers there?

## Evidence requested back

Do not paste taxpayer IDs, EIN values, portal retrieval codes, or other sensitive registration identifiers into GitHub or Linear.

Record only:

- adviser/provider name or firm;
- determination date;
- effective date;
- a redacted or access-controlled evidence reference;
- plan-by-plan taxability conclusion;
- approved/corrected Stripe tax code or treatment;
- sourcing rule/assumptions;
- material caveats or re-review triggers.

## Launch rule

The existing NJ registration and Stripe Tax configuration may remain staged while public enrollment is controlled. They do **not** make the tax-classification control pass by themselves.

Before broad public paid enrollment:

1. retain a real written adviser determination for the current product facts;
2. make any configuration changes required by that determination;
3. on or after 2026-09-16, run one controlled New Jersey Stripe Tax calculation and retain non-sensitive evidence of the calculation and reconciliation;
4. keep public Checkout controlled until counsel, insurance/risk, tax, and explicit public-cutover controls are all satisfied.

A material change in Watchdog's feature mix, pricing/bundling, entity, customer geography, or sales model should trigger tax re-review.
