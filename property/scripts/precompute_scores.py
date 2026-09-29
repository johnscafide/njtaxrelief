#!/usr/bin/env python3
"""Precompute the Watchdog Score (ROBUST-v1) for every NJ parcel.

Walks property_lookups in pams_pin order through workbench-score's
server-only batch_precompute mode (the same formula used on demand) and saves
progress in parcel_sync_runs (scope "score:statewide") after every call, so a
stopped run resumes where it left off.

An unfinished run is always resumed. With no unfinished run, a new pass
starts only when the last complete pass is older than --refresh-days, so the
6-hourly schedule keeps every score fresh without re-scoring for nothing.

The job brakes itself: it pauses between calls and waits while the database
is busy (the same rule as the mailing ZIP purge), and it stops cleanly before
the GitHub job limit so the next run picks up the cursor.

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (progress rows),
SCORE_PRECOMPUTE_TOKEN (the batch scoring token, sent as
x-score-precompute-token).
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
import sys
import time
from urllib.parse import urlencode

import requests

SCOPE = "score:statewide"
SOURCE = "Watchdog Score ROBUST-v1 batch precompute"


class Api:
    def __init__(self, url: str, key: str, job_token: str):
        self.url = url.rstrip("/")
        self.key = key
        self.job_token = job_token
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def score_page(self, after: str | None, limit: int, tries: int = 5) -> dict:
        delay = 3.0
        for attempt in range(tries):
            try:
                r = self.s.post(f"{self.url}/functions/v1/workbench-score", data=json.dumps({"mode": "batch_precompute", "after_pin": after or "", "limit": limit}), headers={"x-score-precompute-token": self.job_token}, timeout=150)
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

    def latest_run(self, statuses: str = "running,failed,stopped"):
        q = urlencode({"select": "*", "scope": f"eq.{SCOPE}", "status": f"in.({statuses})", "order": "started_at.desc", "limit": "1"})
        r = self.s.get(f"{self.url}/rest/v1/parcel_sync_runs?{q}", timeout=60)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def db_load(self) -> dict | None:
        try:
            r = self.s.post(f"{self.url}/rest/v1/rpc/watchdog_db_load", data="{}", timeout=30)
            return r.json() if r.status_code == 200 else None
        except requests.RequestException:
            return None

    def insert_run(self):
        r = self.s.post(f"{self.url}/rest/v1/parcel_sync_runs", data=json.dumps({"source": SOURCE, "scope": SCOPE, "status": "running"}), headers={"Prefer": "return=representation"}, timeout=60)
        r.raise_for_status()
        return r.json()[0]

    def update_run(self, run_id: str, patch: dict):
        patch = {**patch, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        r = self.s.patch(f"{self.url}/rest/v1/parcel_sync_runs?id=eq.{run_id}", data=json.dumps(patch), timeout=60)
        r.raise_for_status()


def busy(load: dict | None, max_active: int, max_seconds: float) -> bool:
    if not load:
        return False
    return int(load.get("active") or 0) > max_active or float(load.get("longest_seconds") or 0) > max_seconds


def pass_is_fresh(complete: dict | None, refresh_days: float, now: float) -> bool:
    if not complete or not complete.get("finished_at") or refresh_days <= 0:
        return False
    finished = calendar.timegm(time.strptime(complete["finished_at"][:19], "%Y-%m-%dT%H:%M:%S"))
    return now - finished < refresh_days * 86400


def run(args) -> dict:
    job_token = os.environ.get("SCORE_PRECOMPUTE_TOKEN", "")
    if len(job_token) < 32:
        raise SystemExit("SCORE_PRECOMPUTE_TOKEN is missing or shorter than 32 characters")
    api = Api(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"], job_token)
    run_row = api.latest_run()
    if run_row:
        api.update_run(run_row["id"], {"status": "running", "error": None})
        print(f"[scores] resuming run {run_row['id']} after {run_row.get('cursor') or 'start'}", flush=True)
    else:
        if pass_is_fresh(api.latest_run("complete"), args.refresh_days, time.time()):
            print(f"[scores] every score is fresh (last full pass under {args.refresh_days:g} days old); nothing to do", flush=True)
            return {"scope": SCOPE, "status": "fresh"}
        run_row = api.insert_run()
        print(f"[scores] started run {run_row['id']}", flush=True)
    after = run_row.get("cursor") or None
    pages = int(run_row.get("pages") or 0)
    processed = int(run_row.get("rows_received") or 0)
    scored = int(run_row.get("rows_written") or 0)
    started = time.time()
    try:
        while True:
            out_of_time = args.max_minutes and time.time() - started > args.max_minutes * 60
            if (args.max_pages and pages >= args.max_pages) or out_of_time:
                api.update_run(run_row["id"], {"status": "stopped", "cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored})
                print(f"[scores] reached {'--max-minutes' if out_of_time else '--max-pages'}; stopping cleanly at {after}", flush=True)
                break
            waited = 0
            while busy(api.db_load(), args.max_active, args.max_query_seconds) and waited < 600:
                print("[scores] database busy; waiting 20s", flush=True)
                time.sleep(20)
                waited += 20
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
            time.sleep(args.pause)
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
    p.add_argument("--resume", action="store_true", help="Kept for older callers; unfinished runs are always resumed")
    p.add_argument("--refresh-days", type=float, default=25, help="Start a new full pass only when the last one is older than this (0 = always)")
    p.add_argument("--max-minutes", type=float, default=0, help="Stop cleanly after this many minutes (0 = no limit)")
    p.add_argument("--pause", type=float, default=0.5, help="Seconds to rest between scoring calls")
    p.add_argument("--max-active", type=int, default=10, help="Wait while more than this many queries are active")
    p.add_argument("--max-query-seconds", type=float, default=15, help="Wait while any query has run longer than this")
    p.add_argument("--summary", help="Write a JSON summary here")
    args = p.parse_args()
    run(args)


if __name__ == "__main__":
    sys.exit(main())
