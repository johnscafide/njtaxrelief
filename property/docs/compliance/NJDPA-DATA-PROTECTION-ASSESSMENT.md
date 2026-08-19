# Watchdog NJDPA Data Protection Assessment Baseline

**Baseline date:** 2026-08-19  
**Scope:** Watchdog consumer/profile processing under New Jersey's Data Privacy Act (P.L.2023, c.266).  
**Status:** Internal compliance-readiness assessment; not legal advice and not an external certification.

## Legal trigger used for this assessment

New Jersey requires a controller to conduct and document a data protection assessment for processing that presents a heightened risk of harm. The statute identifies heightened-risk processing to include processing sensitive data, sale of personal data, and certain targeted-advertising or profiling activities.

The assessment must weigh benefits of the processing against potential risks to consumer rights, taking safeguards, reasonable expectations, context and the controller-consumer relationship into account.

## Important data-classification correction

The NJDPA definition of **sensitive data** does not make every financial fact sensitive merely because it concerns money. Its financial-information category focuses on credentials/account information that, in combination with required access/security information, would permit access to a consumer financial account.

Accordingly:

- household income, mortgage balance/terms, escrow amount and a credit-range estimate are still **personal data** when linked to a user and deserve strong protection and minimization;
- they should not automatically be described as statutory NJDPA "sensitive data" solely because they are financial profile facts;
- Watchdog's stated product boundary remains that it does **not** request bank account numbers, card numbers, financial account passwords, security codes or government ID numbers.

This distinction should be reflected in the public privacy policy while preserving Watchdog's stronger voluntary protections for profile financial data.

## Processing operation assessed

**Operation:** optional account/profile data used to provide benefit eligibility context, property intelligence personalization, homeowner planning, saved-property workflows and user-requested professional follow-up.

### Data categories

- name/email/profile identity;
- claimed/saved property relationship;
- household size/dependents/filing information;
- birth year/age-related eligibility inputs;
- household income;
- mortgage balance/terms, escrow and insurance information;
- credit range;
- veteran/benefit status;
- prior appeal information;
- buying/selling plans and goals;
- public property-record data associated with saved/claimed properties;
- technical/security and consent records.

### Express purposes

- answer a user-requested eligibility/benefit/property question;
- personalize account-based property intelligence;
- maintain user-requested saved property/watchlist functionality;
- provide user-selected alerts;
- respond to an explicit request for real-estate/professional assistance;
- secure and operate the service;
- maintain legally/professionally required records where applicable.

## Benefit analysis

Benefits include more accurate eligibility guidance, less repetitive data entry, property monitoring over time, user-requested planning context and more relevant professional assistance.

## Risk analysis

| Risk | Potential harm | Existing/required safeguards | Residual posture |
|---|---|---|---|
| Unauthorized account access | Exposure of linked household/financial profile facts | Supabase authentication, RLS, entitlement/access tests, secure session handling | Requires continued privileged-access/session review. |
| Excessive collection | User provides information unnecessary for requested service | Optional fields, purpose statements, minimization review | Review every new profile field before release. |
| Secondary use beyond expectations | Data reused for unrelated marketing/profiling | Privacy notice, consent boundaries, no-sale policy, connector governance | Require new purpose/consent review before material reuse. |
| Connector disclosure | Personal data sent to provider unnecessarily | Connector register, least-privilege scopes, data-flow review | Complete Tier 1 provider reviews and contracts. |
| Analytics/session capture | Sensitive form content appears in telemetry | Telemetry minimization rules, masking expectations | Verify provider configuration and prohibit raw sensitive fields. |
| Automated decision overreach | Intelligence mistaken for legal/lending/housing decision | Informational positioning, human review for professional advice | Formalize AI/profiling prohibited-use policy as AI grows. |
| Data retained too long | Larger breach/privacy impact | Published retention intentions and deletion rights | Convert intentions into system-enforced retention evidence. |
| Property-person linkage | Public property data becomes person-level profile data inside account | Account-only linkage, no owner-name public search | Keep claimed-property associations private and access controlled. |

## Assessment decision

The current profile use cases provide a legitimate consumer-facing benefit and can continue **only with minimization, clear purpose, account-level access control, deletion/withdrawal mechanisms, connector review and no unexpected secondary use**.

Watchdog should voluntarily apply a DPA discipline to these profile workflows even where a particular field may not independently meet the statutory sensitive-data definition. A new assessment or addendum is required before materially changing purposes, adding significant profiling/AI, introducing sale/targeted advertising, collecting account-access credentials, or sending profile data to a new material provider.

## Required next no-cost actions

1. Correct the privacy-policy description of NJDPA sensitive financial information.
2. Build a field-level data inventory with purpose, optional/required status, retention and connector transfers.
3. Verify that consent withdrawal/deletion paths match actual application behavior.
4. Review analytics/session-recording configuration against the no-sensitive-field rule.
5. Add DPA addenda for AI profiling, marketing automation and any future voice/ISA processing before they are materially live.
6. Keep this assessment confidential in operational detail; the public Trust Center should summarize safeguards, not expose internal risk analysis.

## Official legal reference

P.L.2023, c.266, including C.56:8-166.4 and C.56:8-166.12: `https://pub.njleg.state.nj.us/Bills/2022/PL23/266_.HTM`
