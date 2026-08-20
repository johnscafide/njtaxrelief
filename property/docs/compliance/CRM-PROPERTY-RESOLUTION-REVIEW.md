# Verified CRM-to-Property Resolution Review

**Status:** Production Phase 6 live; deterministic review workflow accepted; missing-ZIP enrichment remains candidate-only  
**Review date:** 2026-08-20  
**Related issues:** NJW-229, NJW-245, NJW-228, NJW-227, NJW-52

## Purpose

Phase 6 turns normalized customer CRM relationship context into defensible Watchdog property relationships without using contact-name similarity as proof of ownership or property association.

The relationship graph improves CRM-aware Watchdog Intelligence while preserving a strict distinction between customer-controlled CRM context and governed Watchdog property facts.

## Evidence policy

Relationship evidence is evaluated in this order:

1. **Explicit provider/PAMS property reference.** A structured Watchdog/PAMS property identifier can establish a verified workflow relationship.
2. **Exact address candidate.** An allowlisted CRM address with a five-digit ZIP may become a review candidate when normalized street and ZIP exactly match governed NJ parcel evidence.
3. **Missing-ZIP enriched candidate.** For New Jersey address evidence missing ZIP, Watchdog may use the official NJ Office of GIS geocoder to recover ZIP. It still requires score >=95, unchanged normalized street/house number, parcel point intersection, exact parcel street and recovered ZIP before creating a review candidate.
4. **User verification or rejection.** A signed-in eligible user explicitly confirms or rejects address-derived candidates.
5. **Manual PAMS verification.** A manually entered PAMS relationship must validate against the governed parcel service before it can be stored as verified.

Address-derived evidence is candidate-only. Watchdog does not use fuzzy contact/owner name similarity to create a CRM-to-property relationship.

## Ownership and seller-intent boundary

A verified CRM-to-property relationship means that the CRM record is confirmed to relate to the governed property for Watchdog workflow purposes. It does **not** by itself mean:

- the CRM contact is the legal owner;
- the CRM contact is a seller;
- the CRM contact intends to transact;
- the CRM contact is distressed or motivated;
- Watchdog has replaced or modified the governed property ownership record.

Ownership and property facts remain governed separately by Watchdog source lineage.

## BoldTrail evidence enrichment

The Phase 4 bulk contact-list endpoint does not provide enough property-address evidence for reliable relationship resolution. Phase 6 uses the individual BoldTrail/kvCORE contact-detail endpoint server-side with the existing Vault-held provider credential.

The current resolver considers only:

- BoldTrail primary address;
- BoldTrail property-of-interest address.

The provider credential never enters browser-visible resolver state, and the resolver does not retain the raw provider contact-detail response.

## Primary parcel-match contract

The primary candidate rule is `exact_normalized_street_and_zip`.

It requires:

- New Jersey address evidence;
- a five-digit ZIP;
- exact normalized street-address equality;
- exact ZIP equality;
- governed NJ parcel/PAMS evidence.

Common street suffixes and cardinal directions are normalized before comparison. Unit identifiers remain part of the normalized address. A unique match may create a candidate; ambiguous results stay unresolved. No address candidate is verified automatically.

## Missing-ZIP contract

The second rule is `njogis_zip_enriched_exact_street_spatial_parcel`.

It is used only when an allowlisted NJ CRM address lacks a usable ZIP. The rule requires:

- official NJOGIS geocoder score >=95;
- returned state New Jersey;
- recovered five-digit ZIP;
- exact normalized geocoder street == original CRM street;
- unchanged house-number prefix;
- geocoded point intersection against the governed NJ parcel layer;
- exact normalized parcel `PROP_LOC` == CRM street;
- parcel ZIP == recovered ZIP.

If any requirement fails, Watchdog creates no relationship candidate. Mailing city is not treated as municipality. Names, phone, email, protected characteristics, owner similarity, seller intent and distress signals are not used for resolution.

A unique missing-ZIP candidate is stored at lower confidence than a native exact-ZIP candidate and still requires human confirmation.

## Production human evidence

Current human-reviewed production state:

- **27 verified address relationships**;
- **27/27 are tagged `human_verified_gold`** after reconciling older review metadata;
- all 27 came from the deterministic exact normalized street + ZIP workflow;
- **0 human rejections** currently exist.

The absence of negative examples means the 27 accepted relationships cannot be treated as proof of universal precision. Auto-verification remains disabled.

## Missing-ZIP shadow acceptance

The missing-ZIP rule was backtested by deliberately withholding ZIP evidence from the verified gold addresses.

Latest 27-case result:

- 27 gold cases tested;
- 25 passed the geocoder gate;
- 23 reproduced the same governed PAMS parcel;
- 4 failed closed;
- 0 produced a wrong candidate parcel;
- 85.19% reproduction rate.

The four misses remained unresolved rather than being redirected to a weaker match. That fail-closed behavior is required.

An earlier unresolved cohort produced 12 unique shadow candidates out of 22 missing-ZIP records with zero ambiguous results. During the controlled production rerun, fresh BoldTrail contact detail supplied ZIPs for those records, so they followed the existing exact-ZIP route instead. The new missing-ZIP branch therefore has shadow acceptance but does not yet have a completed live human-review acceptance example.

## Gold-set decision tracking

Future resolver decisions are retained as evidence:

- human-verified address candidate -> `human_verified_gold`;
- human-rejected address candidate -> `human_rejected_gold`;
- manually validated PAMS relationship -> `human_verified_manual`.

Verified and rejected rows are protected from background candidate cleanup and rescans.

## Automation gate

`integration_crm_match_policy` keeps both address-derived rules in human-confirmed mode.

For the missing-ZIP rule:

- `auto_verify_enabled = false`;
- minimum human-reviewed examples before reconsideration = 50;
- target maximum false-positive rate for a future reviewed release = 1%;
- reaching 50 reviews does not change the policy automatically.

A later explicit engineering and security review is required before any auto-verification policy could be enabled.

## Resolution state and background processing

`integration_crm_resolution_state` is the server-only work-state table. Supported states include:

- pending;
- enriched;
- no_address;
- non_nj;
- no_match;
- candidate;
- ambiguous;
- error.

The worker processes small batches, runs automatically every five minutes, and uses delayed retry state for provider/network failures. Provider errors are never treated as a match or permanent negative conclusion.

## User review workflow

The Integration Center Phase 6 module displays:

- records assessed;
- candidates requiring review;
- verified relationships;
- unresolved records;
- CRM evidence source;
- CRM address and governed parcel side by side;
- PAMS identifier and municipality;
- evidence confidence;
- exact match method;
- NJOGIS ZIP-recovery evidence and geocoder score when applicable;
- explicit no-name-match notice;
- Verify Relationship and Reject actions.

The page states that verification confirms a Watchdog workflow relationship and does not declare legal ownership.

## Security controls

- service-only resolver state and shadow tables have RLS enabled;
- `anon` and `authenticated` have no direct privileges on the shadow harness;
- operator shadow functions are revoked from `public`, `anon` and `authenticated`;
- `integration-crm-resolver` requires a valid Watchdog JWT and rechecks effective plan server-side;
- `integration-crm-resolution-worker` requires the dedicated Vault-backed internal worker token;
- provider credentials remain in Supabase Vault;
- CRM relationship evidence does not require the external prose model.

Project-wide pre-existing Supabase Security Advisor warnings are tracked separately and must not be confused with Phase 6 acceptance.

## Remaining Phase 6 acceptance

The deterministic relationship workflow itself is live and has real human-reviewed evidence. The remaining focused acceptance item is the new missing-ZIP branch:

1. wait for a real provider record that is still missing ZIP at worker execution time;
2. confirm it creates `enriched_zip_exact_candidate` only after all NJOGIS + parcel gates pass;
3. review it in the Integration Center;
4. confirm a verify/reject decision is retained as gold evidence;
5. keep auto-verification disabled until a future mixed positive/negative evaluation supports a policy review.
