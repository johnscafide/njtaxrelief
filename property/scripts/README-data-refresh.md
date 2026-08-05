# NJ state-data refresh pipeline

Run `python3 property/scripts/refresh_state_data.py` to validate every registered dataset without downloading anything. Run it with `--refresh` to download and rebuild sources that have a direct parser, then validate every output. `--write-version` adds a release-history entry only when data files changed.

The scheduled GitHub workflow runs monthly and opens a review pull request. It never merges data automatically. The machine-readable result is `property/data/data-freshness.json`.

Add future sources to `property/data/source-registry.json`. A source can be validation-only, glob-based, or fully automated with a direct URL and parser command. Parsers must never extract owner names or party addresses.

`Municipal Budget Pressure` is rebuilt from the NJ DCA User-Friendly Budget Database plus the Property Tax Tables for 2021 through 2025. Put those eleven state workbooks in one folder, then run `python3 property/scripts/build_budget_pressure.py --input-dir PATH --output property/data/budget-pressure.json`. The builder uses municipal financial data only and does not read person-level records.

`Exempt property and PILOT exposure` is rebuilt from the 2025 NJ Abstract of Ratables and DCA's 2026 PILOT Database and Viewer. Run `python3 property/scripts/build_exempt_pilot.py PATH_TO_25ABSTRACT.xls PATH_TO_PILOT.xlsx property/data/exempt-pilot.json --abatements-output property/abatements.json`. This also repairs the older partial-abatement file to all 564 municipalities. The web output contains municipality aggregates only; individual PILOT project names are intentionally omitted.
