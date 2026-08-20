# CRM Property Resolution Gold Set — 2026-08-19

**Status:** Production gold set established and expanded  
**Last verified:** 2026-08-20  
**Related:** NJW-229, NJW-245, NJW-228, NJW-227, NJW-52

## Production evidence

Watchdog now has a real human-reviewed CRM-to-property resolution sample from the native BoldTrail connector.

Current production state:

- **27 relationships are explicitly human verified**;
- all 27 originated from the deterministic candidate rule: exact normalized street address + exact five-digit ZIP + governed NJ parcel evidence;
- all 27 are tagged `human_verified_gold` after reconciling older review metadata;
- no verified relationship used contact-name matching, owner-name similarity, seller-intent inference or ownership inference;
- there are currently **0 human-rejected relationships**, so the 27/27 acceptance history must not be treated as universal precision proof.

The gold set is regression evidence and human-review evidence. It is not permission to silently auto-verify future address candidates.

## Primary gold rule

`exact_normalized_street_and_zip`

Requirements:

1. CRM address evidence must be explicitly allowlisted by the provider adapter.
2. State must be New Jersey.
3. A five-digit ZIP must be present.
4. Street text is normalized deterministically.
5. The governed NJ parcel query is narrowed by ZIP and street-number prefix.
6. Watchdog then requires exact normalized street equality and exact ZIP equality.
7. A unique parcel becomes a review candidate.
8. Contact/owner-name similarity is not used.
9. A match confirms a CRM workflow relationship only. It does not establish ownership, seller intent, distress or transaction intent.

## Missing-ZIP candidate rule

A second candidate-only rule is now implemented for a New Jersey CRM address that does not contain a usable ZIP:

`njogis_zip_enriched_exact_street_spatial_parcel`

The rule may create a review candidate only when all of the following are true:

1. The CRM address is New Jersey evidence from an allowlisted provider field.
2. The CRM record lacks a usable five-digit ZIP.
3. The official NJ Office of GIS geocoder returns a top candidate with score **95 or greater**.
4. The returned state is New Jersey.
5. The geocoder returns a five-digit ZIP.
6. The geocoder street address normalizes exactly to the original CRM normalized street.
7. The house-number prefix is unchanged.
8. The geocoder point intersects the governed NJ parcel layer.
9. The parcel `PROP_LOC` normalizes exactly to the CRM street.
10. The parcel ZIP equals the recovered ZIP.

Any failed dependency produces no relationship candidate. The rule never falls back to mailing-city equals municipality and never uses a person's name.

Unique enriched candidates use a lower evidence confidence than native exact-ZIP candidates and still require explicit human review.

## Missing-ZIP shadow acceptance

The rule was tested against the current human gold set by deliberately withholding ZIP evidence and asking the NJOGIS geocoder to recover it.

Latest 27-case shadow result:

- gold cases: **27**;
- geocoder-eligible cases: **25**;
- same governed parcel reproduced: **23**;
- safe fail-closed cases: **4**;
- wrong parcel candidates: **0**;
- reproduction rate: **85.19%**.

The four misses were not promoted to alternate parcels. Two did not produce a usable geocoder candidate, one geocoded point returned no parcel, and one intersected a parcel whose governed address failed the exact street/ZIP check. Those outcomes demonstrate the intended fail-closed behavior.

An earlier missing-ZIP cohort found 12 unique shadow candidates out of 22 unresolved records with zero ambiguous matches. Before those records were reprocessed in production, fresh BoldTrail contact detail supplied ZIPs, so the 12 live candidates ultimately used the existing exact-ZIP rule instead. Therefore the missing-ZIP branch has passed shadow acceptance but should **not** be described as having a completed live human-review acceptance yet.

## Automation gate

Production policy rows keep both address-derived rules candidate-only.

For the original exact-address method and the missing-ZIP enrichment method:

- auto verification: **disabled**;
- minimum human reviews before policy reconsideration: **50**;
- maximum acceptable false-positive rate for a future reviewed release: **1%**;
- reaching 50 reviews does not enable automatic verification;
- a later explicit engineering/security review is required before any policy change.

The lack of rejected examples is itself a reason to keep automation disabled. A useful future evaluation set needs both confirmed and rejected examples.

## Why the gold links matter

These links are the first real regression examples for CRM-aware Watchdog Intelligence. They can test whether future match logic continues to resolve the same properties without changing the user's verified relationship state.

The gold set must never be used as permission to:

- infer legal ownership;
- infer seller motivation;
- enrich protected-characteristic profiles;
- overwrite governed Watchdog property facts with CRM claims;
- silently relink a relationship after a provider rescan.

## Protection behavior

The background resolver skips existing non-candidate relationship rows. Verified and rejected relationships survive subsequent rescans rather than being deleted and regenerated.

The current resolver also writes future review outcomes as:

- `human_verified_gold` for human-verified address candidates;
- `human_rejected_gold` for rejected address candidates;
- `human_verified_manual` for manually validated PAMS relationships.

Future resolver versions must preserve these decisions and should be regression-tested against the human gold set before deployment.
