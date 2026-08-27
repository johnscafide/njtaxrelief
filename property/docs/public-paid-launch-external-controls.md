# Watchdog public paid launch: external controls

_Last reconciled: 2026-08-27_

## Current release posture

The controlled Stripe Live billing lifecycle is accepted in production. Supabase `platform_release_gates.live_billing_lifecycle` is `passed`, while subscription Checkout remains intentionally `controlled` and broad public paid enrollment remains closed.

Accepted Live billing evidence includes purchase, signed entitlement reconciliation, cancellation/reactivation, refund, upgrade/downgrade behavior, duplicate/out-of-order webhook handling, failed-payment recovery, and the bounded Agent trial canary. None of that engineering evidence satisfies the external legal, insurance, tax-classification, or public-cutover decisions below.

## Reconciled operator and registration facts

The launch packet previously described entity separation and New Jersey registration as wholly pending. That is stale.

The following milestones are recorded in NJW-89 and production release evidence as owner-confirmed operational facts:

- legal entity: **Watchdog Property Intelligence LLC**;
- formation state: New Jersey;
- formation date: 2026-08-25;
- EIN notice received on 2026-08-25; the EIN value is intentionally not stored in GitHub, Linear, or release evidence;
- NJ-REG completed on 2026-08-25;
- New Jersey Sales Tax Certificate of Authority reported available on 2026-08-25;
- production release evidence records `entity_structure_status=formed_ein_njreg_sales_tax_registered`.

**Control treatment:** the formation/registration milestone is recorded complete. This does **not** mean counsel has approved final operator language, contractual separation, banking/remittance ownership, IP ownership, brokerage boundaries, or the final public legal pages.

Current public-language review targets still include material operator drift:

- Terms currently describe the agreement as being with the “operator of Watchdog Property Intelligence” rather than naming the LLC.
- Privacy currently identifies John Scafide and Opus Elite Real Estate in its “Who we are” section.
- Refund Policy is still explicitly labeled `Commercial policy draft — subject to counsel review`.

Do not silently replace those statements based only on this packet. Counsel must resolve the correct final SaaS operator language and the relationship, if any, to separately provided licensed real-estate or tax/professional services.

## Reconciled New Jersey tax implementation facts

The earlier launch packet also described Stripe Tax setup as not yet enabled. That is stale.

Current production evidence records:

- New Jersey Stripe Tax registration scheduled for the Certificate of Authority effective date **2026-09-16**;
- subscription Checkout uses `automatic_tax.enabled=true` and requires billing-address collection;
- production `create-checkout-session` is currently v48 and remains JWT-protected;
- Agent product tax code `txcd_10701400` was tool-verified in Stripe on 2026-08-25;
- Pro and Pro+ use of the same tax code was user-confirmed on 2026-08-25;
- Stripe Tax is intentionally not collecting New Jersey tax before 2026-09-16;
- the first controlled New Jersey tax calculation remains pending until on or after 2026-09-16.

**Control treatment:** registration/configuration is recorded complete, but it is not a written tax-adviser determination that Watchdog's exact plan mix is taxable as configured. The legal taxability/classification determination remains pending unless a real adviser determination is attached or referenced.

See `property/docs/public-paid-launch-tax-advisor-brief.md` for the narrowed adviser handoff.

## Remaining blocking controls

### 1. Counsel review and final operator language — PENDING

Counsel must review the production versions of:

- `https://www.watchdogindex.com/property/terms/`
- `https://www.watchdogindex.com/property/privacy/`
- `https://www.watchdogindex.com/property/refunds/`
- `https://www.watchdogindex.com/property/data-use/`
- material product disclaimers and Data Methodology language;
- public-source licensing, redistribution, and derived-intelligence posture;
- the relationship between Watchdog software and separately provided licensed/professional services.

Minimum evidence before this control can pass:

- reviewer or firm;
- review date;
- written evidence reference outside public source control when privileged or confidential;
- clear disposition: approved, approved with specified changes, or not approved;
- explicit answer on final LLC operator language and brokerage/professional-service separation.

Use `property/docs/public-paid-launch-counsel-insurance-checklist.md` as the intake packet. The packet itself is not approval evidence.

### 2. E&O / technology liability / cyber insurance decision — PENDING

The owner explicitly deferred this as a pre-public-launch task on 2026-08-25. The intended named insured is Watchdog Property Intelligence LLC.

A completion record must show either:

- bound coverage with carrier, coverage type, effective date, limits/retention, and material exclusions summarized with a redacted evidence reference; **or**
- an explicit owner decision to launch uninsured/partially insured, with the accepted risk written down and any counsel/broker guidance referenced.

Do not mark this control passed merely because a quote was requested.

### 3. Written NJ sales-tax classification — PENDING

Official New Jersey guidance distinguishes ordinary SaaS from taxable information services. It specifically describes paid access to information such as property values and marketing trends as an information-service example, while TB-72 also says most SaaS is not taxable unless it meets the information-service definition.

Current setup already prepares Watchdog to collect tax in New Jersey beginning 2026-09-16. That technical setup is not a substitute for a written classification of the actual Agent, Pro, and Pro+ product mix.

Required evidence:

- adviser/provider identity;
- determination date and effective date;
- written evidence reference;
- plan-by-plan or transaction-level taxability conclusion;
- confirmation or correction of the selected Stripe Tax product code/treatment;
- sourcing assumptions and any material multi-state caveat.

Official references used for the handoff:

- https://www.nj.gov/treasury/taxation/infoservices.shtml
- https://www.nj.gov/treasury/taxation/pdf/pubs/sales/anj29.pdf
- https://www.nj.gov/treasury/taxation/pdf/pubs/tb/tb72.pdf
- https://www.nj.gov/treasury/taxation/businesses/salestax/

### 4. First controlled NJ Stripe Tax calculation — PENDING / DATE-BOUND

Do not run or claim this acceptance before 2026-09-16.

On or after that date, use a controlled account and verify a New Jersey Checkout calculation without opening public enrollment. Record the Stripe mode, plan/cadence, taxable address state, tax calculation outcome, session/invoice evidence reference, and cleanup/reconciliation result. Avoid copying payment credentials or sensitive registration identifiers into GitHub/Linear.

### 5. Explicit public cutover decision — NO-GO

Broad public paid enrollment remains unauthorized. An explicit owner decision is required **after** the blocking controls above are satisfied or, where the acceptance criteria permit it, a specific residual risk is expressly accepted and evidenced.

The current machine-readable posture is tracked in `property/docs/public-paid-launch-cutover-state.json` and validated by `scripts/verify_public_paid_launch_counsel_insurance_checklist_contract.js`.

## Completed external-operating controls

### Entity formation and NJ registration milestone

Recorded complete on 2026-08-25 as described above. Sensitive EIN and registration identifiers are intentionally not persisted in GitHub/Linear.

### Stripe Customer Portal legal links

User-confirmed on 2026-08-25:

- Terms: `https://www.watchdogindex.com/property/terms`
- Privacy: `https://www.watchdogindex.com/property/privacy`

The release evidence accurately labels this **user-confirmed**, not connector-read-back.

### External uptime alert ownership

Passed on 2026-08-25.

- primary owner: `johnscafide`;
- delivery path: GitHub incident issue;
- schedule: every 15 minutes;
- canonical surface checked first: `https://www.watchdogindex.com/property/`;
- intentional coexistence check: `https://njpropertytaxrelief.com/`.

## Final public cutover sequence

Only after the preflight reports no blockers:

1. Confirm `live_billing_lifecycle = passed` in production.
2. Confirm the entity/registration milestone is still recorded complete.
3. Attach/reference real counsel disposition evidence.
4. Attach/reference real insurance or accepted-risk evidence.
5. Attach/reference a written NJ tax classification.
6. On or after 2026-09-16, pass the controlled NJ Stripe Tax calculation and persist a non-sensitive evidence reference.
7. Record the explicit owner public-cutover decision.
8. Re-fetch current `main` and the production release-gate state.
9. Change subscription Checkout release mode from `controlled` to `open` only after all prior steps are true.
10. Keep Teams self-service enrollment closed unless separately approved.
11. Smoke-test public Free -> Agent and Free -> Pro entry points without creating an unnecessary second charge.
12. Verify Customer Portal, Terms, Privacy, Refund Policy, support links, monitoring, and incident ownership.
13. Record the cutover timestamp and evidence in NJW-89.

## Current decision

| Control | Current state |
| --- | --- |
| Technical Stripe Live billing | PASS |
| Entity formation / EIN / NJ-REG / Sales Tax registration milestone | RECORDED COMPLETE |
| Stripe Tax subscription-checkout configuration | RECORDED COMPLETE |
| Counsel / final LLC operator language | PENDING |
| E&O / technology liability / cyber decision | PENDING |
| Written NJ sales-tax classification | PENDING |
| First controlled NJ tax calculation | PENDING until 2026-09-16 |
| Explicit public cutover | NO-GO |
| Public paid enrollment | CONTROLLED / NOT OPEN |
