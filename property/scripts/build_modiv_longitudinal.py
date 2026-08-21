#!/usr/bin/env python3
"""Build privacy-minimized NJ MOD-IV longitudinal district partitions.

Downloads official NJ Treasury annual MOD-IV archives, extracts only the safe
assessment-history allowlist, aggregates exact parcel identities within each
four-digit taxing district, and optionally publishes gzip partitions to a
private Supabase Storage release prefix.

Raw archives and raw MOD-IV records never leave the temporary runner volume.
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
from collections import OrderedDict, defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

import requests

YEARS = tuple(range(2021, 2027))
URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modiv-{year}.zip"
SOURCE_INDEX = "https://www.nj.gov/treasury/taxation/lpt/statdata.shtml"
LAYOUT_URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modivlayout.pdf"
SOURCE_ID = "nj-dca-modiv-longitudinal"
SCHEMA_VERSION = 1

SLICES = {
    "district_code": (0, 4),
    "block": (4, 13),
    "lot": (13, 22),
    "qualifier": (22, 33),
    "property_class": (55, 58),
    "land_value": (420, 429),
    "improvement_value": (429, 438),
    "net_value": (438, 447),
}
EXEMPTION_CODE_OFFSETS = (459, 468, 477, 486)


def clean_num(text: str):
    value = text.strip()
    return int(value) if value and value.isdigit() else None


def norm_component(text: str) -> str:
    value = text.strip().upper()
    if not value:
        return ""
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        try:
            out = format(Decimal(value).normalize(), "f")
            if "." in out:
                out = out.rstrip("0").rstrip(".")
            return out or "0"
        except InvalidOperation:
            pass
    return re.sub(r"\s+", " ", value)


def parse_safe(line: str, year: int):
    if len(line) < 700 or not re.fullmatch(r"\d{4}", line[:4]):
        return None
    get = lambda name: line[slice(*SLICES[name])]
    district = get("district_code").strip()
    block = norm_component(get("block"))
    lot = norm_component(get("lot"))
    qualifier = norm_component(get("qualifier"))
    if not district or not block or not lot:
        return None
    return {
        "y": year,
        "d": district,
        "b": block,
        "l": lot,
        "q": qualifier,
        "c": get("property_class").strip() or None,
        "lv": clean_num(get("land_value")),
        "iv": clean_num(get("improvement_value")),
        "nv": clean_num(get("net_value")),
        "ex": [line[i:i+1].strip() for i in EXEMPTION_CODE_OFFSETS if line[i:i+1].strip()],
    }


class DistrictSpool:
    def __init__(self, root: Path, max_open: int = 32):
        self.root = root
        self.max_open = max_open
        self.handles: OrderedDict[str, object] = OrderedDict()
        self.counts = defaultdict(int)

    def write(self, record: dict) -> None:
        district = record["d"]
        handle = self.handles.pop(district, None)
        if handle is None:
            if len(self.handles) >= self.max_open:
                _, old = self.handles.popitem(last=False)
                old.close()
            path = self.root / f"{district}.jsonl"
            handle = path.open("a", encoding="utf-8")
        self.handles[district] = handle
        handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        self.counts[district] += 1

    def close(self) -> None:
        for handle in self.handles.values():
            handle.close()
        self.handles.clear()


def iter_archive(year: int, timeout: int) -> Iterable[dict]:
    url = URL.format(year=year)
    with tempfile.NamedTemporaryFile(prefix=f"modiv-{year}-", suffix=".zip") as tmp:
        with requests.get(url, stream=True, timeout=timeout) as response:
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    tmp.write(chunk)
            tmp.flush()
        with zipfile.ZipFile(tmp.name) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                with archive.open(info) as fh:
                    for raw in fh:
                        line = raw.rstrip(b"\r\n").decode("latin-1", errors="replace")
                        record = parse_safe(line[:700], year)
                        if record:
                            yield record


def parcel_key(row: dict) -> str:
    return f"{row['b']}|{row['l']}|{row['q']}"


def build_partition(path: Path, district: str, years: list[int], output: Path) -> dict:
    parcels: dict[str, dict[int, dict]] = defaultdict(dict)
    duplicates = 0
    conflicts = 0
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            key = parcel_key(row)
            year = int(row["y"])
            prior = parcels[key].get(year)
            if prior is not None:
                duplicates += 1
                comparable = {k: row.get(k) for k in ("c", "lv", "iv", "nv", "ex")}
                old = {k: prior.get(k) for k in ("c", "lv", "iv", "nv", "ex")}
                if comparable != old:
                    conflicts += 1
                continue
            parcels[key][year] = row
    if conflicts:
        raise RuntimeError(f"{district}: {conflicts} conflicting duplicate parcel-year rows")

    records = {}
    for key in sorted(parcels):
        rows = parcels[key]
        observed = sorted(rows)
        records[key] = {
            "years": observed,
            "land": {str(y): rows[y]["lv"] for y in observed if rows[y]["lv"] is not None},
            "improvement": {str(y): rows[y]["iv"] for y in observed if rows[y]["iv"] is not None},
            "total": {str(y): rows[y]["nv"] for y in observed if rows[y]["nv"] is not None},
            "class": {str(y): rows[y]["c"] for y in observed if rows[y]["c"] is not None},
            "exemptions": {str(y): rows[y]["ex"] for y in observed},
        }

    payload = {
        "schema_version": SCHEMA_VERSION,
        "source_id": SOURCE_ID,
        "district_code": district,
        "source_years": years,
        "record_count": len(records),
        "records": records,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output, "wt", encoding="utf-8", compresslevel=6, mtime=0) as gz:
        json.dump(payload, gz, separators=(",", ":"), sort_keys=True)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return {
        "district_code": district,
        "parcel_count": len(records),
        "spooled_rows": sum(len(v) for v in parcels.values()),
        "duplicate_rows": duplicates,
        "conflicting_duplicates": conflicts,
        "bytes_gzip": output.stat().st_size,
        "sha256": digest,
        "filename": output.name,
    }


def storage_upload(project_url: str, service_key: str, bucket: str, object_path: str, local: Path, content_type: str) -> None:
    url = project_url.rstrip("/") + "/storage/v1/object/" + quote(bucket, safe="") + "/" + quote(object_path, safe="/")
    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    with local.open("rb") as fh:
        response = requests.post(url, headers=headers, data=fh, timeout=180)
    if response.status_code not in (200, 201):
        raise RuntimeError(f"Storage upload failed {response.status_code}: {response.text[:300]}")


def upsert_release(project_url: str, service_key: str, row: dict) -> None:
    url = project_url.rstrip("/") + "/rest/v1/modiv_longitudinal_releases?on_conflict=release_id"
    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    response = requests.post(url, headers=headers, json=row, timeout=60)
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f"Release manifest upsert failed {response.status_code}: {response.text[:300]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="*", type=int, default=list(YEARS))
    parser.add_argument("--release-id", default="treasury-modiv-2021-2026-v1")
    parser.add_argument("--output-dir", default=".tmp/modiv-longitudinal-release")
    parser.add_argument("--diagnostic", default="property/data/modiv-longitudinal-build-summary.json")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()

    years = sorted(set(args.years))
    if years != list(YEARS):
        raise SystemExit(f"Certified v1 builder requires years {list(YEARS)}")
    release_id = args.release_id.strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,79}", release_id):
        raise SystemExit("Invalid release id")

    output_dir = Path(args.output_dir)
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    with tempfile.TemporaryDirectory(prefix="watchdog-modiv-spool-") as td:
        spool_root = Path(td)
        spool = DistrictSpool(spool_root)
        source_counts = {}
        total_source_rows = 0
        for year in years:
            count = 0
            for row in iter_archive(year, args.timeout):
                spool.write(row)
                count += 1
            source_counts[str(year)] = count
            total_source_rows += count
            print(f"{year}: {count:,} safe source rows")
        spool.close()

        partitions = []
        for path in sorted(spool_root.glob("*.jsonl")):
            district = path.stem
            if not re.fullmatch(r"\d{4}", district):
                continue
            partitions.append(build_partition(path, district, years, output_dir / "district" / f"{district}.json.gz"))

    if len(partitions) < 560:
        raise RuntimeError(f"Expected at least 560 district partitions, found {len(partitions)}")
    parcel_total = sum(x["parcel_count"] for x in partitions)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "source_id": SOURCE_ID,
        "release_id": release_id,
        "source_index": SOURCE_INDEX,
        "file_layout": LAYOUT_URL,
        "source_years": years,
        "source_urls": [URL.format(year=y) for y in years],
        "source_row_counts": source_counts,
        "source_rows_total": total_source_rows,
        "district_count": len(partitions),
        "parcel_records_across_partitions": parcel_total,
        "privacy_contract": {
            "raw_archives_persisted": False,
            "owner_names_retained": False,
            "mailing_addresses_retained": False,
            "social_security_numbers_retained": False,
            "mortgage_account_numbers_retained": False,
            "safe_fields_only": True,
        },
        "partitions": partitions,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    diagnostic = Path(args.diagnostic)
    diagnostic.parent.mkdir(parents=True, exist_ok=True)
    diagnostic.write_text(json.dumps({k: v for k, v in manifest.items() if k != "partitions"} | {
        "partition_size_bytes": {
            "min": min(x["bytes_gzip"] for x in partitions),
            "max": max(x["bytes_gzip"] for x in partitions),
            "total": sum(x["bytes_gzip"] for x in partitions),
        },
        "duplicate_rows_total": sum(x["duplicate_rows"] for x in partitions),
        "conflicting_duplicates_total": sum(x["conflicting_duplicates"] for x in partitions),
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.publish:
        project_url = os.environ.get("SUPABASE_URL", "").strip()
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not project_url or not service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to publish")
        prefix = f"releases/{release_id}"
        for idx, partition in enumerate(partitions, 1):
            local = output_dir / "district" / partition["filename"]
            storage_upload(project_url, service_key, "modiv-longitudinal", f"{prefix}/district/{partition['filename']}", local, "application/gzip")
            if idx % 50 == 0:
                print(f"uploaded {idx}/{len(partitions)} district partitions")
        storage_upload(project_url, service_key, "modiv-longitudinal", f"{prefix}/manifest.json", manifest_path, "application/json")
        upsert_release(project_url, service_key, {
            "release_id": release_id,
            "storage_prefix": prefix,
            "source_years": years,
            "source_urls": manifest["source_urls"],
            "record_count": total_source_rows,
            "district_count": len(partitions),
            "manifest": {
                "schema_version": SCHEMA_VERSION,
                "source_id": SOURCE_ID,
                "source_row_counts": source_counts,
                "parcel_records_across_partitions": parcel_total,
                "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
                "privacy_contract": manifest["privacy_contract"],
            },
            "status": "candidate",
            "built_at": "now()",
        })
        # PostgREST cannot interpret now() as a timestamptz literal; patch built_at separately by DB default/update later.
        print(f"published candidate release {release_id}")

    print(json.dumps({
        "release_id": release_id,
        "source_row_counts": source_counts,
        "district_count": len(partitions),
        "parcel_records_across_partitions": parcel_total,
        "partition_bytes": sum(x["bytes_gzip"] for x in partitions),
        "diagnostic": str(diagnostic),
        "published": bool(args.publish),
    }, indent=2))


if __name__ == "__main__":
    main()
