# CRM Property Resolution Gold Set — 2026-08-19

**Status:** Production gold set established  
**Related:** NJW-229, NJW-228, NJW-227, NJW-52

## Production evidence

Watchdog now has a real human-reviewed CRM-to-property resolution sample from the native BoldTrail connector.

At the time this gold set was established:

- 17 relationships were explicitly verified by the user;
- all 17 originated from the same deterministic candidate rule: exact normalized street address + exact five-digit ZIP + one governed NJ parcel candidate;
- 15 verified relationships used `boldtrail.primary_address` evidence;
- 2 verified relationships used `boldtrail.poi_address` evidence;
- no verified relationship used contact-name matching or ownership inference;
- 7 additional unique exact-address matches remained candidates for human review;
- verified rows were tagged `human_verified_gold`;
- remaining unique exact candidates were tagged `high_confidence_recommended`.

This is useful product evidence, but it is not enough to enable silent automatic verification.

## Gold rule

`exact_normalized_street_and_zip_unique`

Requirements:

1. CRM address evidence must be explicitly allowlisted by the provider adapter.
2. State must be New Jersey.
3. A five-digit ZIP must be present.
4. Street text is normalized deterministically.
5. The governed NJ parcel query is narrowed by ZIP and street-number prefix.
6. Watchdog then requires exact normalized street equality and exact ZIP equality.
7. Exactly one governed parcel candidate must remain.
8. Contact/owner-name similarity is not used.
9. A match confirms a CRM workflow relationship only. It does not establish ownership, seller intent, distress or transaction intent.

## Automation gate

Production policy row:

- provider: `boldtrail`
- method: `exact_normalized_street_and_zip_unique`
- auto verification: **disabled**
- minimum human reviews before policy reconsideration: **50**
- maximum acceptable false-positive rate for a future reviewed release: **1%**
- policy version: `1`

Reaching 50 reviews does not turn auto-verification on automatically. A later explicit engineering/security review must change the policy. Until then, unique exact matches remain one-click human-confirmed recommendations.

## Why the 17 links matter

These links create the first real gold examples for CRM-aware Watchdog Intelligence. They can be used to test whether future match logic continues to resolve the same properties without changing the user's verified relationship state.

The gold set must never be used as permission to:

- infer legal ownership;
- infer seller motivation;
- enrich protected-characteristic profiles;
- overwrite governed Watchdog property facts with CRM claims;
- silently relink a relationship after a provider rescan.

## Protection behavior

The current background resolver already skips existing non-candidate relationship rows. Verified relationships therefore survive subsequent rescans rather than being deleted and regenerated as candidates.

Any future resolver version must preserve this behavior and should be regression-tested against the human-verified gold set before deployment.
