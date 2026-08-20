# CRM Property Resolution Gold Set — 2026-08-19

**Status:** Production gold set established and expanded  
**Last verified:** 2026-08-20  
**Related:** NJW-229, NJW-245, NJW-228, NJW-227, NJW-52

## Production evidence

Watchdog now has a real human-reviewed CRM-to-property resolution sample from the native BoldTrail connector.

Current production state:

- **105 relationships are explicitly human verified**;
- all 105 originated from the deterministic candidate rule: exact normalized street address + exact five-digit ZIP + governed NJ parcel evidence;
- all 105 are tagged `human_verified_gold` in relationship evidence;
- no verified relationship used contact-name matching, owner-name similarity, seller-intent inference or ownership inference;
- there are currently **0 human-rejected relationships**, so the all-positive review history must not be treated as universal precision proof.

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

A second candidate-only rule is implemented for a New Jersey CRM address that does not contain a usable ZIP:

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

Unique enriched candidates use a lower evidence confidence than native exact-ZIP candidates and still require explicit human review. Auto verification remains disabled.

## Missing-ZIP shadow acceptance

### Historical candidate-production evidence

An earlier missing-ZIP cohort found **12 unique deterministic shadow candidates out of 22 unresolved records**, with **0 ambiguous matches**. Before those records were reprocessed in production, fresh BoldTrail contact-detail data supplied ZIPs. The controlled production rerun therefore used the stronger existing exact-ZIP route for those records rather than the enrichment route. This proves the enrichment path can recover additional deterministic candidates, but it is not a claim that a live human-reviewed relationship was created by the enrichment route itself.

### Full-current-gold closeout regression — 2026-08-20

The enrichment rule was rerun against **all 105 current human-verified gold relationships** by deliberately withholding ZIP evidence and asking NJOGIS to recover it.

Results at closeout:

- gold cases queued: **105**;
- geocoder eligible: **85**;
- same governed parcel reproduced: **76**;
- wrong unique parcel candidates among completed parcel responses: **0**;
- ambiguous exact parcel candidates among completed parcel responses: **0**;
- completed parcel responses with no exact parcel: **7**;
- remaining non-eligible cases failed at geocoder/ZIP/street gates rather than being mapped to an alternate parcel;
- two parcel HTTP responses remained unavailable at the observation point and were not counted as successful or alternate matches.

The lower reproduction rate is acceptable for this candidate-only enrichment path because the safety objective is fail-closed behavior, not maximum recall. No completed gold case produced a wrong unique parcel.

The live missing-ZIP cohort at this closeout snapshot contained only 10 unresolved records. Five passed the geocoder gate, none produced a unique exact parcel, and none were ambiguous. They therefore correctly remained unresolved.

## Automation gate

Production policy rows keep both address-derived rules candidate-only.

For the original exact-address method and the missing-ZIP enrichment method:

- auto verification: **disabled**;
- minimum human reviews before policy reconsideration: **50**;
- maximum acceptable false-positive rate for a future reviewed release: **1%**;
- reaching the review threshold does not enable automatic verification;
- a later explicit engineering/security review is required before any policy change.

The lack of rejected examples is itself a reason to keep automation disabled. A useful future evaluation set needs both confirmed and rejected examples.

## Why the gold links matter

These links are regression examples for CRM-aware Watchdog Intelligence. They test whether future match logic continues to resolve the same properties without changing the user's verified relationship state.

The gold set must never be used as permission to:

- infer legal ownership;
- infer seller motivation;
- enrich protected-characteristic profiles;
- overwrite governed Watchdog property facts with CRM claims;
- silently relink a relationship after a provider rescan.

## Protection behavior

The background resolver skips existing non-candidate relationship rows. Verified and rejected relationships survive subsequent rescans rather than being deleted and regenerated.

The current resolver writes future review outcomes as:

- `human_verified_gold` for human-verified address candidates;
- `human_rejected_gold` for rejected address candidates;
- `human_verified_manual` for manually validated PAMS relationships.

Future resolver versions must preserve these decisions and should be regression-tested against the human gold set before deployment.
