#!/usr/bin/env python3
"""Validate and normalize NJ Treasury MOD-IV fixed-width assessment files.

The source format contains fields Watchdog does not need and must not publish.
This parser therefore uses a strict allow-list and never materializes owner
mailing, mortgage-account, Social Security, or person-level rebate fields.

Normalized output is partitioned gzip JSONL and belongs in the ignored
artifacts/data-factory directory, not in the website repository.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import pathlib
import re
import sys
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_STATUS = ROOT / "property/data/data-factory-status.json"
EXPECTED_COUNTIES = 21
RECORD_LENGTH = 700
MUNI_RE = re.compile(r"^\d{4}$")


def clean(raw: str) -> str | None:
    value = raw.strip()
    return value or None


def integer(raw: str) -> int | None:
    value = raw.strip()
    if not value or not value.isdigit():
        return None
    return int(value)


def implied(raw: str, scale: int) -> float | None:
    value = raw.strip()
    if not value:
        return None
    sign = -1 if value.startswith("-") else 1
    value = value.lstrip("+-")
    if not value.isdigit():
        return None
    return sign * int(value) / scale


def modiv_date(raw: str) -> str | None:
    value = raw.strip()
    if len(value) != 6 or not value.isdigit() or value == "000000":
        return None
    month, day, year = int(value[:2]), int(value[2:4]), int(value[4:])
    year += 1900 if year >= 60 else 2000
    try:
        return dt.date(year, month, day).isoformat()
    except ValueError:
        return None


def parcel_key(muni: str, block: str | None, lot: str | None, qualifier: str | None) -> str | None:
    if not muni or not block or not lot:
        return None
    parts = [muni, block.strip(), lot.strip()]
    if qualifier:
        parts.append(qualifier.strip())
    return "_".join(parts)


def parse_record(record: str, tax_year: int) -> dict:
    """Parse only approved property/tax fields from the official 700-byte layout."""
    muni = record[0:4]
    block = clean(record[4:13])
    lot = clean(record[13:22])
    qualifier = clean(record[22:33])
    land_value = integer(record[420:429])
    improvement_value = integer(record[429:438])
    net_value = integer(record[438:447])
    return {
        "tax_year": tax_year,
        "parcel_key": parcel_key(muni, block, lot, qualifier),
        "county_district": muni,
        "block": block,
        "lot": lot,
        "qualifier": qualifier,
        "record_id": clean(record[33:35]),
        "property_class": clean(record[55:58]),
        "property_location": clean(record[58:83]),
        "building_description": clean(record[83:98]),
        "land_description": clean(record[98:118]),
        "calculated_acres": implied(record[118:127], 10_000),
        "zoning": clean(record[167:171]),
        "tax_map_page": clean(record[171:175]),
        "deed_book": clean(record[295:300]),
        "deed_page": clean(record[300:305]),
        "sales_price_code": clean(record[305:306]),
        "deed_date": modiv_date(record[306:312]),
        "sale_price": integer(record[312:321]),
        "sale_assessment": integer(record[321:330]),
        "sale_sr1a_unusable_code": clean(record[330:332]),
        "building_class": clean(record[410:415]),
        "year_constructed": integer(record[415:419]),
        "land_value": land_value,
        "improvement_value": improvement_value,
        "net_value": net_value,
        "property_use_code": clean(record[559:562]),
        "last_year_tax": implied(record[600:609], 100),
        "current_year_tax": implied(record[609:618], 100),
        "prior_year_net_value": integer(record[682:691]),
        "state_aid_amount": implied(record[691:700], 100),
    }


def archive_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def county_name(member: str) -> str:
    name = pathlib.PurePosixPath(member).name
    return re.sub(r"\s+\d{2}\s+RE\.txt$", "", name, flags=re.I).strip()


def inspect_archive(path: pathlib.Path) -> tuple[zipfile.ZipFile, list[zipfile.ZipInfo]]:
    archive = zipfile.ZipFile(path)
    members = [x for x in archive.infolist() if not x.is_dir() and x.filename.lower().endswith(".txt")]
    if len(members) != EXPECTED_COUNTIES:
        archive.close()
        raise ValueError(f"Expected {EXPECTED_COUNTIES} county files; found {len(members)}")
    return archive, members


def update_status(path: pathlib.Path, result: dict, emitted: bool) -> None:
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"schema_version": 1}
    current["generated_at"] = result["completed_at"]
    current["overall_status"] = "validated_not_published" if result["validation_passed"] else "validation_failed"
    summary = current.setdefault("summary", {})
    summary.update({
        "expected_modiv_partitions": EXPECTED_COUNTIES,
        "validated_modiv_partitions": result["county_files"],
        "modiv_source_records": result["source_records"],
        "modiv_invalid_records": result["invalid_records"],
        "publish_state": "validated_awaiting_review" if result["validation_passed"] else "blocked",
    })
    # A validation-only run must not erase evidence of the last successful
    # normalization. Only replace this counter when files were actually emitted.
    if emitted:
        summary["normalized_modiv_records"] = result["normalized_records"]
    for stage in current.get("stages", []):
        if stage.get("id") == "modiv-ingest":
            stage["status"] = "passed" if result["validation_passed"] else "failed"
            stage["detail"] = f"{result['source_records']:,} 2026 MOD-IV records checked across {result['county_files']} county files; {result['invalid_records']:,} structurally invalid."
        if stage.get("id") == "publish":
            stage["status"] = "review_required" if result["validation_passed"] else "blocked"
            stage["detail"] = "Validation passed. Production publication still requires explicit review and warehouse load approval." if result["validation_passed"] else "Publication blocked because MOD-IV validation failed."
    current["latest_modiv_run"] = result
    path.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")


def run(args: argparse.Namespace) -> dict:
    source = pathlib.Path(args.archive).expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(source)
    output_dir = pathlib.Path(args.output_dir).expanduser().resolve()
    if args.emit_normalized:
        output_dir.mkdir(parents=True, exist_ok=True)

    started = dt.datetime.now(dt.timezone.utc)
    source_records = invalid_records = missing_keys = value_mismatches = 0
    county_results = []
    archive, members = inspect_archive(source)
    try:
        for info in members:
            county = county_name(info.filename)
            rows = invalid = keys_missing = math_mismatch = 0
            target = output_dir / (re.sub(r"[^a-z0-9]+", "-", county.lower()).strip("-") + ".jsonl.gz")
            writer = gzip.open(target, "wt", encoding="utf-8") if args.emit_normalized else None
            try:
                with archive.open(info) as stream:
                    for raw in stream:
                        rows += 1
                        record = raw.rstrip(b"\r\n")
                        if len(record) != RECORD_LENGTH:
                            invalid += 1
                            continue
                        try:
                            text = record.decode("latin-1")
                            parsed = parse_record(text, args.tax_year)
                        except Exception:
                            invalid += 1
                            continue
                        if not MUNI_RE.match(parsed["county_district"]) or not parsed["parcel_key"]:
                            keys_missing += 1
                        lv, iv, nv = parsed["land_value"], parsed["improvement_value"], parsed["net_value"]
                        if lv is not None and iv is not None and nv is not None and lv + iv != nv:
                            math_mismatch += 1
                        if writer:
                            writer.write(json.dumps(parsed, separators=(",", ":"), ensure_ascii=True) + "\n")
            finally:
                if writer:
                    writer.close()
            source_records += rows
            invalid_records += invalid
            missing_keys += keys_missing
            value_mismatches += math_mismatch
            county_results.append({
                "county": county,
                "source_file": pathlib.PurePosixPath(info.filename).name,
                "records": rows,
                "invalid_length_or_decode": invalid,
                "missing_parcel_key": keys_missing,
                "assessment_math_mismatch": math_mismatch,
                "output": str(target) if writer else None,
            })
    finally:
        archive.close()

    completed = dt.datetime.now(dt.timezone.utc)
    validation_passed = (
        len(county_results) == EXPECTED_COUNTIES
        and source_records > 1_000_000
        and invalid_records == 0
        and missing_keys / max(source_records, 1) < 0.01
    )
    return {
        "schema_version": 1,
        "dataset_id": "treasury-modiv-2026",
        "tax_year": args.tax_year,
        "started_at": started.isoformat(),
        "completed_at": completed.isoformat(),
        "source_archive": source.name,
        "source_sha256": archive_sha256(source),
        "county_files": len(county_results),
        "source_records": source_records,
        "normalized_records": source_records - invalid_records,
        "invalid_records": invalid_records,
        "missing_parcel_keys": missing_keys,
        "assessment_math_mismatches": value_mismatches,
        "validation_passed": validation_passed,
        "normalized_output_emitted": bool(args.emit_normalized),
        "privacy_contract": "strict_allow_list_no_owner_mailing_mortgage_ssn_or_person_rebate_fields",
        "counties": county_results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", help="Path to the official statewide MOD-IV ZIP")
    parser.add_argument("--tax-year", type=int, default=2026)
    parser.add_argument("--emit-normalized", action="store_true", help="Write privacy-limited gzip JSONL partitions")
    parser.add_argument("--output-dir", default=str(ROOT / "artifacts/data-factory/modiv/2026"))
    parser.add_argument("--status", default=str(DEFAULT_STATUS), help="Machine-readable Data Factory status file")
    parser.add_argument("--no-status-write", action="store_true")
    args = parser.parse_args()
    try:
        result = run(args)
        if not args.no_status_write:
            update_status(pathlib.Path(args.status), result, args.emit_normalized)
        print(json.dumps({
            "validation_passed": result["validation_passed"],
            "county_files": result["county_files"],
            "source_records": result["source_records"],
            "invalid_records": result["invalid_records"],
            "missing_parcel_keys": result["missing_parcel_keys"],
            "normalized_output_emitted": result["normalized_output_emitted"],
        }, indent=2))
        return 0 if result["validation_passed"] else 1
    except Exception as error:
        print(json.dumps({"validation_passed": False, "error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
