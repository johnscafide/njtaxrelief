#!/usr/bin/env python3
"""Precompute the Watchdog Score (ROBUST-v1) for every NJ parcel.

Walks property_lookups in pams_pin order through workbench-score's
server-only batch_precompute mode (the same formula used on demand) and saves
progress in parcel_sync_runs (scope "score:statewide") after every page, so a
stopped run resumes where it left off.

An unfinished run is always resumed. With no unfinished run, a new pass
starts only when the last complete pass is older than --refresh-days, so the
6-hourly schedule keeps every score fresh without re-scoring for nothing.

How the job protects the database (the shared brake in db_brake.py):

- Before every page, and again before every retry, it asks watchdog_db_load
  how busy the database is and waits while it is busy: more than --max-active
  active queries (default 5), a query running longer than --max-query-seconds
  (default 5), queries piling up on disk IO or on locks, or a load check that
  is slow or does not answer. Not knowing counts as busy.
- If the database is still busy after 15 minutes of waiting, the job stops.
- A page that fails (HTTP 500, 502, 503, 504 or any other unexpected answer,
  or no answer within 90 seconds) is not counted and the cursor does not
  move. The job waits 30 seconds, then 60 (or longer when workbench-score asks
  for more with retry_after_seconds), checks the brake again, and retries the
  same page. Three failures in a row stop the job.
- workbench-score itself answers 503 subject_evidence_unavailable, and writes
  no scores for the page, when the SR-1A subject evidence lookup fails, so no
  page is ever cached without that evidence. An older workbench-score that
  still answers 200 with subject_evidence_status "unavailable" is treated as a
  failed page too: the cursor stays put and a good retry overwrites the page.

Stopping for load is a clean stop: the run is saved as "stopped" with the
reason and the cursor of the last page that was scored, the summary is
written, and the script exits with code 75 so the scheduled job shows that it
did not finish. The next run resumes from that cursor. HTTP 400, 401 and 403
are not retried; they mark the run "failed". --max-pages and --max-minutes
also stop cleanly (exit code 0). The brake never waits past the --max-minutes
deadline; a database that is still busy at the deadline ends the run as a
time stop, not a load stop.

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (progress rows and the
load check), SCORE_PRECOMPUTE_TOKEN (the batch scoring token, sent as
x-score-precompute-token).

--self-test checks the retry, backoff, brake and stop rules offline.
"""
from __future__ import annotations

import argparse
import calendar
import json
import math
import os
import sys
import time
from urllib.parse import urlencode

import requests

from db_brake import LIMITS, Brake, Breaker, Overloaded, busy_reason

SCOPE = "score:statewide"
SOURCE = "Watchdog Score ROBUST-v1 batch precompute"

CALL_TIMEOUT = 90  # seconds for one workbench-score page
FAILURE_LIMIT = 3  # failed pages in a row before the job stops
BACKOFF = (30, 60, 120)  # seconds to wait after the 1st, 2nd, 3rd+ failure in a row
MAX_RETRY_AFTER = 300  # never wait longer than this because the server asked
FATAL_STATUSES = (400, 401, 403)  # bad request or bad token: retrying cannot help
BRAKE_MAX_WAIT = 900.0  # stop if the database is still busy after 15 minutes
EXIT_OVERLOADED = 75  # EX_TEMPFAIL: stopped for load, resume later


def classify(status: int | None) -> str:
    """'ok' for 200, 'fatal' for 400/401/403, 'retry' for anything else (5xx, timeouts, no answer)."""
    if status == 200:
        return "ok"
    if status in FATAL_STATUSES:
        return "fatal"
    return "retry"


def backoff_seconds(failures: int, retry_after=None) -> float:
    """How long to wait after the given number of failures in a row."""
    base = float(BACKOFF[min(max(failures, 1), len(BACKOFF)) - 1])
    try:
        asked = float(retry_after) if retry_after is not None else 0.0
    except (TypeError, ValueError):
        asked = 0.0
    if not math.isfinite(asked):
        asked = 0.0
    return max(base, min(asked, float(MAX_RETRY_AFTER)))


def brake_limits(max_active: int, max_query_seconds: float) -> dict:
    return {**LIMITS, "max_active": max_active, "max_query_seconds": max_query_seconds}


def brake_budget(deadline: float | None, now: float) -> float:
    """How long the brake may wait: 15 minutes, but never past the --max-minutes deadline."""
    if deadline is None:
        return BRAKE_MAX_WAIT
    return max(0.0, min(BRAKE_MAX_WAIT, deadline - now))


class OutOfTime(Exception):
    """The --max-minutes deadline cut a brake wait short."""


def exit_code(summary: dict) -> int:
    return EXIT_OVERLOADED if summary.get("overloaded") else 0


class Api:
    def __init__(self, url: str, key: str, job_token: str):
        self.url = url.rstrip("/")
        self.key = key
        self.job_token = job_token
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def score_page(self, after: str | None, limit: int, brake_wait, breaker: Breaker, sleep=time.sleep) -> dict:
        """Score one page and return workbench-score's answer.

        A failed call is counted on the breaker, followed by a backoff and a
        brake check, and the same page is retried. Raises Overloaded when the
        breaker trips or the brake gives up, RuntimeError on 400/401/403.
        """
        payload_out = json.dumps({"mode": "batch_precompute", "after_pin": after or "", "limit": limit})
        while True:
            status, body, err = None, None, ""
            try:
                r = self.s.post(f"{self.url}/functions/v1/workbench-score", data=payload_out, headers={"x-score-precompute-token": self.job_token}, timeout=CALL_TIMEOUT)
                status, err = r.status_code, f"HTTP {r.status_code}: {r.text[:200]}"
                try:
                    body = r.json()
                except ValueError:
                    body = None
            except requests.RequestException as exc:
                err = f"{type(exc).__name__}: {str(exc)[:200]}"
            kind = classify(status)
            if kind == "fatal":
                raise RuntimeError(f"batch scoring refused: {err}")
            if kind == "ok" and isinstance(body, dict):
                if body.get("subject_evidence_status") != "unavailable":
                    breaker.ok()
                    return body
                # An older workbench-score still cached this page without SR-1A
                # evidence; do not move past it (a good retry overwrites it).
                err = "HTTP 200 but subject_evidence_status is unavailable"
            breaker.fail(err)  # raises Overloaded on the last allowed failure
            wait = backoff_seconds(breaker.fails, body.get("retry_after_seconds") if isinstance(body, dict) else None)
            print(f"[scores] backing off {wait:.0f}s, then retrying the page after {after or 'start'}", flush=True)
            sleep(wait)
            brake_wait()

    def latest_run(self, statuses: str = "running,failed,stopped"):
        q = urlencode({"select": "*", "scope": f"eq.{SCOPE}", "status": f"in.({statuses})", "order": "started_at.desc", "limit": "1"})
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


def pass_is_fresh(complete: dict | None, refresh_days: float, now: float) -> bool:
    if not complete or not complete.get("finished_at") or refresh_days <= 0:
        return False
    finished = calendar.timegm(time.strptime(complete["finished_at"][:19], "%Y-%m-%dT%H:%M:%S"))
    return now - finished < refresh_days * 86400


def run(args, api: Api | None = None, brake=None, sleep=time.sleep) -> dict:
    if api is None:
        job_token = os.environ.get("SCORE_PRECOMPUTE_TOKEN", "")
        if len(job_token) < 32:
            raise SystemExit("SCORE_PRECOMPUTE_TOKEN is missing or shorter than 32 characters")
        api = Api(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"], job_token)
    if brake is None:
        brake = Brake(api.s, api.url, "scores", max_wait=BRAKE_MAX_WAIT, limits=brake_limits(args.max_active, args.max_query_seconds))
    breaker = Breaker("scores", limit=FAILURE_LIMIT)
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
    deadline = started + args.max_minutes * 60 if args.max_minutes else None
    status, reason, overloaded = "running", None, False

    def brake_wait() -> None:
        budget = brake_budget(deadline, time.time())
        brake.max_wait = budget
        try:
            brake.wait()
        except Overloaded as exc:
            if budget < BRAKE_MAX_WAIT:
                raise OutOfTime(f"--max-minutes (the database was still busy at the deadline: {exc})") from exc
            raise

    try:
        while True:
            out_of_time = deadline is not None and time.time() > deadline
            if (args.max_pages and pages >= args.max_pages) or out_of_time:
                status, reason = "stopped", "--max-minutes" if out_of_time else "--max-pages"
                api.update_run(run_row["id"], {"status": "stopped", "cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored})
                print(f"[scores] reached {reason}; stopping cleanly at {after}", flush=True)
                break
            brake_wait()
            res = api.score_page(after, args.limit, brake_wait, breaker, sleep=sleep)
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
                status = "complete"
                break
            sleep(args.pause)
    except (Overloaded, OutOfTime) as exc:
        overloaded = isinstance(exc, Overloaded)
        status, reason = "stopped", f"load stop: {exc}" if overloaded else str(exc)
        print(f"[scores] stopping cleanly ({reason}); the next run resumes after {after or 'start'}", flush=True)
        try:
            api.update_run(run_row["id"], {"status": "stopped", "error": reason[:500], "cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored})
        except Exception as save_exc:  # the database may be too busy to answer
            print(f"[scores] could not save the stop ({save_exc}); the run resumes from its last saved cursor", flush=True)
    except Exception as exc:
        api.update_run(run_row["id"], {"status": "failed", "error": str(exc)[:500], "cursor": after, "pages": pages, "rows_received": processed, "rows_written": scored})
        raise
    summary = {"scope": SCOPE, "status": status, "reason": reason, "overloaded": overloaded, "pages": pages, "processed": processed, "scored": scored, "cursor": after, "run_id": run_row["id"], "minutes": round((time.time() - started) / 60, 1)}
    print("[scores] summary " + json.dumps(summary), flush=True)
    if args.summary:
        with open(args.summary, "w") as fh:
            json.dump(summary, fh, indent=2)
    return summary


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--limit", type=int, default=1000, help="Parcels per scoring call (max 1000)")
    p.add_argument("--max-pages", type=int, default=0, help="Stop after this many calls (0 = no limit)")
    p.add_argument("--resume", action="store_true", help="Kept for older callers; unfinished runs are always resumed")
    p.add_argument("--refresh-days", type=float, default=25, help="Start a new full pass only when the last one is older than this (0 = always)")
    p.add_argument("--max-minutes", type=float, default=0, help="Stop cleanly after this many minutes (0 = no limit)")
    p.add_argument("--pause", type=float, default=0.5, help="Seconds to rest between scoring calls")
    p.add_argument("--max-active", type=int, default=LIMITS["max_active"], help="Wait while more than this many queries are active")
    p.add_argument("--max-query-seconds", type=float, default=LIMITS["max_query_seconds"], help="Wait while any query has run longer than this")
    p.add_argument("--summary", help="Write a JSON summary here")
    p.add_argument("--self-test", action="store_true", help="Check the retry, backoff, brake and stop rules offline, then exit")
    return p


def self_test() -> None:
    # Response classes and backoff.
    assert classify(200) == "ok"
    for code in FATAL_STATUSES:
        assert classify(code) == "fatal"
    for code in (500, 502, 503, 504, 429, 404, None):
        assert classify(code) == "retry", code
    assert [backoff_seconds(n) for n in (1, 2, 3, 7)] == [30, 60, 120, 120]
    assert backoff_seconds(1, 60) == 60, "the server's retry_after_seconds is honored"
    assert backoff_seconds(2, 10) == 60, "never shorter than the schedule"
    assert backoff_seconds(1, 10_000) == MAX_RETRY_AFTER, "the server cannot park the job forever"
    assert backoff_seconds(1, "soon") == 30 and backoff_seconds(1, float("nan")) == 30
    assert brake_budget(None, 0) == BRAKE_MAX_WAIT
    assert brake_budget(1000.0, 900.0) == 100.0 and brake_budget(1000.0, 1200.0) == 0.0, "the brake never waits past the deadline"

    # Brake limits: defaults are 5 and 5, the CLI flags feed the brake, and no answer is busy.
    defaults = build_parser().parse_args([])
    assert (defaults.max_active, defaults.max_query_seconds) == (5, 5.0)
    lim = brake_limits(defaults.max_active, defaults.max_query_seconds)
    clear = {"active": 2, "longest_seconds": 1.0, "io_waiting": 0, "lock_waiting": 0, "latency": 0.1}
    assert busy_reason(clear, lim) is None
    assert busy_reason({**clear, "active": 6}, lim) == "6 active queries"
    assert busy_reason({**clear, "longest_seconds": 5.5}, lim) is not None
    assert busy_reason({**clear, "active": 9}, brake_limits(10, 15)) is None, "--max-active reaches the brake"
    assert busy_reason(None, lim) is not None, "a load check that does not answer means busy"

    # score_page against a scripted endpoint: no network, no real sleeping.
    class Resp:
        def __init__(self, status: int, body):
            self.status_code, self._body = status, body
            self.text = body if isinstance(body, str) else json.dumps(body)

        def json(self):
            if isinstance(self._body, str):
                raise ValueError("not json")
            return self._body

    class Session:
        def __init__(self, script):
            self.script, self.calls, self.load_checks = list(script), [], []

        def post(self, url, data=None, headers=None, timeout=None):
            if url.endswith("/rest/v1/rpc/watchdog_db_load"):
                self.load_checks.append(len(self.calls))
                return Resp(200, clear)
            self.calls.append({"url": url, "body": json.loads(data), "timeout": timeout})
            step = self.script.pop(0)
            if isinstance(step, Exception):
                raise step
            return Resp(*step)

    evidence_down = (503, {"error": "subject_evidence_unavailable", "retry_after_seconds": 60})

    def page(after, n=1000, done=False):
        return (200, {"processed": n, "scored": n - 1, "next_after": after, "done": done})

    def harness(script):
        api = Api("https://example.invalid", "k" * 40, "t" * 40)
        api.s = Session(script)
        sleeps, brakes = [], []
        return api, sleeps, brakes, Breaker("self-test", limit=FAILURE_LIMIT)

    api, sleeps, brakes, br = harness([evidence_down, page("B")])
    res = api.score_page("A", 1000, lambda: brakes.append(1), br, sleep=sleeps.append)
    assert res["next_after"] == "B" and sleeps == [60] and len(brakes) == 1 and br.fails == 0
    assert all(c["timeout"] == CALL_TIMEOUT == 90 for c in api.s.calls)
    assert [c["body"]["after_pin"] for c in api.s.calls] == ["A", "A"], "a failed page is retried from the same cursor"

    api, sleeps, brakes, br = harness([requests.Timeout("read timed out"), (502, "<html>bad gateway</html>"), page("B")])
    assert api.score_page("A", 1000, lambda: brakes.append(1), br, sleep=sleeps.append)["next_after"] == "B"
    assert sleeps == [30, 60] and len(brakes) == 2, "timeouts and 502s back off 30s then 60s, braking before each retry"

    api, sleeps, brakes, br = harness([(500, {}), (504, "gateway timeout"), evidence_down, page("B")])
    try:
        api.score_page("A", 1000, lambda: brakes.append(1), br, sleep=sleeps.append)
    except Overloaded:
        pass
    else:
        raise AssertionError("three failures in a row must stop the job")
    assert len(api.s.calls) == 3 and sleeps == [30, 60] and len(brakes) == 2

    degraded = (200, {"processed": 1000, "scored": 1000, "next_after": "B", "done": False, "subject_evidence_status": "unavailable"})
    api, sleeps, brakes, br = harness([degraded, page("B")])
    assert api.score_page("A", 1000, lambda: brakes.append(1), br, sleep=sleeps.append).get("subject_evidence_status") is None
    assert sleeps == [30] and len(brakes) == 1, "a page scored without SR-1A evidence is retried, not accepted"

    api, sleeps, brakes, br = harness([(200, "not json"), page("B")])
    assert api.score_page("A", 1000, lambda: brakes.append(1), br, sleep=sleeps.append)["next_after"] == "B" and sleeps == [30]

    for code in FATAL_STATUSES:
        api, sleeps, brakes, br = harness([(code, {"error": "Server key required"})])
        try:
            api.score_page("A", 1000, lambda: brakes.append(1), br, sleep=sleeps.append)
        except RuntimeError as exc:
            assert not isinstance(exc, Overloaded) and sleeps == [] and brakes == []
        else:
            raise AssertionError(f"HTTP {code} must fail at once")

    # Whole runs with a fake progress table.
    class FakeApi(Api):
        def __init__(self, script, resume=None):
            super().__init__("https://example.invalid", "k" * 40, "t" * 40)
            self.s = Session(script)
            self.resume, self.patches = resume, []

        def latest_run(self, statuses="running,failed,stopped"):
            return self.resume if "running" in statuses else None

        def insert_run(self):
            return {"id": "run-1"}

        def update_run(self, run_id, patch):
            self.patches.append(patch)

    class FakeBrake:
        def __init__(self, busy_on=()):
            self.max_wait, self.calls, self.busy_on = BRAKE_MAX_WAIT, 0, set(busy_on)

        def wait(self):
            self.calls += 1
            if self.calls in self.busy_on:
                raise Overloaded(f"database still busy after {self.max_wait:.0f}s (6 active queries)")

    def go(script, resume=None, brake=None, extra=(), real_brake=False):
        api, sleeps = FakeApi(script, resume), []
        brake = None if real_brake else brake or FakeBrake()
        summary = run(build_parser().parse_args(["--pause", "0", *extra]), api=api, brake=brake, sleep=sleeps.append)
        return summary, api, brake

    summary, api, _ = go([page("A"), page("B", 10, done=True)], real_brake=True)
    assert summary["status"] == "complete" and api.s.load_checks == [0, 1], "the real brake checks the load before every page"

    summary, api, brake = go([page("A"), page("B", 10, done=True)])
    assert summary["status"] == "complete" and not summary["overloaded"] and exit_code(summary) == 0
    assert api.patches[-1]["status"] == "complete" and api.patches[-1]["cursor"] == "B" and brake.calls == 2

    summary, api, brake = go([page("A"), page("B"), evidence_down, evidence_down, evidence_down])
    assert summary["status"] == "stopped" and summary["overloaded"] and exit_code(summary) == EXIT_OVERLOADED
    assert summary["cursor"] == "B" and summary["pages"] == 2 and summary["processed"] == 2000
    last = api.patches[-1]
    assert last["status"] == "stopped" and last["cursor"] == "B" and "3 failures in a row" in last["error"]
    assert [p.get("cursor") for p in api.patches] == ["A", "B", "B"], "a failed page never moves the cursor"

    summary, api, brake = go([page("A"), degraded, degraded, degraded])
    assert summary["overloaded"] and summary["cursor"] == "A" and summary["pages"] == 1, "degraded pages never advance the cursor"

    resume = {"id": "run-9", "cursor": "M", "pages": 40, "rows_received": 40000, "rows_written": 39000}
    summary, api, brake = go([page("N")], resume=resume, brake=FakeBrake(busy_on={1}))
    assert summary["status"] == "stopped" and summary["overloaded"] and summary["cursor"] == "M" and summary["pages"] == 40
    assert api.s.calls == [], "no page is scored while the database is busy"
    assert api.patches[0] == {"status": "running", "error": None} and api.patches[-1]["status"] == "stopped" and "still busy" in api.patches[-1]["error"]

    summary, api, brake = go([page("A")], brake=FakeBrake(busy_on={1}), extra=["--max-minutes", "5"])
    assert summary["status"] == "stopped" and not summary["overloaded"] and exit_code(summary) == 0, "busy at the deadline is a time stop"
    assert summary["reason"].startswith("--max-minutes") and 0 < brake.max_wait <= 300 and api.s.calls == []

    summary, api, brake = go([page("A"), page("B")], extra=["--max-pages", "1"])
    assert summary["status"] == "stopped" and summary["reason"] == "--max-pages" and exit_code(summary) == 0

    try:
        go([page("A"), (401, {"error": "Server key required"})])
    except RuntimeError as exc:
        assert not isinstance(exc, Overloaded)
    else:
        raise AssertionError("a refused token must fail the run")

    print("precompute_scores self-test ok")


def main() -> int:
    args = build_parser().parse_args()
    if args.self_test:
        self_test()
        return 0
    return exit_code(run(args))


if __name__ == "__main__":
    sys.exit(main())
