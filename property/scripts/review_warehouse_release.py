#!/usr/bin/env python3
"""Review, approve, or publish a loaded Watchdog warehouse release.

The default action is read-only. Approval and publication are separate explicit
steps. Publication requires the release id to be repeated with --confirm so a
mistyped command cannot switch the active dataset.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def query(database_url: str, sql: str) -> str:
    result = subprocess.run(
        ["psql", database_url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        text=True, capture_output=True
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout or "psql failed").strip())
    return result.stdout.strip()


def review(database_url: str, release_id: str) -> dict:
    raw = query(database_url, f"""
      select json_build_object(
        'release_id', r.id,
        'source_id', r.source_id,
        'edition', r.edition,
        'status', r.status,
        'expected_rows', r.normalized_record_count,
        'stored_rows', (select count(*) from watchdog_warehouse.modiv_observations o where o.release_id=r.id),
        'blocking_quality_checks', (select count(*) from watchdog_warehouse.data_quality_summary q where q.release_id=r.id and q.severity in ('error','blocking') and q.observation_count>0),
        'warning_observations', (select coalesce(sum(q.observation_count),0) from watchdog_warehouse.data_quality_summary q where q.release_id=r.id and q.severity='warning'),
        'active_release', (select p.release_id from watchdog_warehouse.publication_sets p where p.source_id=r.source_id)
      )::text
      from watchdog_warehouse.source_releases r where r.id={literal(release_id)};
    """)
    if not raw:
        raise RuntimeError("Warehouse release not found")
    result = json.loads(raw)
    result["ready_for_approval"] = (
        int(result["expected_rows"]) == int(result["stored_rows"])
        and int(result["stored_rows"]) > 0
        and int(result["blocking_quality_checks"]) == 0
        and result["status"] in {"loaded", "approved", "published"}
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--database-url-env", default="WATCHDOG_DATABASE_URL")
    parser.add_argument("--approve", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--confirm", help="Repeat the exact release UUID when publishing")
    parser.add_argument("--note", default="Reviewed Watchdog Data Factory release")
    args = parser.parse_args()
    try:
        if not UUID_RE.fullmatch(args.release_id):
            raise RuntimeError("Invalid release UUID")
        if args.approve and args.publish:
            raise RuntimeError("Approve and publish are separate steps; run one action at a time")
        if not shutil.which("psql"):
            raise RuntimeError("PostgreSQL psql client is required")
        database_url = os.environ.get(args.database_url_env)
        if not database_url:
            raise RuntimeError(f"Set {args.database_url_env} to the Supabase database URL")

        state = review(database_url, args.release_id)
        if not args.approve and not args.publish:
            print(json.dumps(state, indent=2))
            return 0
        if not state["ready_for_approval"]:
            raise RuntimeError("Release did not pass the row-count and blocking-quality gates")

        if args.approve:
            query(database_url, f"update watchdog_warehouse.source_releases set status='approved', approved_at=now() where id={literal(args.release_id)} and status='loaded';")
            print(json.dumps({"ok": True, "release_id": args.release_id, "status": "approved", "published": False}, indent=2))
            return 0

        if args.confirm != args.release_id:
            raise RuntimeError("Publication requires --confirm with the exact release UUID")
        if state["status"] != "approved":
            raise RuntimeError("Release must be approved in a separate command before publication")
        actor = os.environ.get("WATCHDOG_RELEASE_ACTOR", "watchdog-developer")
        source_id = state["source_id"]
        query(database_url, f"""
          begin;
          with prior as (
            select release_id from watchdog_warehouse.publication_sets where source_id={literal(source_id)} for update
          )
          update watchdog_warehouse.source_releases set status='retired'
          where id in (select release_id from prior) and id <> {literal(args.release_id)};
          insert into watchdog_warehouse.publication_sets (source_id,release_id,previous_release_id,publication_note,published_at,published_by)
          values ({literal(source_id)},{literal(args.release_id)},(select release_id from watchdog_warehouse.publication_sets where source_id={literal(source_id)}),{literal(args.note)},now(),{literal(actor)})
          on conflict (source_id) do update set
            previous_release_id=watchdog_warehouse.publication_sets.release_id,
            release_id=excluded.release_id,
            publication_note=excluded.publication_note,
            published_at=excluded.published_at,
            published_by=excluded.published_by;
          update watchdog_warehouse.source_releases set status='published', published_at=now() where id={literal(args.release_id)};
          commit;
        """)
        print(json.dumps({"ok": True, "release_id": args.release_id, "status": "published", "previous_release_id": state.get("active_release")}, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
