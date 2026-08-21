#!/usr/bin/env python3
"""Audit official NJ Treasury MOD-IV annual archives without retaining PII.

The MOD-IV fixed-width record contains sensitive fields. This audit deliberately
extracts only parcel identity and assessment-history fields needed for Watchdog's
longitudinal source contract. Raw archives remain ephemeral on the CI runner.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import tempfile
import zipfile
from decimal import Decimal, InvalidOperation
from pathlib import Path

import requests

YEARS = tuple(range(2021, 2027))
URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modiv-{year}.zip"
LAYOUT_URL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modivlayout.pdf"
CONTROL = ("0101", "25.01", "10", "")

# Zero-based slices from the official 700-character MOD-IV layout.
SLICES = {
    "district_code": (0, 4),
    "block": (4, 13),
    "lot": (13, 22),
    "qualifier": (22, 33),
    "record_id": (33, 35),
    "transaction_date": (37, 43),
    "property_class": (55, 58),
    "assessment_code": (419, 420),
    "land_value": (420, 429),
    "improvement_value": (429, 438),
    "net_value": (438, 447),
    "old_property_id": (521, 550),
    "prior_year_net_value": (682, 691),
}
EXEMPTION_CODE_OFFSETS = (459, 468, 477, 486)


def clean_num(text: str):
    value = text.strip()
    if not value:
        return None
    return int(value) if value.isdigit() else None


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


def safe_record(line: str) -> dict:
    get = lambda name: line[slice(*SLICES[name])]
    codes = [line[i : i + 1].strip() for i in EXEMPTION_CODE_OFFSETS]
    return {
        "district_code": get("district_code").strip(),
        "block": norm_component(get("block")),
        "lot": norm_component(get("lot")),
        "qualifier": norm_component(get("qualifier")),
        "record_id": get("record_id").strip(),
        "transaction_date": get("transaction_date").strip() or None,
        "property_class": get("property_class").strip() or None,
        "assessment_code": get("assessment_code").strip() or None,
        "land_value": clean_num(get("land_value")),
        "improvement_value": clean_num(get("improvement_value")),
        "net_value": clean_num(get("net_value")),
        "exemption_codes": [code for code in codes if code],
        "old_property_id_present": bool(get("old_property_id").strip()),
        "prior_year_net_value": clean_num(get("prior_year_net_value")),
    }


def audit_year(year: int, timeout: int) -> dict:
    url = URL.format(year=year)
    with tempfile.NamedTemporaryFile(prefix=f"modiv-{year}-", suffix=".zip") as tmp:
        with requests.get(url, stream=True, timeout=timeout) as response:
            response.raise_for_status()
            total = 0
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    tmp.write(chunk)
                    total += len(chunk)
            tmp.flush()

        valid = 0
        districts = set()
        lengths = collections.Counter()
        control_rows = []
        members = []
        with zipfile.ZipFile(tmp.name) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                members.append({"name": Path(info.filename).name, "bytes": info.file_size})
                with archive.open(info) as fh:
                    for raw in fh:
                        line = raw.rstrip(b"\r\n").decode("latin-1", errors="replace")
                        lengths[len(line)] += 1
                        if len(line) < 700 or not re.fullmatch(r"\d{4}", line[:4]):
                            continue
                        record = safe_record(line[:700])
                        valid += 1
                        districts.add(record["district_code"])
                        key = (record["district_code"], record["block"], record["lot"], record["qualifier"])
                        if key == CONTROL:
                            control_rows.append(record)

        return {
            "year": year,
            "url": url,
            "archive_bytes": total,
            "member_count": len(members),
            "members": members,
            "valid_record_count": valid,
            "district_count": len(districts),
            "record_length_counts": dict(sorted(lengths.items())),
            "control_key": {"district_code": CONTROL[0], "block": CONTROL[1], "lot": CONTROL[2], "qualifier": CONTROL[3]},
            "control_rows": control_rows,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="property/data/modiv-longitudinal-diagnostic.json")
    parser.add_argument("--years", nargs="*", type=int, default=list(YEARS))
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()

    years = sorted(set(args.years))
    if not years or any(year < 1989 or year > 2100 for year in years):
        raise SystemExit("Invalid year selection")

    result = {
        "schema_version": 1,
        "source": "NJ Division of Taxation Property Assessment List (MOD-IV)",
        "source_index": "https://www.nj.gov/treasury/taxation/lpt/statdata.shtml",
        "file_layout": LAYOUT_URL,
        "privacy_contract": {
            "raw_archives_persisted": False,
            "owner_names_retained": False,
            "mailing_addresses_retained": False,
            "social_security_numbers_retained": False,
            "mortgage_account_numbers_retained": False,
            "safe_fields_only": True,
        },
        "years": [],
    }
    for year in years:
        result["years"].append(audit_year(year, args.timeout))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "years": years,
        "records": {str(row["year"]): row["valid_record_count"] for row in result["years"]},
        "districts": {str(row["year"]): row["district_count"] for row in result["years"]},
        "control_matches": {str(row["year"]): len(row["control_rows"]) for row in result["years"]},
    }, indent=2))


if __name__ == "__main__":
    main()
