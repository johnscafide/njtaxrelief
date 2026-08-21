# NJ MOD-IV longitudinal source contract

Captured: 2026-08-21

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

These seven catalog markers have deterministic source semantics once the partitioned production artifact is built and certified:

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
   - ascending list of authoritative annual archive years in which the exact parcel identity occurs.

A published zero remains zero. An absent parcel/year remains absent; it is never synthesized as zero. History objects are ordered by year in the provider response.

## Markers deliberately not certified by this contract

These three remain PLANNED unless a later source contract establishes their exact semantics:

- `njplus.nj-dca-modiv-longitudinal.added_assessment_history`
- `njplus.nj-dca-modiv-longitudinal.omitted_assessment_history`
- `njplus.nj-dca-modiv-longitudinal.parcel_record_change_count`

The standard 700-character annual Property Assessment List layout does not expose a dedicated added-assessment or omitted-assessment history field. The MOD-IV Handbook describes added/omitted processing as separate list types, so Watchdog will not infer them from ordinary annual assessment movement. `parcel_record_change_count` is also withheld until the exact set of fields constituting a countable record change is formally versioned.

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
6. `provider_kind=authoritative_reference` for source-normalized history fields;
7. provider-coverage migration;
8. Phase 5 governance regeneration from current production truth.
