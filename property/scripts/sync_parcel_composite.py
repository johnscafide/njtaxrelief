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
- Scope: --county limits the run to one county (use it for the first check).

Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (not needed for --dry-run
or --self-test).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date
from urllib.parse import urlencode

import requests

SERVICE = "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query"
SOURCE = "NJ Office of GIS Parcels and MOD-IV Composite"
PAGE_SIZE = 1000
BATCH = 500
MIN_BATCH = 50
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


def normalize(a: dict) -> dict | None:
    pin = clean(a.get("PAMS_PIN"), 80)
    if not pin or len(pin) < 6 or not pin[:4].isdigit() or pin[4] != "_":
        return None
    sold = deed_date(a.get("DEED_DATE"))
    dwell = whole(a.get("DWELL"))
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
    }


class Supabase:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def rpc(self, name: str, payload: dict):
        r = self.s.post(f"{self.url}/rest/v1/rpc/{name}", data=json.dumps(payload), timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"rpc {name} {r.status_code}: {r.text[:300]}")
        return r.json()

    def write_rows(self, rows: list[dict], tries: int = 4) -> int:
        """Write a batch; on a timeout or server error, pause and split it.

        The database gives each write 8 seconds. As property_lookups grows,
        an occasional large batch runs longer, so it is halved and retried
        (down to MIN_BATCH rows) instead of stopping the whole sync.
        """
        delay = 2.0
        for attempt in range(tries):
            try:
                return int(self.rpc("sync_parcel_batch", {"p_rows": rows}) or 0)
            except (RuntimeError, requests.RequestException) as exc:
                text = str(exc)
                retryable = "57014" in text or "timeout" in text.lower() or " 5" in text[:40] or isinstance(exc, requests.RequestException)
                if not retryable:
                    raise
                if len(rows) > MIN_BATCH:
                    mid = len(rows) // 2
                    print(f"[sync] slow write of {len(rows)} rows; splitting", flush=True)
                    return self.write_rows(rows[:mid]) + self.write_rows(rows[mid:])
                if attempt == tries - 1:
                    raise
                time.sleep(delay)
                delay *= 2
        return 0

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


def run(args) -> dict:
    scope = f"county:{args.county.upper()}" if args.county else "statewide"
    http = requests.Session()
    http.headers.update({"User-Agent": "WatchdogParcelSync/1.0 (+https://www.watchdogindex.com)"})
    count = fetch_json(http, {"where": where_clause(args.county, 0), "returnCountOnly": "true", "f": "json"})["count"]
    print(f"[sync] {scope}: state service reports {count:,} parcels", flush=True)

    db = None if args.dry_run else Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
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
    try:
        while True:
            if args.max_pages and pages >= args.max_pages:
                print("[sync] reached --max-pages; stopping cleanly", flush=True)
                if db:
                    db.update_run(run_row["id"], {"status": "stopped", "last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
                break
            t0 = time.time()
            data = fetch_json(http, {
                "where": where_clause(args.county, after),
                "outFields": ",".join(OUT_FIELDS),
                "orderByFields": "OBJECTID ASC",
                "resultRecordCount": str(PAGE_SIZE),
                "returnGeometry": "false",
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
            after = max(int(a.get("OBJECTID") or 0) for a in attrs)
            rows = [r for r in (normalize(a) for a in attrs) if r]
            received += len(attrs)
            pages += 1
            if db:
                for i in range(0, len(rows), BATCH):
                    written += db.write_rows(rows[i:i + BATCH])
                db.update_run(run_row["id"], {"last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
            if pages % 25 == 0 or pages == 1:
                rate = received / max(time.time() - started, 1)
                print(f"[sync] page {pages:,}: {received:,}/{count:,} received, {written:,} written, OBJECTID {after:,}, {rate:,.0f} rows/s", flush=True)
            wait = gap - (time.time() - t0)
            if wait > 0:
                time.sleep(wait)
    except Exception as exc:
        if db and run_row:
            db.update_run(run_row["id"], {"status": "failed", "error": str(exc)[:500], "last_objectid": after, "pages": pages, "rows_received": received, "rows_written": written})
        raise

    summary = {"scope": scope, "source": SOURCE, "source_count": count, "pages": pages, "rows_received": received, "rows_written": written, "last_objectid": after, "run_id": run_row["id"] if run_row else None, "dry_run": bool(args.dry_run), "minutes": round((time.time() - started) / 60, 1)}
    print("[sync] summary " + json.dumps(summary), flush=True)
    if args.summary:
        with open(args.summary, "w") as fh:
            json.dump(summary, fh, indent=2)
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
    class FakeDb(Supabase):
        def __init__(self):
            self.calls = []
        def rpc(self, name, payload):
            n = len(payload["p_rows"])
            self.calls.append(n)
            if n > 125:
                raise RuntimeError('rpc sync_parcel_batch 500: {"code":"57014","message":"canceling statement due to statement timeout"}')
            return n
    fake = FakeDb()
    assert fake.write_rows([{"pams_pin": f"0101_{i}_1"} for i in range(500)]) == 500, "slow batches split and still write every row"
    assert max(c for c in fake.calls if c <= 125) <= 125
    class BadDb(Supabase):
        def __init__(self):
            pass
        def rpc(self, name, payload):
            raise RuntimeError("rpc sync_parcel_batch 400: bad input")
    try:
        BadDb().write_rows([{"pams_pin": "0101_1_1"}])
        raise AssertionError("non-retryable errors must surface")
    except RuntimeError as exc:
        assert "400" in str(exc)
    print("sync_parcel_composite self-test passed")


def main() -> None:
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
        return
    run(args)


if __name__ == "__main__":
    sys.exit(main())
