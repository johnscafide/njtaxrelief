# Closing Review Actionable Evidence Source Matrix

Updated: 2026-08-19

## Product rule

Closing Review must prioritize **direct, parcel-specific transaction follow-up evidence**. Generalized environmental, flood, wetlands, tidelands, proximity, municipal trend, or market context may explain a property but cannot independently create a Closing Priority.

A missing provider is not a negative finding. Watchdog must distinguish `available`, `source_checked_no_value`, `dependency_missing`, `provider_error`, and `provider_missing`.

## Source matrix

| Evidence family | Authority / source | Geographic coverage | Automation state | Parcel match | Closing role | Important caveat |
|---|---|---:|---|---|---|---|
| Building permit / certificate lifecycle | NJ Department of Community Affairs Construction Reporter / raw permit data | Statewide reporting program | **LIVE** through current DCA raw permit provider | Treasury municipality code + block + lot | **Primary direct exception** | DCA data is a public reporting dataset, not a municipal code-clearance certificate. A permit/certificate count gap is a review trigger, not a legal finding that a permit is open. |
| Deed book / page / sale recording reference | NJOGIS Parcels / MOD-IV composite; county clerk remains recording authority | Statewide parcel baseline | **LIVE baseline** | PAMS PIN | **Primary direct exception** when expected recording references are incomplete | The statewide parcel layer is not a substitute for a county title search. Missing references require county-record verification. |
| County recorded liens / lis pendens / tax-sale certificates / mortgage releases | County Clerk / Register of Deeds and Mortgages | 21 county systems | **RESEARCH / FRAGMENTED** | County recording index; varies by county | Future **primary direct exception** | County systems and search vendors vary. Do not scrape or infer statewide coverage without confirmed access terms and a stable matching contract. |
| Municipal tax-sale / delinquency evidence | Municipal Tax Collector under NJ tax-sale framework; NJ DCA DLGS guidance | 564 municipalities | **RESEARCH / FRAGMENTED** | Municipality + block/lot/account; varies locally | Future **primary direct exception** | No authoritative statewide parcel-level machine feed has been established. Absence of a Watchdog record must never mean taxes are current. |
| Code enforcement / open violation evidence | Local enforcing agency / municipality; DCA only where it is the enforcing authority | Mixed local / State jurisdiction | **RESEARCH / FRAGMENTED** | Municipality-specific | Future **primary direct exception** | No single statewide public parcel-level violation feed has been established. |
| Parcel identity / record-match quality | NJOGIS Parcels / MOD-IV composite | Statewide | **LIVE** | PAMS PIN + municipality + block + lot | **Supporting direct exception** | A Watchdog identity mismatch means downstream evidence should be verified; it is not itself a title defect. |
| NJDEP deed notice / CEA | NJDEP public GIS | Statewide mapped coverage | **LIVE** | Parcel coordinates / intersection | **Supporting context only** | GIS intersection is screening context, not a title or legal conclusion. v5 showed these should not independently create Closing Priority. |
| FEMA / flood / wetlands / tidelands context | FEMA NFHL + NJDEP public GIS | Statewide mapped coverage | **LIVE** | Parcel coordinates / intersection | **Supporting context only** | Context for diligence, insurance, counsel, or survey review. Not a standalone Closing Priority trigger. |
| Foreclosure intention filing database | NJ DCA foreclosure filing system | Statewide | **PROHIBITED / NOT PUBLIC** | N/A | **Do not ingest** | State guidance identifies the database as confidential / not publicly accessible. |

## v6 actionable exception foundation

Closing Review v6 is a draft exception-trigger model. Its primary score is the **maximum** of direct exception families rather than an average of generalized risks:

1. Permit/certificate lifecycle exception: inverse of governed permit closure confidence.
2. Recording-reference exception: inverse of deed recording-reference completeness.
3. Parcel-identity exception: governed parcel-match variance.

Environmental/flood/tidelands context is explicitly excluded from the v6 primary score.

## Next acquisition priorities

1. Establish a county-record provider contract for one South Jersey pilot county, then expand only after matching accuracy and access terms are verified.
2. Establish a municipal tax-sale/delinquency provider contract without interpreting unavailable municipalities as clean.
3. Identify authoritative open-violation feeds where a municipality or DCA exposes stable parcel identifiers.
4. Add source-level coverage metadata so customer-facing language can say exactly what was checked and what was not.

## Validation policy

Before another 35-case blinded calibration set:

- structural shadow must use unseen properties and all 21 counties;
- at least 25 cases must be scorable;
- at least 8 distinct direct-exception scores and 8 unique feature vectors;
- at least 2 direct/actionable feature families must vary;
- any candidate threshold or trigger rule must be frozen before human labels;
- first run a small 8–10 case development sanity review to confirm the product is surfacing useful transaction follow-ups;
- development sanity labels may inform redesign but can never serve as independent promotion proof.
