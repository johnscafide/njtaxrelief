# Watchdog Personal Data Inventory and Minimization Baseline — 2026-08-20

**Budget:** $0 internal readiness  
**Scope:** Watchdog `/property/` first-party account/onboarding profile processing evidenced in repository source.  
**Frameworks:** NJDPA; SOC 2 Privacy/Confidentiality; NIST CSF Govern/Identify/Protect; ISO/IEC 27701 readiness.  
**Assurance:** Internal evidence only. This document is not legal certification or independent assurance.

## Purpose

Create a field-level inventory for the required onboarding profile so collection, purpose, optionality, personalization, retention, access, and future connector transfers can be reviewed deliberately instead of inferred from UI copy.

## Source evidence reviewed

- `supabase/migrations/20260819150000_required_watchdog_onboarding_v1.sql`
- `property/js/onboarding.js`
- `property/onboarding/index.html`
- `property/privacy/index.html`

## Field inventory

| Field/group | Classification | Product purpose | Required? | Personalization use | Current storage/control evidence | Minimization / transfer rule |
|---|---|---|---|---|---|---|
| `user_id` | Account identifier | Associate profile with authenticated account | System-required | No | FK to `auth.users`; own-row RLS | Never expose as marketing identifier unnecessarily |
| `persona` | Self-reported profile | Configure homeowner/renter/professional experience | Required to complete onboarding | Yes | Enum validation; own-row RLS | Use for product context, not protected-trait inference |
| `primary_profession` | Self-reported professional info | Configure professional tools/context | Conditional | Yes | Allow-list validation | Share externally only for an explicit integration purpose |
| `home_status` | Self-reported housing context | Product relevance | Optional | Yes | Enum validation | Do not use to infer protected traits |
| `age_band` | Demographic range | User-provided product research/context | Optional, includes `prefer_not` | Must be tightly limited | Enum validation; table comment prohibits housing audience targeting | Do not use for housing targeting, eligibility, source-fact alteration, or protected-trait inference; reassess whether continued collection is necessary |
| `household_income_band` | Financial/profile data | User-provided product research/context | Optional, includes `prefer_not` | Must be tightly limited | Enum validation; own-row RLS | Treat as elevated privacy data even when not statutory sensitive-account credentials; no housing targeting/eligibility use |
| `household_size` | Household profile | Product context | Optional | Limited | Range 1–20 | No protected-trait inference; collect only if product value remains demonstrable |
| `location_zip` | Approximate location | Localize Watchdog experience/markets | Optional | Yes | Five-digit validation | Do not treat as precise location; avoid unnecessary onward transfer |
| `markets` | User interests | Configure market coverage | Optional | Yes | Max 20 values; each truncated | Transfer only to integrations needed for user-requested workflow |
| `goals` | User interests/intents | Personalize product priorities | Optional | Yes | Max 20 values | Do not convert into unsupported factual assertions |
| `property_types` | User interests | Personalize property workflow | Optional | Yes | Max 20 values | Same-purpose use only |
| `time_horizon` | User intent | Personalize timing/relevance | Optional | Yes | Enum validation | Treat as user context, not authoritative property fact |
| `professional_years_band` | Professional profile | Tailor professional experience | Optional/conditional | Yes | Enum validation | No external transfer without integration purpose |
| `professional_volume_band` | Professional profile | Tailor professional experience | Optional/conditional | Yes | Enum validation | No external transfer without integration purpose |
| `professional_priorities` | User interests | Tailor professional experience | Optional | Yes | Max 20 values | Same-purpose use only |
| `intelligence_personalization` | Privacy/preference control | Permit approved onboarding context to personalize user's own Intelligence experience | Preference | Governs use | Boolean; database comment says it never alters source facts | `false` must be respected by downstream Intelligence consumers |
| `responses` | Versioned survey snapshot | Preserve user-confirmed onboarding context | System-generated copy of submitted profile | Potentially | JSON object; 32 KB cap; tagged `user_confirmed` | Do not add free-form secrets or unrelated personal data; avoid duplicating fields beyond justified compatibility/evidence need |
| timestamps/status/version | Operational metadata | Workflow state/auditability | System-required | No | Server timestamps/status | Retain only as operationally necessary |

## Controls confirmed from schema

1. Anonymous access is revoked.
2. Authenticated users receive SELECT only on their own onboarding row through RLS.
3. Direct authenticated insert/update/delete is revoked; completion is mediated by a server-side database function with validation.
4. Payload size and array cardinality are bounded.
5. Demographic/profile values use allow-lists or bounded ranges rather than unrestricted values.
6. Database documentation explicitly prohibits using demographic answers to infer owner traits or as housing audience-targeting criteria.
7. Intelligence personalization is documented as context-only and cannot alter source facts.

## Privacy/minimization findings

### PDI-01 — Demographic fields require continuing necessity review
`age_band`, `household_income_band`, and `household_size` are optional and can improve context, but they create more privacy risk than ordinary product-preference fields. Keep `prefer_not` where applicable, prohibit housing-targeting/eligibility use, and periodically verify that each field still delivers a concrete user benefit. If not, stop collecting it.

### PDI-02 — `responses` intentionally duplicates submitted context
The JSON snapshot supports versioning/evidence but duplicates structured fields. This increases deletion/retention surface. Any account deletion or profile-erasure path must cover both structured columns and `responses`; future onboarding versions should avoid adding unrelated free-form data.

### PDI-03 — Personalization preference needs downstream verification
The schema defines `intelligence_personalization`, but repository-level proof is still needed that every Intelligence consumer honors `false`. Until verified, the control remains Partial.

### PDI-04 — Retention schedule remains incomplete
The schema provides cascade deletion when the auth user is deleted, but a documented retention schedule for abandoned/pending profiles, completed profiles, and any downstream copies remains to be established and verified.

### PDI-05 — Connector transfer inventory must reference fields, not vague categories
Future CRM, Zapier, AI, email, marketing, voice, or other connectors must explicitly list which of these fields leave Watchdog, why, and under what retention/deletion terms. Default is no transfer unless required for the user-requested integration or documented product purpose.

## No-cost treatment plan

1. Verify all consumers of `intelligence_personalization` and add a contract preventing personalized Intelligence use when false.
2. Trace account deletion/profile deletion across structured onboarding fields and `responses`.
3. Define provisional retention periods by data class and workflow state.
4. Add this field inventory to every material connector privacy review.
5. Reassess demographic-field necessity before expanding onboarding questions.
6. Keep exact financial-account credentials, payment-card data, government identifiers, precise geolocation, and unrelated sensitive free text out of onboarding.

## Residual risk

This inventory is source-grounded but does not prove every production data copy, analytics event, log, backup, or third-party transfer. Production data-flow verification remains necessary before the privacy control can be considered fully implemented.