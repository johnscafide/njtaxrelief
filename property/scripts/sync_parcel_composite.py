#!/usr/bin/env python3
"""Copy the NJ Office of GIS Parcels and MOD-IV Composite into property_lookups.

Watchdog's town comparisons read property_lookups, which only held parcels
someone had looked up. This loader pages through the state's official parcel
service (1,000 records per request, ordered by OBJECTID) and writes batches
through the service-only sync_parcel_batch() database function.

- Privacy: owner names and owner mailing addresses are never requested.
- Polite: at most --rps requests per second to the state service.
- Resumable: progress is saved in parcel_sync_runs after every page; a new run
  for the same scope continues from the last saved OBJECTID.
- Gentle on the database: every batch write waits for the shared brake
  (db_brake.py). A failed write backs off before it is retried or split, and
  BREAKER_LIMIT failures in a row stop the run (status "stopped", exit code 2)
  with its progress saved. sync_parcel_batch() skips parcels that have not
  changed, so rows_written counts only rows the database really wrote.
- Scope: --county limits the run to one county (use it for the first check).

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (not needed for --dry-run
or --self-test).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import date
from urllib.parse import urlencode

import requests

from db_brake import Brake, Breaker, Overloaded

SERVICE = "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query"
SOURCE = "NJ Office of GIS Parcels and MOD-IV Composite"
PAGE_SIZE = 1000
BATCH = 500
MIN_BATCH = 50
# A write that timed out may still be running on the server. On 2026-09-30
# resending at once (halved) stacked lock waits until the database went down,
# so a failed write first backs off (15 s, 30 s, 60 s, then 120 s) and waits
# for the brake; BREAKER_LIMIT failures in a row stop the run.
BACKOFF_FIRST = 15.0
BACKOFF_MAX = 120.0
BREAKER_LIMIT = 4
# Owner fields are deliberately absent: OWNER_NAME and the owner's mailing
# address (ST_ADDRESS, CITY_STATE, ZIP5, ZIP_CODE, ZIP_PLUS4). ZIP5/ZIP_CODE
# are the owner's mailing ZIP, not the property's, so no ZIP is loaded.
OUT_FIELDS = [
    "OBJECTID", "PAMS_PIN", "PCLBLOCK", "PCLLOT", "PCLQCODE", "COUNTY", "MUN_NAME", "PROP_CLASS",
    "PROP_LOC", "LAND_VAL", "IMPRVT_VAL", "NET_VALUE", "LAST_YR_TX", "BLDG_DESC",
    "CALC_ACRE", "YR_CONSTR", "SALE_PRICE", "DEED_DATE", "SALES_CODE", "DWELL", "COMM_DWELL",
]
FORBIDDEN_FIELDS = {"OWNER_NAME", "ST_ADDRESS", "CITY_STATE", "ZIP5", "ZIP_CODE", "ZIP_PLUS4"}


def clean(value, limit=220):
    text = "" if value is None else str(value).strip()
    return text[:limit] or None


def num(value):
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n else None  # drop NaN


def whole(value):
    n = num(value)
    return int(round(n)) if n is not None else None


def deed_date(value, today: date | None = None):
    """MOD-IV DEED_DATE is YYMMDD (some counties MMDDYY or YYYYMMDD).

    Same century rule as workbench-hydrate saleYear(): YY > 40 is 19YY.
    Impossible or future dates return None; never a guess.
    """
    today = today or date.today()
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())

    def ok(y, m, d):
        try:
            out = date(y, m, d)
        except ValueError:
            return None
        return out if 1800 <= y and out <= today else None

    if len(digits) == 6:
        yy, mm, dd = int(digits[:2]), int(digits[2:4]), int(digits[4:])
        hit = ok((1900 if yy > 40 else 2000) + yy, mm, dd)
        if hit:
            return hit
        mm, dd, yy = int(digits[:2]), int(digits[2:4]), int(digits[4:])
        return ok((1900 if yy > 40 else 2000) + yy, mm, dd)
    if len(digits) == 8:
        return ok(int(digits[:4]), int(digits[4:6]), int(digits[6:])) or ok(int(digits[4:]), int(digits[:2]), int(digits[2:4]))
    return None


NJ_BOUNDS = (38.8, 41.4, -75.7, -73.8)  # lat min, lat max, lon min, lon max


def centroid(geometry: dict | None) -> tuple[float, float] | None:
    """Area centroid (lat, lon) of a parcel polygon returned in WGS84 (outSR 4326).

    Uses the signed shoelace formula over every ring, so holes subtract and
    multi-part parcels are weighted by area. A zero-area shape falls back to
    the mean of its vertices. Anything outside New Jersey returns None, never
    a guess. Rounded to 6 decimals (about 0.1 m), so an unchanged parcel gives
    the same point every month and sync_parcel_batch() skips it.
    """
    rings = (geometry or {}).get("rings") or []
    area = cx = cy = 0.0
    xs, ys = [], []
    for ring in rings:
        pts = [(float(p[0]), float(p[1])) for p in ring if isinstance(p, (list, tuple)) and len(p) >= 2]
        if len(pts) < 3:
            continue
        x0, y0 = pts[0]  # shift to the first vertex for floating point stability
        for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1]):
            xa, ya, xb, yb = xa - x0, ya - y0, xb - x0, yb - y0
            cross = xa * yb - xb * ya
            area += cross
            cx += (xa + xb + 3 * x0) * cross
            cy += (ya + yb + 3 * y0) * cross
        xs.extend(x for x, _ in pts)
        ys.extend(y for _, y in pts)
    if not xs:
        return None
    if abs(area) > 1e-14:
        lon, lat = cx / (3 * area), cy / (3 * area)
    else:
        lon, lat = sum(xs) / len(xs), sum(ys) / len(ys)
    if not (NJ_BOUNDS[0] <= lat <= NJ_BOUNDS[1] and NJ_BOUNDS[2] <= lon <= NJ_BOUNDS[3]):
        return None
    return round(lat, 6), round(lon, 6)


def normalize(a: dict, geometry: dict | None = None) -> dict | None:
    pin = clean(a.get("PAMS_PIN"), 80)
    if not pin or len(pin) < 6 or not pin[:4].isdigit() or pin[4] != "_":
        return None
    sold = deed_date(a.get("DEED_DATE"))
    dwell = whole(a.get("DWELL"))
    point = centroid(geometry)
    return {
        "pams_pin": pin,
        "address": clean(a.get("PROP_LOC")) or "",
        "town": clean(a.get("MUN_NAME"), 140),
        "county": clean(a.get("COUNTY"), 100),
        "block": clean(a.get("PCLBLOCK"), 40),
        "lot": clean(a.get("PCLLOT"), 40),
        "qualifier": clean(a.get("PCLQCODE"), 40),
        "prop_class": clean(a.get("PROP_CLASS"), 12),
        "year_built": whole(a.get("YR_CONSTR")) or None,
        "acres": num(a.get("CALC_ACRE")),
        "dwelling_units": dwell if dwell is not None else whole(a.get("COMM_DWELL")),
        "building_desc": clean(a.get("BLDG_DESC")),
        "land_value": whole(a.get("LAND_VAL")),
        "improvement_value": whole(a.get("IMPRVT_VAL")),
        "assessed_value": whole(a.get("NET_VALUE")),
        "last_year_tax": num(a.get("LAST_YR_TX")),
        "last_sale_price": whole(a.get("SALE_PRICE")) or None,  # the state reports "no sale" as 0
        "last_sale_year": sold.year if sold else None,
        "last_sale_date": sold.isoformat() if sold else None,
        "sales_code": clean(a.get("SALES_CODE"), 20),
        "lat": point[0] if point else None,
        "lon": point[1] if point else None,
    }


def write_failure_kind(exc: Exception) -> str | None:
    """Name a failed batch write, or None when retrying cannot help (e.g. a 400)."""
    if isinstance(exc, requests.Timeout):
        return "client timeout"
    if isinstance(exc, requests.RequestException):
        return "connection error"
    text = str(exc)
    if "57014" in text or "statement timeout" in text.lower():
        return "statement timeout"
    status = re.match(r"rpc \S+ (\d{3})\b", text)
    if status and status.group(1).startswith("5"):
        return "server error"
    return None


def after_write_failure(kind: str | None, rows: int, failures: int) -> tuple[str, float]:
    """What to do after the `failures`-th failed write in a row.

    Returns (action, pause). "raise": not retryable. Otherwise pause for
    `pause` seconds, wait for the brake, then "split" the batch (a statement
    timeout on more than MIN_BATCH rows) or "retry" it as it is (server errors
    and client timeouts point at load, not batch size). Never resends at once.
    The Breaker, not this function, decides when to give up.
    """
    if kind is None:
        return "raise", 0.0
    pause = min(BACKOFF_FIRST * 2 ** max(failures - 1, 0), BACKOFF_MAX)
    return ("split" if kind == "statement timeout" and rows > MIN_BATCH else "retry"), pause


class Supabase:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        self.brake = Brake(self.s, self.url, "sync")
        self.breaker = Breaker("sync", limit=BREAKER_LIMIT)
        self.sleep = time.sleep

    def rpc(self, name: str, payload: dict):
        r = self.s.post(f"{self.url}/rest/v1/rpc/{name}", data=json.dumps(payload), timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"rpc {name} {r.status_code}: {r.text[:300]}")
        return r.json()

    def write_rows(self, rows: list[dict]) -> int:
        """Write a batch without piling onto a struggling database.

        Every attempt waits for the shared brake first. The database gives each
        write 8 seconds, and a write that timed out may still be running there,
        so a failed write is never resent at once: it backs off, waits for the
        brake, then is retried or, after a statement timeout, halved (down to
        MIN_BATCH rows). BREAKER_LIMIT failures in a row raise Overloaded
        instead of splitting forever; run() then saves progress and stops.
        """
        while True:
            self.brake.wait()
            try:
                written = int(self.rpc("sync_parcel_batch", {"p_rows": rows}) or 0)
            except (RuntimeError, requests.RequestException) as exc:
                kind = write_failure_kind(exc)
                action, pause = after_write_failure(kind, len(rows), self.breaker.fails + 1)
                if action == "raise":
                    raise
                self.breaker.fail(f"{kind} writing {len(rows)} rows: {str(exc)[:200]}")
                print(f"[sync] {kind} writing {len(rows)} rows; backing off {pause:.0f}s, then {'splitting' if action == 'split' else 'retrying'}", flush=True)
                self.sleep(pause)
                if action == "split":
                    mid = len(rows) // 2
                    return self.write_rows(rows[:mid]) + self.write_rows(rows[mid:])
                continue
            self.breaker.ok()
            return written

    def select_run(self, scope: str):
        q = urlencode({"select": "*", "scope": f"eq.{scope}", "status": "in.(running,failed,stopped)", "order": "started_at.desc", "limit": "1"})
        r = self.s.get(f"{self.url}/rest/v1/parcel_sync_runs?{q}", timeout=60)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def insert_run(self, row: dict):
        r = self.s.post(f"{self.url}/rest/v1/parcel_sync_runs", data=json.dumps(row), headers={"Prefer": "return=representation"}, timeout=60)
        r.raise_for_status()
        return r.json()[0]

    def update_run(self, run_id: str, patch: dict):
        patch = {**patch, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        r = self.s.patch(f"{self.url}/rest/v1/parcel_sync_runs?id=eq.{run_id}", data=json.dumps(patch), timeout=60)
        r.raise_for_status()


def where_clause(county: str | None, after: int) -> str:
    base = f"OBJECTID > {int(after)}"
    if county:
        safe = county.upper().replace("'", "''")
        base += f" AND UPPER(COUNTY) = '{safe}'"
    return base


def fetch_json(session: requests.Session, params: dict, tries: int = 5):
    delay = 2.0
    for attempt in range(tries):
        try:
            r = session.get(SERVICE, params=params, timeout=90)
            if r.status_code == 200:
                data = r.json()
                if "error" not in data:
                    return data
                err = data["error"]
            else:
                err = f"HTTP {r.status_code}"
        except (requests.RequestException, ValueError) as exc:
            err = str(exc)
        if attempt == tries - 1:
            raise RuntimeError(f"state parcel service failed: {err}")
        time.sleep(delay)
        delay *= 2
    raise RuntimeError("unreachable")


def save_progress(db, run_row, patch: dict) -> None:
    """Best effort: a failed save must not hide why the run stopped.

    Progress is also saved after every page, so the last saved OBJECTID
    still holds when this one cannot be written.
    """
    if not (db and run_row):
        return
    try:
        db.update_run(run_row["id"], patch)
    except Exception as exc:  # noqa: BLE001 - report and keep the original error
        print(f"[sync] could not save progress ({str(exc)[:200]}); the last saved OBJECTID still holds", flush=True)


def run(args, db: Supabase | None = None, fetch=fetch_json) -> dict:
    scope = f"county:{args.county.upper()}" if args.county else "statewide"
    http = requests.Session()
    http.headers.update({"User-Agent": "WatchdogParcelSync/1.0 (+https://www.watchdogindex.com)"})
    count = fetch(http, {"where": where_clause(args.county, 0), "returnCountOnly": "true", "f": "json"})["count"]
    print(f"[sync] {scope}: state service reports {count:,} parcels", flush=True)

    if args.dry_run:
        db = None
    elif db is None:
        db = Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    run_row, after = None, 0
    if db:
        previous = db.select_run(scope) if args.resume else None
        if previous:
            run_row, after = previous, int(previous.get("last_objectid") or 0)
            db.update_run(run_row["id"], {"status": "running", "error": None, "source_count": count})
            print(f"[sync] resuming run {run_row['id']} after OBJECTID {after:,}", flush=True)
        else:
            run_row = db.insert_run({"source": SOURCE, "scope": scope, "status": "running", "source_count": count})
            print(f"[sync] started run {run_row['id']}", flush=True)

    pages = int(run_row.get("pages") or 0) if run_row else 0
    received = int(run_row.get("rows_received") or 0) if run_row else 0
    written = int(run_row.get("rows_written") or 0) if run_row else 0
    gap = 1.0 / max(args.rps, 0.1)
    started = time.time()
    overloaded = None
    try:
        while True:
            if args.max_pages and pages >= args.max_pages:
                print("[sync] reached --max-pages; stopping cleanly", flush=True)
                if db:
                    db.update_run(run_row["id"], {"status": "stopped", "last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
                break
            t0 = time.time()
            data = fetch(http, {
                "where": where_clause(args.county, after),
                "outFields": ",".join(OUT_FIELDS),
                "orderByFields": "OBJECTID ASC",
                "resultRecordCount": str(PAGE_SIZE),
                # Parcel shapes in WGS84, only to compute each parcel's center
                # point (lat/lon) for nearby sales and neighborhood lookups.
                "returnGeometry": "true",
                "outSR": "4326",
                "geometryPrecision": "6",
                "f": "json",
            })
            features = data.get("features") or []
            if not features:
                if db:
                    db.update_run(run_row["id"], {"status": "complete", "last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written, "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
                break
            attrs = [f.get("attributes") or {} for f in features]
            leaked = FORBIDDEN_FIELDS.intersection(*[set(a) for a in attrs[:1]])
            if leaked:
                raise RuntimeError(f"owner fields returned unexpectedly: {sorted(leaked)}")
            page_last = max(int(a.get("OBJECTID") or 0) for a in attrs)
            rows = [r for r in (normalize(f.get("attributes") or {}, f.get("geometry")) for f in features) if r]
            if db:
                for i in range(0, len(rows), BATCH):
                    written += db.write_rows(rows[i:i + BATCH])
            # The cursor moves only once the whole page is written, so a run
            # stopped mid-page re-reads that page instead of skipping its rest.
            after = page_last
            received += len(attrs)
            pages += 1
            if db:
                db.update_run(run_row["id"], {"last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
            if pages % 25 == 0 or pages == 1:
                rate = received / max(time.time() - started, 1)
                print(f"[sync] page {pages:,}: {received:,}/{count:,} received, {written:,} written, OBJECTID {after:,}, {rate:,.0f} rows/s", flush=True)
            wait = gap - (time.time() - t0)
            if wait > 0:
                time.sleep(wait)
    except Overloaded as exc:
        overloaded = exc
        print(f"[sync] stopping to protect the database: {exc}; progress saved at OBJECTID {after:,}", flush=True)
        save_progress(db, run_row, {"status": "stopped", "error": f"database overloaded: {exc}"[:500], "last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
    except Exception as exc:
        save_progress(db, run_row, {"status": "failed", "error": str(exc)[:500], "last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
        raise

    summary = {"scope": scope, "source": SOURCE, "source_count": count, "pages": pages, "rows_received": received, "rows_written": written, "last_objectid": after, "run_id": run_row["id"] if run_row else None, "dry_run": bool(args.dry_run), "minutes": round((time.time() - started) / 60, 1)}
    if overloaded:
        summary["stopped"] = f"database overloaded: {overloaded}"
    print("[sync] summary " + json.dumps(summary), flush=True)
    if args.summary:
        with open(args.summary, "w") as fh:
            json.dump(summary, fh, indent=2)
    if overloaded:
        raise overloaded
    return summary


def self_test() -> None:
    today = date(2026, 9, 28)
    assert deed_date("230509", today) == date(2023, 5, 9)
    assert deed_date("050923", today) == date(2005, 9, 23)  # YYMMDD first
    assert deed_date("991231", today) == date(1999, 12, 31)
    assert deed_date("20230509", today) == date(2023, 5, 9)
    assert deed_date("270101", today) is None  # future, never a guess
    assert deed_date("", today) is None
    row = normalize({"OBJECTID": 7, "PAMS_PIN": "0904_9_20", "PROP_LOC": "102 GRANT AVE", "MUN_NAME": "HARRISON TOWN", "COUNTY": "HUDSON", "PROP_CLASS": "2", "NET_VALUE": 424300, "LAST_YR_TX": 9876.5, "SALE_PRICE": 1, "DEED_DATE": "230509", "SALES_CODE": "10", "OWNER_NAME": "SHOULD NOT APPEAR"})
    assert row["pams_pin"] == "0904_9_20" and row["assessed_value"] == 424300 and row["last_sale_year"] == 2023
    assert row["last_sale_date"] == "2023-05-09" and row["sales_code"] == "10"
    assert not any("owner" in k for k in row), "owner fields are never stored"
    assert "zip" not in row, "parcel ZIP5/ZIP_CODE is the owner mailing ZIP and is never stored"
    assert not {"ZIP5", "ZIP_CODE"}.intersection(OUT_FIELDS), "mailing ZIP fields are never requested"
    assert normalize({"PAMS_PIN": "0901_7_1.01", "SALE_PRICE": 0})["last_sale_price"] is None, "no sale is blank, not $0"
    assert normalize({"PAMS_PIN": ""}) is None and normalize({"PAMS_PIN": "BAD"}) is None
    assert not FORBIDDEN_FIELDS.intersection(OUT_FIELDS)
    assert "UPPER(COUNTY) = 'O''BRIEN'" in where_clause("o'brien", 5)

    # Parcel center points: area centroid in WGS84, NJ only, stable to 6 decimals.
    square = {"rings": [[[-74.0, 40.0], [-74.0, 40.002], [-73.998, 40.002], [-73.998, 40.0], [-74.0, 40.0]]]}
    assert centroid(square) == (40.001, -73.999)
    ell = {"rings": [[[-74.5, 40.5], [-74.5, 40.503], [-74.499, 40.503], [-74.499, 40.501], [-74.497, 40.501], [-74.497, 40.5], [-74.5, 40.5]]]}
    # 1x3 bar (centroid 0.5, 1.5) plus 2x1 foot (2, 0.5), in 0.001-degree units:
    # x = (3*0.5 + 2*2) / 5 = 1.1 and y = (3*1.5 + 2*0.5) / 5 = 1.1.
    assert centroid(ell) == (40.5011, -74.4989), centroid(ell)
    holed = {"rings": [square["rings"][0], [[-74.0, 40.0], [-73.999, 40.0], [-73.999, 40.001], [-74.0, 40.001], [-74.0, 40.0]]]}
    hlat, hlon = centroid(holed)  # the hole (counter-clockwise) removes the south-west quarter
    assert hlat > 40.001 and hlon > -73.999, (hlat, hlon)
    two = {"rings": [square["rings"][0], [[-73.99, 40.0], [-73.99, 40.002], [-73.988, 40.002], [-73.988, 40.0], [-73.99, 40.0]]]}
    assert centroid(two) == (40.001, -73.994), "multi-part parcels are weighted by area"
    assert centroid({"rings": [[[-74.2, 40.1], [-74.2, 40.1], [-74.2, 40.1]]]}) == (40.1, -74.2), "zero-area shape: vertex mean"
    assert centroid({"rings": [[[2.35, 48.85], [2.35, 48.86], [2.36, 48.86], [2.35, 48.85]]]}) is None, "outside NJ: none, never a guess"
    assert centroid(None) is None and centroid({}) is None and centroid({"rings": [[[-74, 40]]]}) is None
    with_point = normalize({"PAMS_PIN": "0904_9_20"}, square)
    assert (with_point["lat"], with_point["lon"]) == (40.001, -73.999)
    no_point = normalize({"PAMS_PIN": "0904_9_20"})
    assert no_point["lat"] is None and no_point["lon"] is None, "no shape: blank, the stored point is kept"

    # Failed writes: classify, back off, never resend at once.
    timeout_500 = 'rpc sync_parcel_batch 500: {"code":"57014","message":"canceling statement due to statement timeout"}'
    assert write_failure_kind(RuntimeError(timeout_500)) == "statement timeout"
    assert write_failure_kind(RuntimeError("rpc sync_parcel_batch 503: upstream connect error")) == "server error"
    assert write_failure_kind(RuntimeError("rpc sync_parcel_batch 400: bad input")) is None
    assert write_failure_kind(RuntimeError("rpc sync_parcel_batch 404: Could not find the function")) is None
    assert write_failure_kind(requests.ReadTimeout("read timed out")) == "client timeout"
    assert write_failure_kind(requests.ConnectionError("reset")) == "connection error"
    assert after_write_failure(None, 500, 1) == ("raise", 0.0)
    assert after_write_failure("statement timeout", 500, 1) == ("split", 15.0)
    assert after_write_failure("statement timeout", 250, 2) == ("split", 30.0)
    assert after_write_failure("statement timeout", MIN_BATCH, 3) == ("retry", 60.0), "never split below MIN_BATCH"
    assert after_write_failure("server error", 500, 1) == ("retry", 15.0), "a 5xx means load, not batch size"
    assert after_write_failure("client timeout", 500, 4) == ("retry", 120.0)
    assert after_write_failure("connection error", 500, 9) == ("retry", BACKOFF_MAX), "backoff is capped"
    assert all(after_write_failure(k, n, f)[1] >= BACKOFF_FIRST for k in ("statement timeout", "server error", "client timeout") for n in (50, 500) for f in (0, 1, 5))

    class FakeBrake:
        def __init__(self, log, trip_after=None):
            self.log, self.trip_after, self.calls = log, trip_after, 0
        def wait(self):
            self.calls += 1
            self.log.append("brake")
            if self.trip_after is not None and self.calls > self.trip_after:
                raise Overloaded("database still busy after 900s (7 queries waiting on disk)")

    class FakeDb(Supabase):
        def __init__(self, fail=None, brake_trips_after=None):
            self.log, self.fail = [], fail or (lambda n, call: None)
            self.brake = FakeBrake(self.log, brake_trips_after)
            self.breaker = Breaker("sync-test", limit=BREAKER_LIMIT)
            self.sleep = lambda s: self.log.append(("sleep", s))
        def rpc(self, name, payload):
            n = len(payload["p_rows"])
            calls = sum(1 for e in self.log if isinstance(e, tuple) and e[0] == "rpc")
            self.log.append(("rpc", n))
            err = self.fail(n, calls)
            if err:
                raise err
            return n
        def rpcs(self):
            return [e[1] for e in self.log if isinstance(e, tuple) and e[0] == "rpc"]
        def sleeps(self):
            return [e[1] for e in self.log if isinstance(e, tuple) and e[0] == "sleep"]

    def resends_wait(log):
        """Every rpc after a failure is preceded by a backoff sleep and then a brake check."""
        rpc_at = [i for i, e in enumerate(log) if isinstance(e, tuple) and e[0] == "rpc"]
        for prev, cur in zip(rpc_at, rpc_at[1:]):
            between = log[prev + 1:cur]
            if any(isinstance(e, tuple) and e[0] == "sleep" for e in between):
                assert between[-1] == "brake", "the brake is checked right before a resend"
        return True

    batch = [{"pams_pin": f"0101_{i}_1"} for i in range(500)]
    fake = FakeDb(fail=lambda n, call: RuntimeError(timeout_500) if n > 125 else None)
    assert fake.write_rows(batch) == 500, "slow batches split and still write every row"
    assert fake.rpcs() == [500, 250, 125, 125, 250, 125, 125], fake.rpcs()
    assert fake.sleeps() == [15.0, 30.0, 15.0], "backs off before every split; a success resets the backoff"
    assert fake.log[0] == "brake" and fake.log.count("brake") == len(fake.rpcs()), "every attempt waits for the brake"
    assert resends_wait(fake.log)

    fake = FakeDb(fail=lambda n, call: RuntimeError(timeout_500))
    try:
        fake.write_rows(batch)
        raise AssertionError("endless statement timeouts must stop the run")
    except Overloaded as exc:
        assert "4 failures in a row" in str(exc) and "statement timeout" in str(exc)
    assert fake.rpcs() == [500, 250, 125, 62], "stops after BREAKER_LIMIT failures instead of splitting down forever"
    assert fake.sleeps() == [15.0, 30.0, 60.0] and resends_wait(fake.log)

    fake = FakeDb(fail=lambda n, call: RuntimeError("rpc sync_parcel_batch 503: upstream connect error"))
    try:
        fake.write_rows(batch)
        raise AssertionError("a database that keeps failing must stop the run")
    except Overloaded:
        pass
    assert fake.rpcs() == [500] * BREAKER_LIMIT, "server errors retry the same batch, never split"
    assert fake.sleeps() == [15.0, 30.0, 60.0]

    fake = FakeDb(fail=lambda n, call: requests.ReadTimeout("read timed out") if call == 0 else None)
    assert fake.write_rows(batch) == 500
    assert fake.rpcs() == [500, 500] and fake.sleeps() == [15.0] and resends_wait(fake.log), "a client timeout backs off, then resends the same rows"
    assert fake.breaker.fails == 0, "a success resets the breaker"

    fake = FakeDb(fail=lambda n, call: RuntimeError("rpc sync_parcel_batch 400: bad input"))
    try:
        fake.write_rows([{"pams_pin": "0101_1_1"}])
        raise AssertionError("non-retryable errors must surface")
    except RuntimeError as exc:
        assert "400" in str(exc) and not isinstance(exc, Overloaded)
    assert fake.rpcs() == [1] and fake.sleeps() == [] and fake.breaker.fails == 0

    fake = FakeDb(brake_trips_after=0)
    try:
        fake.write_rows(batch)
        raise AssertionError("a database that stays busy must stop the run")
    except Overloaded:
        pass
    assert fake.rpcs() == [], "nothing is written while the brake says busy"

    # run(): Overloaded saves the cursor of the last fully written page, marks
    # the run stopped with the reason, writes the summary, and re-raises.
    def page(first, n):
        return {"features": [{"attributes": {"OBJECTID": first + i, "PAMS_PIN": f"0904_9_{first + i}", "PROP_LOC": f"{first + i} GRANT AVE"}} for i in range(n)]}

    def fake_fetch(session, params):
        if params.get("returnCountOnly"):
            return {"count": 6}
        after = int(params["where"].split("OBJECTID > ")[1].split()[0])
        return page(after + 1, 3) if after < 6 else {"features": []}

    class RunDb(FakeDb):
        def __init__(self):
            super().__init__(brake_trips_after=1)
            self.patches = []
        def select_run(self, scope):
            return None
        def insert_run(self, row):
            return {"id": "run-1", **row}
        def update_run(self, run_id, patch):
            self.patches.append(patch)

    import tempfile
    db = RunDb()
    with tempfile.TemporaryDirectory() as tmp:
        summary_path = os.path.join(tmp, "summary.json")
        args = argparse.Namespace(county=None, max_pages=0, rps=1000.0, resume=False, dry_run=False, summary=summary_path)
        try:
            run(args, db=db, fetch=fake_fetch)
            raise AssertionError("run must re-raise Overloaded")
        except Overloaded:
            pass
        with open(summary_path) as fh:
            summary = json.load(fh)
    last = db.patches[-1]
    assert last["status"] == "stopped" and last["error"].startswith("database overloaded: database still busy"), last
    assert last["last_objectid"] == 3 and last["pages"] == 1 and last["rows_received"] == 3 and last["rows_written"] == 3, "cursor stays at the last fully written page"
    assert summary["last_objectid"] == 3 and summary["stopped"].startswith("database overloaded"), summary
    print("sync_parcel_composite self-test passed")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--county", help="Limit to one county, e.g. HUDSON")
    p.add_argument("--max-pages", type=int, default=0, help="Stop after this many pages (0 = no limit)")
    p.add_argument("--rps", type=float, default=3.0, help="Max requests per second to the state service")
    p.add_argument("--resume", action="store_true", help="Continue the latest unfinished run for this scope")
    p.add_argument("--dry-run", action="store_true", help="Read from the state service only; write nothing")
    p.add_argument("--summary", help="Write a JSON summary here")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        self_test()
        return 0
    try:
        run(args)
    except Overloaded as exc:
        print(f"::error::Statewide parcel sync stopped to protect the database: {exc}. Progress is saved; run it again with --resume (workflow: what=parcels, resume=true) once the database is quiet.", flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
