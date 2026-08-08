# Watchdog private warehouse v1

The Watchdog warehouse is the controlled historical store between Data Factory validation and customer-facing professional intelligence.

## Live Supabase state

Migration `watchdog_private_warehouse_v1` is applied to project `uvkvaxljhhngydvlrzom` as migration version `20260808005727`.

The `watchdog_warehouse` schema is deliberately private and must **not** be added to Supabase Data API exposed schemas. All five warehouse tables have RLS enabled as defense in depth, while `anon` and `authenticated` have no schema/table privileges. `service_role` is the ingestion role.

Tables:

- `source_releases` — immutable source edition/checksum metadata and lifecycle state.
- `load_runs` — bulk-copy execution state and row-count evidence.
- `modiv_observations` — privacy-limited annual property/tax observations, versioned by release.
- `data_quality_summary` — release-level QA observations and blocking checks.
- `publication_sets` — the explicit active release pointer, including the previous release for rollback history.

## Why releases are part of every row

MOD-IV history is not overwritten. A new state file becomes a new `source_releases` row, and its observations carry that release id. Two editions can therefore coexist during QA. `publication_sets` selects which reviewed release downstream systems are allowed to treat as active.

That makes rollback a pointer change rather than a destructive re-import.

## Load the validated 2026 baseline

The loader uses PostgreSQL `COPY`, the recommended class of import for large production datasets. It intentionally does not use the browser Data API for millions of rows.

Prerequisites:

1. Install PostgreSQL command-line tools so `psql --version` works.
2. In Supabase, open **Connect** and copy a database/session-pooler connection URL suitable for a trusted local bulk import.
3. Put that URL into an environment variable. Never paste it into source code or commit it.

If `artifacts/data-factory/modiv/2026/` is not present on that computer, first normalize the official ZIP locally with `python3 property/scripts/run_data_factory.py --modiv-zip "/path/to/modiv-2026.zip" --emit-normalized`. Those work products are intentionally excluded from every release ZIP and from Git.

PowerShell:

```powershell
$env:WATCHDOG_DATABASE_URL = "postgresql://..."
python property/scripts/load_modiv_warehouse.py --preflight
python property/scripts/load_modiv_warehouse.py
```

Bash:

```bash
export WATCHDOG_DATABASE_URL='postgresql://...'
python3 property/scripts/load_modiv_warehouse.py --preflight
python3 property/scripts/load_modiv_warehouse.py
```

The load is successful only if the final database count exactly matches the validated source count. Successful loading still does not publish anything.

## Review and publication

Read-only review:

```bash
python3 property/scripts/review_warehouse_release.py --release-id RELEASE_UUID
```

Approve after reviewing row counts and quality signals:

```bash
python3 property/scripts/review_warehouse_release.py --release-id RELEASE_UUID --approve
```

Publication is deliberately a separate action and requires the exact release UUID twice:

```bash
python3 property/scripts/review_warehouse_release.py --release-id RELEASE_UUID --publish --confirm RELEASE_UUID --note "2026 MOD-IV reviewed"
```

No browser currently reads `watchdog_warehouse` directly. The next layer should be small server-side projections/RPCs that enforce plan entitlements and return only the fields required for a specific property or professional workflow.
