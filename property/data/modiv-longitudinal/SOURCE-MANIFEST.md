# NJ MOD-IV longitudinal source contract

Captured: 2026-08-21
Updated: 2026-08-27

## Authoritative source

Watchdog's `nj-dca-modiv-longitudinal` family is backed by the New Jersey Division of Taxation **Property Assessment List (MOD-IV)** annual files. The current State statistical-information page directly publishes ZIP archives for 2021 through 2026 and the official MOD-IV fixed-width file layout.

- Source index: `https://www.nj.gov/treasury/taxation/lpt/statdata.shtml`
- Annual archive pattern: `https://www.nj.gov/treasury/taxation/pdf/lpt/modiv-YYYY.zip`
- Current directly published archive years: 2021, 2022, 2023, 2024, 2025, 2026
- File layout: `https://www.nj.gov/treasury/taxation/pdf/lpt/modivlayout.pdf`
- Historical research reference: `https://modiv.rutgers.edu/` (Rutgers Historical Database, DCA-supported, registration-gated)

The production ingestion path uses the directly published Treasury archives when available. Rutgers is evidence that deeper history exists, not a credential-bypass path.

## Privacy boundary

The raw 700-character MOD-IV record contains fields Watchdog does **not** need for longitudinal assessment intelligence, including owner/mailing and legacy rebate fields. Raw archives are therefore ephemeral build inputs and must never be committed or copied wholesale into Watchdog storage.

The longitudinal parser is an allowlist. It may retain only:

- four-digit county/district code;
- block;
- lot;
- qualifier;
- tax-list year supplied by the authoritative archive name;
- Property Class;
- Land Value;
- Improvement Value;
- Net Value;
- the four published Exemption Code slots.

It must not retain owner name, mailing address, Social Security number, mortgage account number, bank code, or arbitrary raw-record payloads.

## Parcel identity

History joins conservatively on exact normalized:

`district code + block + lot + qualifier`

Watchdog does not automatically bridge a parcel renumbering/subdivision from `OLD-PROPERTY-ID`. An identity change remains a historical break until a separately governed parcel-lineage contract exists.

## Safe marker semantics

These eight catalog markers now have deterministic source or governed-derived semantics over the certified partitioned production artifact:

1. `njplus.nj-dca-modiv-longitudinal.assessment_history_depth`
   - count of annual Treasury tax-list records found for the exact parcel identity;
2. `njplus.nj-dca-modiv-longitudinal.assessment_land_history`
   - year-keyed `LAND-VALUE` history;
3. `njplus.nj-dca-modiv-longitudinal.assessment_improvement_history`
   - year-keyed `IMPROVEMENT-VALUE` history;
4. `njplus.nj-dca-modiv-longitudinal.assessment_total_history`
   - year-keyed `NET-VALUE` history;
5. `njplus.nj-dca-modiv-longitudinal.property_class_history`
   - year-keyed `PROPERTY-CLASS` history;
6. `njplus.nj-dca-modiv-longitudinal.exemption_code_history`
   - year-keyed list of the non-blank `EXEMPTION-CODE(1..4)` values;
7. `njplus.nj-dca-modiv-longitudinal.assessment_record_years`
   - ascending list of authoritative annual archive years in which the exact parcel identity occurs;
8. `njplus.nj-dca-modiv-longitudinal.parcel_record_change_count`
   - governed `history_metric` calculation version `watchdog-modiv-record-change-v1`;
   - counts a consecutive observed annual transition once when **any** retained safe field changes across Land Value, Improvement Value, Net Value, Property Class, or the Exemption Code list;
   - source-year gaps are never compared or treated as unchanged;
   - if there is no fully checked consecutive transition, the provider returns no value rather than a synthetic zero;
   - a zero is valid only after at least one consecutive transition has been fully checked.

A published zero remains zero. An absent parcel/year remains absent; it is never synthesized as zero. History objects are ordered by year in the provider response.

The record-change definition was authenticated-canary certified on 2026-08-27 against parcel `0101_25.01_10`: six certified annual records (2021–2026), five consecutive transitions, all retained fields unchanged, exact result `0`, `provider_kind=derived_governed`.

## Markers deliberately not certified by this contract

These two remain PLANNED unless a separate official Added/Omitted Assessment List source is acquired and governed:

- `njplus.nj-dca-modiv-longitudinal.added_assessment_history`
- `njplus.nj-dca-modiv-longitudinal.omitted_assessment_history`

The standard 700-character annual Property Assessment List layout does not expose dedicated added-assessment or omitted-assessment history fields. The MOD-IV Handbook describes Added, Omitted, Prior Year Added, Omitted-Added, and related processing as separate list/master-file types. The public NJ Division of Taxation statistical-information index currently publishes the ordinary annual Property Assessment List downloads, not a statewide Added/Omitted Assessment List dataset. Watchdog therefore does not infer added/omitted history from ordinary annual assessment movement.

## Production storage design

The build produces one privacy-safe compressed JSON partition per four-digit taxing district and stores it in the private Supabase Storage bucket `modiv-longitudinal` under a versioned prefix. Browser roles receive no direct Storage policy. The authenticated `workbench-hydrate` server path may read a requested district partition with its server credential after the existing plan/marker entitlement checks.

This avoids placing multi-million-row source files in the Git repository and avoids downloading statewide archives during an interactive property request.

## Release gates

No catalog marker becomes LIVE because this manifest, parser, bucket, or build pipeline exists. Promotion still requires all of the following:

1. reproducible official-archive build;
2. statewide/district diagnostics with source years and record counts;
3. production private-storage publication;
4. authenticated `workbench-hydrate` canary on at least one multi-year parcel;
5. missing-year semantics canary;
6. source-normalized fields use `provider_kind=authoritative_reference`; governed calculations use an explicit versioned `derived_governed` contract;
7. provider-coverage migration;
8. Phase 5 governance regeneration from current production truth.
