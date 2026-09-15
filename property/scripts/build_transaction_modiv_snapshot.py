#!/usr/bin/env python3
"""Build and publish a privacy-minimized current MOD-IV transaction evidence snapshot.

The source is the official NJ Division of Taxation 700-byte MOD-IV file. Only
parcel identity and closing-safe fields are retained. Raw archives never leave
the runner. Owner/mailing names, SSNs and mortgage account numbers are never read
into the output record.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import tempfile
import zipfile
from collections import OrderedDict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

import requests

TAX_YEAR = 2026
SOURCE_ID = "nj-treasury-modiv-transaction"
SOURCE_URL = f"https://www.nj.gov/treasury/taxation/pdf/lpt/modiv-{TAX_YEAR}.zip"
SOURCE_INDEX = "https://www.nj.gov/treasury/taxation/lpt/statdata.shtml"
LAYOUT_URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modivlayout.pdf"
MANUAL_URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modIVmanual.pdf"
BUCKET = "transaction-evidence-private"
SCHEMA_VERSION = 1
DEFAULT_RELEASE = f"treasury-modiv-{TAX_YEAR}-transaction-v1"

# Python slices are zero-based/exclusive; source layout is one-based/inclusive.
S = {
    "district": (0, 4),
    "block": (4, 13),
    "lot": (13, 22),
    "qualifier": (22, 33),
    "tax_account_number": (47, 55),
    "property_class": (55, 58),
    "deed_book": (295, 300),
    "deed_page": (300, 305),
    "deed_date": (306, 312),
    "delinquent_code": (358, 359),
    "net_value": (438, 447),
    "last_year_tax": (600, 609),
    "current_year_tax": (609, 618),
    "bill_status_flag": (672, 673),
}


def norm_component(text: str) -> str:
    value = text.strip().upper()
    if not value:
        return ""
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        try:
            out = format(Decimal(value).normalize(), "f")
            return out.rstrip("0").rstrip(".") if "." in out else out
        except InvalidOperation:
            pass
    return re.sub(r"\s+", " ", value)


def text(line: str, key: str) -> str:
    a, b = S[key]
    return line[a:b].strip()


def int_or_none(value: str):
    v = value.strip()
    return int(v) if v and v.isdigit() else None


def money_or_none(value: str):
    """Parse common MOD-IV implied-cents encodings; fail closed on unknown signs."""
    v = value.strip()
    if not v:
        return None
    sign = 1
    if v[0] in "+-":
        sign = -1 if v[0] == "-" else 1
        v = v[1:]
    elif v[-1:] in "+-":
        sign = -1 if v[-1] == "-" else 1
        v = v[:-1]
    if not v.isdigit():
        return None
    return float((Decimal(v) / Decimal(100)) * sign)


def parse_safe(line: str):
    if len(line) < 700 or not re.fullmatch(r"\d{4}", line[:4]):
        return None
    district = text(line, "district")
    block = norm_component(text(line, "block"))
    lot = norm_component(text(line, "lot"))
    qualifier = norm_component(text(line, "qualifier"))
    if not district or not block or not lot:
        return None
    delinquent = text(line, "delinquent_code").upper() or None
    return {
        "district_code": district,
        "block": block,
        "lot": lot,
        "qualifier": qualifier,
        "tax_account_number": text(line, "tax_account_number") or None,
        "property_class": text(line, "property_class") or None,
        "deed_book": text(line, "deed_book") or None,
        "deed_page": text(line, "deed_page") or None,
        "deed_date": text(line, "deed_date") or None,
        "delinquent_code": delinquent,
        "delinquent_flag": True if delinquent == "S" else False if delinquent in (None, "") else None,
        "net_value": int_or_none(text(line, "net_value")),
        "last_year_tax": money_or_none(text(line, "last_year_tax")),
        "current_year_tax": money_or_none(text(line, "current_year_tax")),
        "bill_status_flag": text(line, "bill_status_flag") or None,
    }


def parcel_key(row: dict) -> str:
    return f"{row['block']}|{row['lot']}|{row['qualifier']}"


class DistrictSpool:
    def __init__(self, root: Path, max_open: int = 32):
        self.root = root
        self.max_open = max_open
        self.handles: OrderedDict[str, object] = OrderedDict()

    def write(self, row: dict):
        district = row["district_code"]
        fh = self.handles.pop(district, None)
        if fh is None:
            if len(self.handles) >= self.max_open:
                _, old = self.handles.popitem(last=False)
                old.close()
            fh = (self.root / f"{district}.jsonl").open("a", encoding="utf-8")
        self.handles[district] = fh
        fh.write(json.dumps(row, separators=(",", ":")) + "\n")

    def close(self):
        for fh in self.handles.values():
            fh.close()
        self.handles.clear()


def download_source(target: Path, timeout: int) -> str:
    h = hashlib.sha256()
    with requests.get(SOURCE_URL, stream=True, timeout=timeout) as r:
        r.raise_for_status()
        with target.open("wb") as fh:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    h.update(chunk)
                    fh.write(chunk)
    return h.hexdigest()


def iter_archive(path: Path) -> Iterable[dict]:
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            with z.open(info) as fh:
                for raw in fh:
                    row = parse_safe(raw.rstrip(b"\r\n").decode("latin-1", errors="replace")[:700])
                    if row:
                        yield row


def write_partition(source: Path, district: str, output: Path) -> dict:
    records: dict[str, dict] = {}
    duplicate_rows = 0
    conflicting_duplicates = 0
    with source.open(encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            key = parcel_key(row)
            prior = records.get(key)
            if prior is not None:
                duplicate_rows += 1
                if prior != row:
                    conflicting_duplicates += 1
                continue
            row.pop("district_code", None)
            row.pop("block", None)
            row.pop("lot", None)
            row.pop("qualifier", None)
            records[key] = row
    if conflicting_duplicates:
        raise RuntimeError(f"{district}: {conflicting_duplicates} conflicting duplicate parcel rows")
    payload = {
        "schema_version": SCHEMA_VERSION,
        "source_id": SOURCE_ID,
        "tax_year": TAX_YEAR,
        "district_code": district,
        "record_count": len(records),
        "records": records,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    with output.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=6, mtime=0) as gz:
            gz.write(encoded)
    return {
        "district_code": district,
        "record_count": len(records),
        "duplicate_rows": duplicate_rows,
        "conflicting_duplicates": conflicting_duplicates,
        "bytes_gzip": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "filename": output.name,
    }


def headers(key: str, content_type="application/json"):
    return {
        "Authorization": f"Bearer {key}", "apikey": key,
        "Content-Type": content_type,
    }


def upload(project: str, key: str, object_path: str, local: Path, content_type: str):
    url = project.rstrip("/") + "/storage/v1/object/" + quote(BUCKET, safe="") + "/" + quote(object_path, safe="/")
    h = {**headers(key, content_type), "x-upsert": "true"}
    with local.open("rb") as fh:
        r = requests.post(url, headers=h, data=fh, timeout=180)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"storage upload {r.status_code}: {r.text[:300]}")


def upsert_release(project: str, key: str, row: dict):
    url = project.rstrip("/") + "/rest/v1/transaction_data_releases?on_conflict=release_id"
    h = {**headers(key), "Prefer": "resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, headers=h, json=row, timeout=60)
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f"release upsert {r.status_code}: {r.text[:300]}")


def activate(project: str, key: str, release_id: str):
    url = project.rstrip("/") + "/rest/v1/rpc/activate_transaction_data_release"
    r = requests.post(url, headers=headers(key), json={"p_release_id": release_id}, timeout=60)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"release activation {r.status_code}: {r.text[:300]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release-id", default=DEFAULT_RELEASE)
    ap.add_argument("--output-dir", default=".tmp/transaction-modiv")
    ap.add_argument("--diagnostic", default="property/data/transaction-modiv-build-summary.json")
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,79}", args.release_id):
        raise SystemExit("invalid release id")

    out = Path(args.output_dir)
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)

    with tempfile.TemporaryDirectory(prefix="watchdog-transaction-modiv-") as td:
        root = Path(td)
        archive = root / "source.zip"
        source_sha = download_source(archive, args.timeout)
        spool_root = root / "spool"; spool_root.mkdir()
        spool = DistrictSpool(spool_root)
        source_rows = 0
        delinquent_rows = 0
        for row in iter_archive(archive):
            spool.write(row); source_rows += 1
            if row.get("delinquent_flag") is True: delinquent_rows += 1
        spool.close()

        partitions = []
        for p in sorted(spool_root.glob("*.jsonl")):
            if re.fullmatch(r"\d{4}", p.stem):
                partitions.append(write_partition(p, p.stem, out / "district" / f"{p.stem}.json.gz"))

    if source_rows < 3_000_000 or len(partitions) < 560:
        raise RuntimeError(f"unexpected MOD-IV coverage: rows={source_rows}, districts={len(partitions)}")
    if any(p["conflicting_duplicates"] for p in partitions):
        raise RuntimeError("conflicting duplicate rows are not publishable")

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "source_id": SOURCE_ID,
        "release_id": args.release_id,
        "tax_year": TAX_YEAR,
        "source_url": SOURCE_URL,
        "source_index": SOURCE_INDEX,
        "layout_url": LAYOUT_URL,
        "manual_url": MANUAL_URL,
        "source_sha256": source_sha,
        "record_count": source_rows,
        "district_count": len(partitions),
        "delinquent_flag_rows": delinquent_rows,
        "privacy_contract": {
            "owner_names_retained": False,
            "mailing_addresses_retained": False,
            "social_security_numbers_retained": False,
            "mortgage_account_numbers_retained": False,
            "raw_archives_persisted": False,
            "safe_transaction_fields_only": True,
        },
        "semantics": {
            "delinquent_code_S": "Owner reported delinquent on local property taxes per Tax Collector in the MOD-IV tax-list source; not a real-time payoff or municipal lien clearance.",
            "blank_delinquent_code": "No MOD-IV delinquent-tax flag observed in this annual source; not proof of a current zero balance.",
            "bill_status_flag": "Retained as source evidence without inferring undocumented code meanings.",
        },
        "partitions": partitions,
    }
    manifest_path = out / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    diagnostic = Path(args.diagnostic); diagnostic.parent.mkdir(parents=True, exist_ok=True)
    diagnostic.write_text(json.dumps({
        "release_id": args.release_id,
        "source_sha256": source_sha,
        "record_count": source_rows,
        "district_count": len(partitions),
        "delinquent_flag_rows": delinquent_rows,
        "duplicate_rows": sum(p["duplicate_rows"] for p in partitions),
        "partition_bytes": sum(p["bytes_gzip"] for p in partitions),
        "privacy_contract": manifest["privacy_contract"],
    }, indent=2, sort_keys=True) + "\n")

    if args.publish:
        project = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not project or not key: raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        prefix = f"modiv/{args.release_id}"
        for idx, p in enumerate(partitions, 1):
            upload(project, key, f"{prefix}/district/{p['filename']}", out / "district" / p["filename"], "application/gzip")
            if idx % 50 == 0: print(f"uploaded {idx}/{len(partitions)}")
        upload(project, key, f"{prefix}/manifest.json", manifest_path, "application/json")
        upsert_release(project, key, {
            "release_id": args.release_id,
            "source_id": SOURCE_ID,
            "tax_year": TAX_YEAR,
            "schema_version": SCHEMA_VERSION,
            "storage_bucket": BUCKET,
            "storage_prefix": prefix,
            "status": "candidate",
            "record_count": source_rows,
            "district_count": len(partitions),
            "source_url": SOURCE_URL,
            "source_sha256": source_sha,
            "manifest": {k: manifest[k] for k in ("schema_version","source_id","tax_year","source_sha256","record_count","district_count","delinquent_flag_rows","privacy_contract","semantics")},
            "built_at": datetime.now(timezone.utc).isoformat(),
        })
        activate(project, key, args.release_id)
        print(f"activated {args.release_id}")

    print(json.dumps({"release_id": args.release_id, "records": source_rows, "districts": len(partitions), "published": args.publish}, indent=2))


if __name__ == "__main__":
    main()
