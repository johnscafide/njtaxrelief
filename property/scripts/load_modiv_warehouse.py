#!/usr/bin/env python3
"""Bulk-load normalized MOD-IV partitions into the private Watchdog warehouse.

This intentionally uses PostgreSQL COPY through the official `psql` client.
The database URL must be supplied in WATCHDOG_DATABASE_URL (or an explicitly
named environment variable); credentials are never accepted as CLI arguments.

Loading does not publish a release. A successful load finishes at status
`loaded` and requires a separate review/approval action.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import pathlib
import shutil
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "artifacts/data-factory/modiv/2026"
DEFAULT_STATUS = ROOT / "property/data/data-factory-status.json"
SOURCE_ID = "treasury-modiv-2026"
COPY_COLUMNS = [
    "release_id", "tax_year", "parcel_key", "county_district", "block", "lot",
    "qualifier", "record_id", "property_class", "property_location",
    "building_description", "land_description", "calculated_acres", "zoning",
    "tax_map_page", "deed_book", "deed_page", "sales_price_code", "deed_date",
    "sale_price", "sale_assessment", "sale_sr1a_unusable_code", "building_class",
    "year_constructed", "land_value", "improvement_value", "net_value",
    "property_use_code", "last_year_tax", "current_year_tax",
    "prior_year_net_value", "state_aid_amount"
]
ROW_COLUMNS = COPY_COLUMNS[1:]


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def psql(database_url: str, sql: str, capture: bool = True) -> str:
    command = ["psql", database_url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql]
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=capture)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout or "psql failed").strip())
    return (result.stdout or "").strip()


def copy_value(value) -> str:
    if value is None:
        return r"\N"
    return str(value).replace("\\", "\\\\").replace("\t", " ").replace("\r", " ").replace("\n", " ")


def iter_rows(partitions: list[pathlib.Path], release_id: str):
    for partition in partitions:
        with gzip.open(partition, "rt", encoding="utf-8") as stream:
            for line in stream:
                row = json.loads(line)
                yield "\t".join([release_id] + [copy_value(row.get(column)) for column in ROW_COLUMNS]) + "\n"


def update_factory_status(path: pathlib.Path, release_id: str, copied: int, partitions: int) -> None:
    status = json.loads(path.read_text(encoding="utf-8"))
    summary = status.setdefault("summary", {})
    summary.update({
        "warehouse_schema_state": "deployed_private",
        "warehouse_load_state": "loaded_awaiting_review",
        "warehouse_loaded_records": copied,
        "warehouse_loaded_partitions": partitions,
    })
    status["latest_warehouse_load"] = {
        "source_id": SOURCE_ID,
        "release_id": release_id,
        "copied_records": copied,
        "partitions": partitions,
        "publication_state": "not_published"
    }
    for stage in status.get("stages", []):
        if stage.get("id") == "warehouse-load":
            stage["status"] = "passed"
            stage["detail"] = f"{copied:,} normalized MOD-IV records loaded into the private warehouse across {partitions} county partitions."
        if stage.get("id") == "publish":
            stage["status"] = "review_required"
            stage["detail"] = "Warehouse load passed. Production publication now requires explicit data-quality review and release approval."
    path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", default=str(DEFAULT_SOURCE))
    parser.add_argument("--status", default=str(DEFAULT_STATUS))
    parser.add_argument("--database-url-env", default="WATCHDOG_DATABASE_URL")
    parser.add_argument("--edition", default="2026")
    parser.add_argument("--preflight", action="store_true", help="Validate local inputs without connecting to Postgres")
    args = parser.parse_args()

    try:
        source_dir = pathlib.Path(args.source_dir).resolve()
        partitions = sorted(source_dir.glob("*.jsonl.gz"))
        if len(partitions) != 21:
            raise RuntimeError(f"Expected 21 normalized county partitions, found {len(partitions)}")

        status_path = pathlib.Path(args.status).resolve()
        factory = json.loads(status_path.read_text(encoding="utf-8"))
        modiv = factory.get("latest_modiv_run") or {}
        expected = int(modiv.get("source_records") or 0)
        sha = str(modiv.get("source_sha256") or "")
        mismatches = int(modiv.get("assessment_math_mismatches") or 0)
        if expected < 1_000_000 or len(sha) != 64 or not modiv.get("validation_passed"):
            raise RuntimeError("Data Factory status does not contain a validated MOD-IV release")
        if args.preflight:
            print(json.dumps({"ok": True, "mode": "preflight", "expected_records": expected, "partitions": len(partitions), "source_sha256": sha, "publish_state": "not_loaded"}, indent=2))
            return 0
        if not shutil.which("psql"):
            raise RuntimeError("PostgreSQL psql client is required for the bulk COPY loader")
        database_url = os.environ.get(args.database_url_env)
        if not database_url:
            raise RuntimeError(f"Set {args.database_url_env} to the Supabase direct/session-pooler database URL")

        release_sql = f"""
        insert into watchdog_warehouse.source_releases
          (source_id, edition, source_sha256, source_record_count, normalized_record_count, status, source_metadata)
        values
          ({sql_literal(SOURCE_ID)}, {sql_literal(args.edition)}, {sql_literal(sha)}, {expected}, {expected}, 'validated',
           jsonb_build_object('privacy_contract','strict_allow_list','county_partitions',21))
        on conflict (source_id, edition, source_sha256) do update
          set validated_at=now(), source_record_count=excluded.source_record_count,
              normalized_record_count=excluded.normalized_record_count
        returning id;
        """
        release_id = psql(database_url, release_sql).splitlines()[-1].strip()
        if not release_id:
            raise RuntimeError("Could not obtain warehouse release id")

        existing = int(psql(database_url, f"select count(*) from watchdog_warehouse.modiv_observations where release_id={sql_literal(release_id)};") or 0)
        if existing:
            raise RuntimeError(f"Release already contains {existing:,} observations; loader will not overwrite or delete them")

        run_id = psql(database_url, f"insert into watchdog_warehouse.load_runs (release_id,status,expected_rows,partition_count) values ({sql_literal(release_id)},'copying',{expected},21) returning id;").splitlines()[-1].strip()
        copy_sql = "COPY watchdog_warehouse.modiv_observations (" + ",".join(COPY_COLUMNS) + ") FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')"
        process = subprocess.Popen(
            ["psql", database_url, "-X", "-v", "ON_ERROR_STOP=1", "-c", copy_sql],
            cwd=ROOT, text=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        copied = 0
        assert process.stdin is not None
        try:
            for payload in iter_rows(partitions, release_id):
                process.stdin.write(payload)
                copied += 1
        finally:
            process.stdin.close()
        stdout = process.stdout.read() if process.stdout else ""
        stderr = process.stderr.read() if process.stderr else ""
        code = process.wait()
        if code:
            psql(database_url, f"update watchdog_warehouse.load_runs set status='failed', copied_rows=0, error_summary={sql_literal((stderr or stdout)[-2000:])}, completed_at=now() where id={sql_literal(run_id)};")
            raise RuntimeError((stderr or stdout or "COPY failed").strip())

        stored = int(psql(database_url, f"select count(*) from watchdog_warehouse.modiv_observations where release_id={sql_literal(release_id)};") or 0)
        if stored != expected or copied != expected:
            psql(database_url, f"update watchdog_warehouse.load_runs set status='failed', copied_rows={stored}, error_summary='row count mismatch', completed_at=now() where id={sql_literal(run_id)};")
            raise RuntimeError(f"Warehouse count mismatch: expected {expected:,}, streamed {copied:,}, stored {stored:,}")

        psql(database_url, f"""
          update watchdog_warehouse.load_runs set status='validated', copied_rows={stored}, completed_at=now() where id={sql_literal(run_id)};
          update watchdog_warehouse.source_releases set status='loaded', loaded_at=now() where id={sql_literal(release_id)};
          insert into watchdog_warehouse.data_quality_summary (release_id,check_id,severity,observation_count,detail)
          values ({sql_literal(release_id)},'assessment_math_mismatch','warning',{mismatches},jsonb_build_object('rule','land_value + improvement_value != net_value','action','preserve source; review before derivation'))
          on conflict (release_id,check_id) do update set observation_count=excluded.observation_count, detail=excluded.detail, checked_at=now();
        """)
        update_factory_status(status_path, release_id, stored, len(partitions))
        print(json.dumps({"ok": True, "release_id": release_id, "loaded_records": stored, "partitions": len(partitions), "publish_state": "review_required"}, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
