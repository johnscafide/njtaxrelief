# NJ state-data refresh pipeline

Run `python3 property/scripts/refresh_state_data.py` to validate every registered dataset without downloading anything. Run it with `--refresh` to download and rebuild sources that have a direct parser, then validate every output. `--write-version` adds a release-history entry only when data files changed.

The scheduled GitHub workflow runs monthly and opens a review pull request. It never merges data automatically. The machine-readable result is `property/data/data-freshness.json`.

## Statewide Data Factory

Large statewide sources now use the stricter Watchdog Data Factory path. For an official MOD-IV ZIP, run `python3 property/scripts/run_data_factory.py --modiv-zip PATH --emit-normalized`. It validates all 21 county partitions, writes privacy-limited normalized work products only under the Git-ignored `artifacts/data-factory/` directory, and validates the live NJGIN parcel schema/count. A successful run remains `review_required` and never publishes customer-facing data automatically.

Run `python3 property/scripts/data_factory_njgin.py --health` for the live parcel connector contract by itself. See `property/docs/data-factory.md` for the privacy allow-list and publication gate.

After normalization, compile the statewide source into the production aggregate intelligence layer with `python3 property/scripts/build_statewide_intelligence.py`. Then run `python3 property/scripts/build_marker_registry.py` and `python3 property/scripts/build_derived_marker_formulas.py`. This is the default path and does not require a Supabase plan upgrade. See `property/docs/statewide-intelligence-compiler.md`.

The private warehouse schema remains deployed separately from the public Data API for future selected row-level history. A full MOD-IV warehouse load is optional, not part of the default annual refresh.

Add future sources to `property/data/source-registry.json`. A source can be validation-only, glob-based, or fully automated with a direct URL and parser command. Parsers must never extract owner names or party addresses.

`Municipal Budget Pressure` is rebuilt from the NJ DCA User-Friendly Budget Database plus the Property Tax Tables for 2021 through 2025. Put those eleven state workbooks in one folder, then run `python3 property/scripts/build_budget_pressure.py --input-dir PATH --output property/data/budget-pressure.json`. The builder uses municipal financial data only and does not read person-level records.

`Exempt property and PILOT exposure` is rebuilt from the 2025 NJ Abstract of Ratables and DCA's 2026 PILOT Database and Viewer. Run `python3 property/scripts/build_exempt_pilot.py PATH_TO_25ABSTRACT.xls PATH_TO_PILOT.xlsx property/data/exempt-pilot.json --abatements-output property/abatements.json`. This also repairs the older partial-abatement file to all 564 municipalities. The web output contains municipality aggregates only; individual PILOT project names are intentionally omitted.
