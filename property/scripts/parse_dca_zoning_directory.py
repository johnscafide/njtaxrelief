#!/usr/bin/env python3
"""Build a governed municipal extract from NJ DCA's Zoning Information Directory.

The workbook is a public directory of research entrypoints and municipal zoning-office
contacts. DCA explicitly does not attest that linked maps/ordinances are current.
Accordingly, this parser preserves source fields and never infers zoning, permitted use,
board identity, document currency, entitlement status, or legal conclusions.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import urllib.request
import zipfile
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET

DEFAULT_SOURCE = "https://www.nj.gov/dca/library/home/Zoning_Information_Directory.xlsx"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "dca-zoning-directory.json"
EXPECTED_SOURCE_SHA256 = "165b1e0d7b6c14583a88c1f675d91a0e2babd1b4edaa74fa5667906c789da4f9"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
HEADERS = [
    "municipality",
    "county",
    "treasury_municode",
    "zoning_map_label",
    "zoning_ordinance_label",
    "zoning_office_phone",
    "zoning_office_email_or_contact",
    "zoning_office_or_board_website",
    "zoning_map_url",
    "zoning_ordinance_url",
]
NULLISH = {"", "--", "-", "n/a", "na", "none", "null"}
SOURCE_DISCLAIMER = (
    "NJ DCA publishes the Zoning Information Directory as an information resource and "
    "does not attest to the currentness or accuracy of linked municipal maps/ordinances. "
    "Questions should be confirmed with the appropriate zoning office or official."
)


def _shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(t.text or "" for t in si.findall(".//m:t", NS)) for si in root.findall("m:si", NS)]


def _cell_value(cell: ET.Element, shared: list[str]) -> str:
    typ = cell.attrib.get("t")
    if typ == "inlineStr":
        return "".join(t.text or "" for t in cell.findall(".//m:t", NS))
    v = cell.find("m:v", NS)
    if v is None or v.text is None:
        return ""
    raw = v.text
    if typ == "s":
        try:
            return shared[int(raw)]
        except Exception:
            return raw
    return raw


def _column_index(ref: str) -> int:
    match = re.match(r"([A-Z]+)", ref or "")
    if not match:
        return -1
    value = 0
    for ch in match.group(1):
        value = value * 26 + ord(ch) - 64
    return value - 1


def _clean(value: str | None) -> str | None:
    cleaned = re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()
    return None if cleaned.lower() in NULLISH else cleaned


def _directory_sheet_path(zf: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        if sheet.attrib.get("name") != "Directory":
            continue
        rid = sheet.attrib.get(f"{{{NS['r']}}}id")
        target = rel_map.get(rid or "", "")
        if target:
            return target if target.startswith("xl/") else "xl/" + target.lstrip("/")
    raise RuntimeError("Directory sheet not found in DCA workbook")


def parse_workbook(blob: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        shared = _shared_strings(zf)
        root = ET.fromstring(zf.read(_directory_sheet_path(zf)))
        records: list[dict] = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            row_number = int(row.attrib.get("r", "0") or 0)
            if row_number <= 3:
                continue
            values: list[str | None] = [None] * len(HEADERS)
            for cell in row.findall("m:c", NS):
                idx = _column_index(cell.attrib.get("r", ""))
                if 0 <= idx < len(values):
                    values[idx] = _clean(_cell_value(cell, shared))
            if not values[0] and not values[2]:
                continue
            record = dict(zip(HEADERS, values))
            raw_code = re.sub(r"\D", "", record.get("treasury_municode") or "")
            record["treasury_municode"] = raw_code.zfill(4) if raw_code else None
            records.append(record)
    return records


def fetch_source(url: str) -> tuple[bytes, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": "Watchdog-DCA-zoning-directory/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        content_type = response.headers.get("Content-Type", "")
        if "spreadsheetml" not in content_type and "octet-stream" not in content_type:
            raise RuntimeError(f"Unexpected zoning directory content type: {content_type}")
        return response.read(), response.headers.get("Last-Modified")


def _source_timestamp(last_modified: str | None) -> str | None:
    if not last_modified:
        return None
    try:
        return parsedate_to_datetime(last_modified).isoformat().replace("+00:00", "Z")
    except Exception:
        return last_modified


def build_artifact(blob: bytes, source_url: str, last_modified: str | None) -> dict:
    source_sha256 = hashlib.sha256(blob).hexdigest()
    if source_sha256 != EXPECTED_SOURCE_SHA256:
        raise RuntimeError(
            "DCA zoning directory source hash changed; review the new workbook before refreshing governed data "
            f"(expected {EXPECTED_SOURCE_SHA256}, got {source_sha256})"
        )
    records = parse_workbook(blob)
    by_code: dict[str, dict] = {}
    for row in records:
        code = row.get("treasury_municode")
        if not code or not re.fullmatch(r"\d{4}", code):
            raise RuntimeError(f"Missing/invalid Treasury Municode for {row.get('municipality')!r}: {code!r}")
        if code in by_code:
            raise RuntimeError(f"Duplicate Treasury Municode in DCA zoning directory: {code}")
        by_code[code] = {
            "municipality": row.get("municipality"),
            "county": row.get("county"),
            "directory_status": "listed",
            "zoning_office_contact": {
                "phone": row.get("zoning_office_phone"),
                "email_or_contact_page": row.get("zoning_office_email_or_contact"),
            },
            "zoning_office_or_board_website": row.get("zoning_office_or_board_website"),
            "zoning_map_url": row.get("zoning_map_url"),
            "zoning_ordinance_url": row.get("zoning_ordinance_url"),
        }
    if len(by_code) != 564:
        raise RuntimeError(f"Expected 564 current municipality rows, found {len(by_code)}")
    contact_any = sum(
        1
        for row in by_code.values()
        if row["zoning_office_contact"].get("phone") or row["zoning_office_contact"].get("email_or_contact_page")
    )
    phone_count = sum(1 for row in by_code.values() if row["zoning_office_contact"].get("phone"))
    email_count = sum(1 for row in by_code.values() if row["zoning_office_contact"].get("email_or_contact_page"))
    source_timestamp = _source_timestamp(last_modified)
    return {
        "schema_version": 1,
        "generated_at": source_timestamp,
        "source": source_url,
        "source_sha256": source_sha256,
        "source_last_modified": last_modified,
        "source_contract": "nj-dca-zoning-directory-2026-v2-contact-status",
        "source_disclaimer": SOURCE_DISCLAIMER,
        "municipality_count": len(by_code),
        "completeness": {
            "directory_status": len(by_code),
            "zoning_office_contact_any": contact_any,
            "zoning_office_phone": phone_count,
            "zoning_office_email_or_contact_page": email_count,
        },
        "municipalities": dict(sorted(by_code.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if args.input:
        blob = args.input.read_bytes()
        last_modified = None
        source = args.source
    else:
        blob, last_modified = fetch_source(args.source)
        source = args.source
    artifact = build_artifact(blob, source, last_modified)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "source_sha256": artifact["source_sha256"],
        "municipality_count": artifact["municipality_count"],
        "completeness": artifact["completeness"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
