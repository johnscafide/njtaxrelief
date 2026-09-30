"""Shared database brake for Watchdog's long batch jobs.

Used by sync_parcel_composite.py (statewide parcel sync) and
precompute_scores.py (Watchdog Score precompute).

On Sep 30 2026 both jobs kept writing while the database ran out of IO: the
old brake only looked at the number of active queries and the longest one,
every batch query was being cancelled at the 8 s statement timeout (so the
15 s rule never fired), and a load check that did not answer counted as "not
busy". This brake fails closed:

- no answer, or an answer slower than max_latency, means busy;
- queries waiting on IO or locks count, not just active ones;
- a job that is still told to wait after max_wait stops (Overloaded) instead
  of carrying on;
- Breaker stops a job after a run of consecutive failures.
"""
from __future__ import annotations

import time

import requests


class Overloaded(RuntimeError):
    """The database stayed busy, or kept failing; stop the job and resume later."""


LIMITS = {
    "max_active": 5,
    "max_query_seconds": 5.0,
    "max_io_waiting": 3,
    "max_lock_waiting": 2,
    "max_latency": 2.0,
}


def read_load(session: requests.Session, url: str, timeout: float = 20.0) -> dict | None:
    """Call watchdog_db_load and time the call. None on any failure."""
    started = time.monotonic()
    try:
        r = session.post(f"{url.rstrip('/')}/rest/v1/rpc/watchdog_db_load", data="{}", timeout=timeout)
    except requests.RequestException:
        return None
    latency = time.monotonic() - started
    if r.status_code != 200:
        return None
    try:
        load = r.json()
    except ValueError:
        return None
    if not isinstance(load, dict):
        return None
    return {**load, "latency": latency}


def busy_reason(load: dict | None, limits: dict | None = None) -> str | None:
    """Why the database looks busy, or None when it is clear."""
    lim = {**LIMITS, **(limits or {})}
    if not load:
        return "the load check did not answer"
    if float(load.get("latency") or 0) > lim["max_latency"]:
        return f"the load check took {float(load['latency']):.1f}s"
    if int(load.get("active") or 0) > lim["max_active"]:
        return f"{int(load['active'])} active queries"
    if float(load.get("longest_seconds") or 0) > lim["max_query_seconds"]:
        return f"a query has run {float(load['longest_seconds']):.0f}s"
    if int(load.get("io_waiting") or 0) >= lim["max_io_waiting"]:
        return f"{int(load['io_waiting'])} queries waiting on disk"
    if int(load.get("lock_waiting") or 0) >= lim["max_lock_waiting"]:
        return f"{int(load['lock_waiting'])} queries waiting on locks"
    return None


class Brake:
    """Wait while the database is busy; stop the job if it stays busy."""

    def __init__(self, session: requests.Session, url: str, label: str, max_wait: float = 900, poll: float = 20, limits: dict | None = None):
        self.session, self.url, self.label = session, url, label
        self.max_wait, self.poll, self.limits = max_wait, poll, limits
        self.waits = 0

    def wait(self) -> None:
        waited = 0.0
        while True:
            reason = busy_reason(read_load(self.session, self.url), self.limits)
            if not reason:
                return
            if waited >= self.max_wait:
                raise Overloaded(f"database still busy after {waited:.0f}s ({reason})")
            self.waits += 1
            print(f"[{self.label}] database busy ({reason}); waiting {self.poll:.0f}s", flush=True)
            time.sleep(self.poll)
            waited += self.poll


class Breaker:
    """Stop after `limit` consecutive failures; any success resets it."""

    def __init__(self, label: str, limit: int = 3):
        self.label, self.limit, self.fails = label, limit, 0

    def ok(self) -> None:
        self.fails = 0

    def fail(self, err: str) -> None:
        self.fails += 1
        print(f"[{self.label}] failure {self.fails}/{self.limit}: {err}", flush=True)
        if self.fails >= self.limit:
            raise Overloaded(f"{self.fails} failures in a row; last: {err}")


def self_test() -> None:
    assert busy_reason(None) == "the load check did not answer"
    clear = {"active": 1, "longest_seconds": 0.4, "io_waiting": 0, "lock_waiting": 0, "latency": 0.08}
    assert busy_reason(clear) is None
    assert busy_reason({**clear, "latency": 3.1}).startswith("the load check took")
    assert busy_reason({**clear, "active": 6}) == "6 active queries"
    assert busy_reason({**clear, "longest_seconds": 7.9}) == "a query has run 8s"
    assert busy_reason({**clear, "io_waiting": 3}) == "3 queries waiting on disk"
    assert busy_reason({**clear, "lock_waiting": 2}) == "2 queries waiting on locks"
    assert busy_reason({"active": 1, "longest_seconds": 0}) is None, "v1 answers (no io/lock fields) still work"
    b = Breaker("test", limit=3)
    b.fail("x"); b.ok(); b.fail("x"); b.fail("x")
    try:
        b.fail("x")
    except Overloaded:
        pass
    else:
        raise AssertionError("breaker must trip on the third failure in a row")
    print("db_brake self-test ok")


if __name__ == "__main__":
    self_test()
