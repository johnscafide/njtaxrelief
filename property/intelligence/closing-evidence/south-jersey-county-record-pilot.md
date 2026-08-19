# South Jersey County-Record Provider Pilot

Updated: 2026-08-19

## Goal

Add a future direct Closing Review evidence family for parcel-specific recorded documents such as liens, lis pendens, mortgage discharges, tax-sale certificates, judgments, and other recorded attachments **without** scraping blindly or interpreting incomplete county coverage as a clean result.

This is an acquisition/feasibility plan, not a title-search product. Any automated Watchdog result must remain a public-record screening signal and must direct the user to the county recording authority or a title professional for verification.

## Pilot matrix

| County | Official/public system | Useful parcel search key | Relevant record capability | Automation grade | Current Watchdog decision |
|---|---|---|---|---|---|
| **Camden** | County Clerk Online Property Records | Public UI; exact parcel automation contract still needs verification | Free basic access includes deeds, mortgages, discharges and cancellations. Premium access includes lis pendens, federal/municipal liens, construction liens and more. | **B — strong data, access contract needed** | First candidate for a paid/authorized records-provider proof because the Clerk explicitly documents the broader document set. Do not bypass the premium boundary. |
| **Gloucester** | County Clerk Land Records / Gloucester County Records Online | County system; parcel automation contract still needs verification | Deeds, mortgages, judgments and other land attachments; Clerk materials also identify tax liens as recorded real-property documents. | **B — strong data, integration method unclear** | High-priority pilot because it is core Watchdog territory. Confirm whether the public search vendor offers stable block/lot or parcel search and permitted machine access before coding. |
| **Burlington** | County Clerk PRESS | **Municipality + block + lot + qualifier** for records recorded on/after 2012 | Document type, instrument/book/page, block/lot and name search. | **A- for parcel matching; terms/API review required** | Best technical proof candidate for block/lot matching. Do not assume automated requests are permitted until PRESS terms/access behavior are reviewed. |
| **Salem** | County Clerk SearchNG public search | **Parcel ID** and case/parcel fields exposed in public search | Large document-type catalog plus parcel search. | **A- for parcel matching; stability review required** | Strong pilot candidate because parcel ID is first-class in the public search. Verify request contract/rate limits before provider implementation. |
| **Cape May** | County Clerk Land Records Public Search + PRESS | Municipality + block/lot in PRESS; public land-record search also exposes lot/block/document type | Deeds/mortgages and many recorded document types; online document research is available 24/7. | **B+ — good public search, anti-bot/access constraints present** | Suitable second-wave provider. Public Search may require human/browser verification, so do not defeat anti-bot controls. PRESS may be the cleaner parcel-to-record bridge. |
| **Cumberland** | County Clerk public land records / County Fusion + ImageSync | Current public instructions emphasize document type/name; recorded deeds include municipality, block and lot | Deeds, mortgages, tax liens and other land transactions; online records available, but Clerk warns electronic search is not a title search. | **B — records strong, parcel search contract needs discovery** | Pilot after confirming County Fusion search fields and authorized access. Preserve the Clerk's explicit title-search disclaimer in Watchdog UX. |
| **Atlantic** | County Clerk Public Records via NewVision | Public records system linked by Clerk; exact parcel fields need live contract verification | Clerk is Register of Deeds and Mortgages; records include deeds, mortgages, related documents and federal tax liens. | **B — official public system, integration details unresolved** | Research the NewVision public search contract and parcel matching before implementation. No scraper until access terms are known. |

## Recommended engineering order

### 1. Burlington feasibility probe

Why first:

- official PRESS exposes municipality + block + lot + qualifier directly;
- parcel matching aligns naturally with Watchdog's existing PAMS/MOD-IV identity;
- it is possible to test whether the document-type result set can be normalized without names.

Required proof before production provider:

1. Confirm terms permit automated or API access.
2. Determine stable request/response contract; no browser scraping if an official API/feed exists.
3. Normalize only transaction-relevant document metadata. Do not ingest SSNs, bank data, protected addresses, or unnecessary party PII.
4. Test 25 known parcels and require exact municipality/block/lot matching.
5. Distinguish `source_checked_no_value` from `provider_missing/provider_error`.

### 2. Salem parcel-ID feasibility probe

Why second:

- public search exposes Parcel ID as a first-class search mode;
- broad document type catalog may support direct exception classification.

Required proof is the same as Burlington: terms/access, stable request contract, exact parcel identity, privacy-minimized metadata, and explicit failure states.

### 3. Camden authorized premium/provider proof

Camden is especially valuable because its County Clerk explicitly places lis pendens, federal/municipal liens, construction liens and additional document types in premium access. Watchdog must **not** bypass that commercial boundary. Options:

- obtain a normal premium account and confirm whether automated use is permitted;
- ask the Clerk/search vendor for an API, bulk, or commercial-data arrangement;
- use manual/developer research only until a written/stable access contract exists.

## Candidate normalized record schema

A future provider should return metadata such as:

```json
{
  "county_code": "03",
  "pams_pin": "...",
  "match_state": "exact_block_lot",
  "document_family": "municipal_lien",
  "recorded_date": "YYYY-MM-DD",
  "instrument_reference": "...",
  "release_reference_present": false,
  "source_status": "available",
  "source_authority": "County Clerk",
  "checked_at": "..."
}
```

Do **not** make party names, owner identity, mailing address, protected address, Social Security information, or financial account data part of the scoring contract.

## Candidate Closing exceptions

Once an authorized provider exists, derive narrow deterministic exceptions rather than generic risk points:

- `recorded_lien_without_observed_release`
- `lis_pendens_recorded`
- `mortgage_discharge_reference_gap`
- `tax_sale_certificate_recorded`
- `construction_lien_recorded`
- `recording_after_latest_baseline_sale_requires_review`

Every exception must include the county source, document reference/date, parcel-match state, and a verification action. A record being present is a **review trigger**, not a legal conclusion that the encumbrance remains enforceable or unsatisfied.

## Stop conditions

Do not implement a county provider if any of these remain unresolved:

- access requires bypassing CAPTCHA or anti-bot controls;
- terms prohibit automated/commercial use;
- only party-name matching is available and exact parcel identity cannot be established;
- the result cannot distinguish releases/cancellations from active-looking filings;
- source freshness cannot be described;
- unavailable coverage would be indistinguishable from a true no-record result.
