# Statewide Intelligence Compiler

Watchdog v0.35 uses the official statewide MOD-IV release as an analytical input without requiring the full 3.2M-row snapshot to live in the production database.

## Architecture

1. `data_factory_modiv.py` validates and privacy-normalizes the official county files under Git-ignored `artifacts/data-factory/`.
2. `build_statewide_intelligence.py` reads those 21 normalized partitions locally.
3. It computes exact municipality and county distributions plus a deterministic statewide quantile sample. Counts and means remain exact statewide.
4. Only aggregate benchmarks, percentile context and marker definitions are written to `property/data/`.
5. Live individual-parcel lookup continues to use the governed NJGIN connector. Supabase remains focused on accounts, entitlements, saved work, tracked-property history and future selected historical datasets.

This avoids paying to store a multi-gigabyte copy of a source that can be recompiled whenever Treasury publishes a replacement.

## Current 2026 output

- 3,208,097 source records analyzed
- 564 municipalities
- 21 counties
- 24 proprietary professional signals
- aggregate artifact under 2 MB
- no owner name, mailing address, mortgage account, SSN or person-level rebate data
- no raw or normalized parcel rows shipped in the web repository

## Tax-field caveat

The received 2026 MOD-IV release leaves its `current_year_tax` field blank while the `last_year_tax` field is populated. Watchdog therefore labels tax measures as the latest **reported** annual tax and uses the populated field as a fallback. It does not infer a year-over-year tax change from missing data.

## Sales caveat

Recorded MOD-IV deed/sale fields are useful for broad turnover and assessment-ratio context, but Watchdog does not describe them as verified arm's-length SR-1A sales. Signals and UI copy must preserve that distinction.

## Rebuild

From the repository root, after a successful normalized Data Factory run:

```bash
python3 property/scripts/build_statewide_intelligence.py
python3 property/scripts/build_marker_registry.py
python3 property/scripts/build_derived_marker_formulas.py
```

Review the generated aggregate distributions and source-quality warnings before publishing a new annual baseline.

## Optional private warehouse

The v0.34 private Supabase warehouse schema is intentionally retained. It can hold selected row-level historical datasets later when a professional workflow genuinely needs them. A full statewide MOD-IV load is not a dependency of the current customer product.
