# NJ state-data refresh pipeline

Run `python3 property/scripts/refresh_state_data.py` to validate every registered dataset without downloading anything. Run it with `--refresh` to download and rebuild sources that have a direct parser, then validate every output. `--write-version` adds a release-history entry only when data files changed.

The scheduled GitHub workflow runs monthly and opens a review pull request. It never merges data automatically. The machine-readable result is `property/data/data-freshness.json`.

Add future sources to `property/data/source-registry.json`. A source can be validation-only, glob-based, or fully automated with a direct URL and parser command. Parsers must never extract owner names or party addresses.
