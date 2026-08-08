# Watchdog Data Factory v1

Watchdog Data Factory is the review-gated ingestion layer for large New Jersey public datasets. It separates source acquisition, validation, normalization, live geometry access and customer-facing publication so that a publisher change cannot silently change a professional report.

## 2026 baseline

- NJ Treasury MOD-IV: 3,208,097 records validated across 21 county files.
- Structural validation failures: 0.
- Assessment arithmetic observations retained for review: 7,607. These are source-quality signals, not rows Watchdog silently rewrites.
- NJGIN statewide parcel composite: 3,478,727 parcel geometries at the validation run.
- NJGIN contract: 38 approved public-property fields requested and 0 owner/mailing fields requested.
- DCA Data Hub inventory: July 28, 2026 catalog registered as the acquisition map for future DCA feeds.

The live counts above are observations from the recorded validation run. The developer Data Operations page reads `property/data/data-factory-status.json` so later runs can replace them without changing page code.

## Privacy contract

MOD-IV raw files contain fields that Watchdog does not need to publish. The normalizer uses an allow-list. It never materializes owner name, owner mailing address, mortgage-account number, Social Security number or person-level rebate fields.

The NJGIN service itself exposes owner/mailing attributes, but `data_factory_njgin.py` never requests them. This is deliberate data minimization, not a UI-only hiding rule.

Raw and normalized statewide work products belong under `artifacts/data-factory/`, which is ignored by Git. Do not add raw statewide extracts to the website repository.

## Run a received MOD-IV release

From the repository root:

```bash
python3 property/scripts/run_data_factory.py --modiv-zip "/path/to/modiv-2026.zip" --emit-normalized
```

This performs the full MOD-IV validation and normalization, then checks the current NJGIN schema/count. A successful run ends in `review_required`; it does not publish customer-facing records.

For validation only, omit `--emit-normalized`.

## Check the live parcel connector

```bash
python3 property/scripts/data_factory_njgin.py --health
```

The scheduled GitHub health workflow runs this same contract without modifying production data.

## Publication gate

The default low-cost production sequence is:

1. Acquire the official source.
2. Validate the source contract and record a checksum.
3. Normalize only approved fields.
4. Run source-specific QA and join coverage tests.
5. Review anomalies and publisher notes.
6. Compile privacy-limited rows into reviewed municipality/county/state intelligence.
7. Recompute dependent Watchdog markers with versioned lineage.
8. Publish only aggregate intelligence after customer-facing regression checks pass.

Watchdog v0.35 completes this path for the 2026 MOD-IV baseline: 3,208,097 rows compile into 24 professional signals covering all 564 municipalities and 21 counties. The resulting aggregate artifact is under 2 MB. A full Supabase MOD-IV copy is no longer required; the v0.34 private warehouse remains optional for future selected historical workloads. See `property/docs/statewide-intelligence-compiler.md`.
