#!/usr/bin/env python3
"""Precompute the Watchdog Score (ROBUST-v1) for every NJ parcel.

Walks property_lookups in pams_pin order through workbench-score's
server-only batch_precompute mode (the same formula used on demand) and saves
progress in parcel_sync_runs (scope "score:statewide") after every call, so a
stopped run resumes where it left off.

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from urllib.parse import urlencode

import requests

SCOPE = "score:statewide"
SOURCE = "Watchdog Score ROBUST-v1 batch precompute"


class Api:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def score_page(self, after: str | None, limit: int, tries: int = 5) -> dict:
        delay = 3.0
        for attempt in range(tries):
            try:
                r = self.s.post(f"{self.url}/functions/v1/workbench-score", data=json.dumps({"mode": "batch_precompute", "after_pin": after or "", "limit": limit}), timeout=150)
                if r.status_code == 200:
                    return r.json()
                err = f"HTTP {r.status_code}: {r.text[:200]}"
                if r.status_code in (400, 401, 403):
                    raise RuntimeError(err)
            except requests.RequestException as exc:
                err = str(exc)
            if attempt == tries - 1:
                raise RuntimeError(f"batch scoring failed: {err}")
            print(f"[scores] retrying after: {err}", flush=True)
            time.sleep(delay)
            delay *= 2
        raise RuntimeError("unreachable")

    def latest_run(self):
        q = urlencode({"select": "*", "scope": f"eq.{SCOPE}", "status": "in.(running,failed,stopped)", "order": "started_at.desc", "limit": "1"})
        r = self.s.get(f"{self.url}/rest/v1/parcel_sync_runs?{q}", timeout=60)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def insert_run(self):
        r = self.s.post(f"{self.url}/rest/v1/parcel_sync_runs", data=json.dumps({"source": SOURCE, "scope": SCOPE, "status": "running"}), headers={"Prefer": "return=representation"}, timeout=60)
        r.raise_for_status()
        return r.json()[0]

    def update_run(self, run_id: str, patch: dict):
        patch = {**patch, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        r = self.s.patch(f"{self.url}/rest/v1/parcel_sync_runs?id=eq.{run_id}", data=json.dumps(patch), timeout=60)
        r.raise_for_status()


def run(args) -> dict:
    api = Api(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    run_row = api.latest_run() if args.resume else None
    if run_row:
        api.update_run(run_row["id"], {"status": "running", "error": None})
        print(f"[scores] resuming run {run_row['id']} after {run_row.get('cursor') or 'start'}", flush=True)
    else:
        run_row = api.insert_run()
        print(f"[scores] started run {run_row['id']}", flush=True)
    after = run_row.get("cursor") or None
    pages = int(run_row.get("pages") or 0)
    processed = int(run_row.get("rows_received") or 0)
    scored = int(run_row.get("rows_written") or 0)
    started = time.time()
    try:
        while True:
            if args.max_pages and pages >= args.max_pages:
                api.update_run(run_row["id"], {"status": "stopped", "cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored})
                print("[scores] reached --max-pages; stopping cleanly", flush=True)
                break
            res = api.score_page(after, args.limit)
            pages += 1
            processed += int(res.get("processed") or 0)
            scored += int(res.get("scored") or 0)
            after = res.get("next_after") or after
            done = bool(res.get("done"))
            api.update_run(run_row["id"], {"cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored, **({"status": "complete", "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())} if done else {})})
            if pages % 25 == 0 or pages == 1 or done:
                rate = processed / max(time.time() - started, 1)
                print(f"[scores] page {pages:,}: {processed:,} parcels, {scored:,} scored, at {after}, {rate:,.0f}/s", flush=True)
            if done:
                break
    except Exception as exc:
        api.update_run(run_row["id"], {"status": "failed", "error": str(exc)[:500], "cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored})
        raise
    summary = {"scope": SCOPE, "pages": pages, "processed": processed, "scored": scored, "cursor": after, "run_id": run_row["id"], "minutes": round((time.time() - started) / 60, 1)}
    print("[scores] summary " + json.dumps(summary), flush=True)
    if args.summary:
        with open(args.summary, "w") as fh:
            json.dump(summary, fh, indent=2)
    return summary


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--limit", type=int, default=1000, help="Parcels per scoring call (max 1000)")
    p.add_argument("--max-pages", type=int, default=0, help="Stop after this many calls (0 = no limit)")
    p.add_argument("--resume", action="store_true", help="Continue the latest unfinished run")
    p.add_argument("--summary", help="Write a JSON summary here")
    args = p.parse_args()
    run(args)


if __name__ == "__main__":
    sys.exit(main())
