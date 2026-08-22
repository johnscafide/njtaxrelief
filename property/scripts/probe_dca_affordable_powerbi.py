#!/usr/bin/env python3
"""Discovery-only audit for the current NJ DCA Zoning Information Directory.

This reuses the temporary networked probe runner. It prints source metadata and
statewide completeness only; it is not production provider data and is not LIVE evidence.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from xml.etree import ElementTree as ET

import requests

XLSX_URL = "https://www.nj.gov/dca/library/home/Zoning_Information_Directory.xlsx"
SERVICE = "https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/Municipal_Zoning/FeatureServer/0"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
HEADERS = [
    "municipality", "county", "treasury_municode", "zoning_map_label",
    "zoning_ordinance_label", "zoning_office_phone", "zoning_office_email_or_contact",
    "zoning_office_or_board_website", "zoning_map_url", "zoning_ordinance_url",
]
NULLISH = {"", "--", "-", "n/a", "na", "none", "null"}


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(t.text or "" for t in si.findall(".//m:t", NS)) for si in root.findall("m:si", NS)]


def cell_value(cell: ET.Element, shared: list[str]) -> str:
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


def col_index(ref: str) -> int:
    letters = re.match(r"([A-Z]+)", ref or "")
    if not letters:
        return -1
    n = 0
    for ch in letters.group(1):
        n = n * 26 + ord(ch) - 64
    return n - 1


def clean(value: str) -> str | None:
    value = re.sub(r"\s+", " ", str(value or "").replace("\xa0", " ")).strip()
    return None if value.lower() in NULLISH else value


def read_directory(blob: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        shared = shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall(f"{{{PKG_REL_NS}}}Relationship")}
        directory_path = None
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            if sheet.attrib.get("name") != "Directory":
                continue
            rid = sheet.attrib.get(f"{{{NS['r']}}}id")
            target = rel_map.get(rid or "", "")
            directory_path = target if target.startswith("xl/") else "xl/" + target.lstrip("/")
        if not directory_path:
            raise RuntimeError("Directory sheet not found")
        root = ET.fromstring(zf.read(directory_path))
        records: list[dict] = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            row_number = int(row.attrib.get("r", "0") or 0)
            if row_number <= 3:
                continue
            vals = [None] * len(HEADERS)
            for cell in row.findall("m:c", NS):
                idx = col_index(cell.attrib.get("r", ""))
                if 0 <= idx < len(vals):
                    vals[idx] = clean(cell_value(cell, shared))
            if not vals[0] and not vals[2]:
                continue
            record = dict(zip(HEADERS, vals))
            code = re.sub(r"\D", "", record.get("treasury_municode") or "")
            record["treasury_municode"] = code.zfill(4) if code else None
            records.append(record)
        return records


def summarize(records: list[dict]) -> None:
    codes = [r["treasury_municode"] for r in records if r.get("treasury_municode")]
    counter = Counter(codes)
    duplicate_codes = sorted(k for k, v in counter.items() if v > 1)
    invalid_codes = sorted({c for c in codes if not re.fullmatch(r"\d{4}", c or "")})
    field_counts = {field: sum(1 for r in records if r.get(field)) for field in HEADERS}
    contact_any = sum(1 for r in records if r.get("zoning_office_phone") or r.get("zoning_office_email_or_contact"))
    contact_both = sum(1 for r in records if r.get("zoning_office_phone") and r.get("zoning_office_email_or_contact"))
    directory_status = sum(1 for r in records if r.get("treasury_municode") and r.get("municipality"))
    print("DIRECTORY_SUMMARY", json.dumps({
        "rows": len(records),
        "unique_codes": len(set(codes)),
        "duplicate_codes": duplicate_codes,
        "invalid_codes": invalid_codes,
        "field_nonblank": field_counts,
        "zoning_officer_contact_any": contact_any,
        "zoning_officer_contact_both": contact_both,
        "directory_listed_rows": directory_status,
    }, sort_keys=True))
    missing_contact = [
        {"code": r.get("treasury_municode"), "municipality": r.get("municipality")}
        for r in records
        if not (r.get("zoning_office_phone") or r.get("zoning_office_email_or_contact"))
    ]
    print("MISSING_CONTACT_COUNT", len(missing_contact))
    print("MISSING_CONTACT_SAMPLE", json.dumps(missing_contact[:30], ensure_ascii=False))
    for code in ("0101", "0102", "0808", "1102"):
        row = next((r for r in records if r.get("treasury_municode") == code), None)
        print("CONTROL", code, json.dumps(row, ensure_ascii=False, sort_keys=True))


def arcgis_probe() -> None:
    meta = requests.get(SERVICE, params={"f": "json"}, timeout=30)
    print("ARCGIS_META_STATUS", meta.status_code)
    meta.raise_for_status()
    m = meta.json()
    fields = [f.get("name") for f in m.get("fields", [])]
    print("ARCGIS_META", json.dumps({
        "name": m.get("name"),
        "last_edit_date": (m.get("editingInfo") or {}).get("lastEditDate"),
        "fields": fields,
    }, sort_keys=True))


def main() -> None:
    r = requests.get(XLSX_URL, timeout=45)
    print("XLSX_STATUS", r.status_code)
    print("XLSX_TYPE", r.headers.get("content-type"))
    print("XLSX_BYTES", len(r.content))
    print("XLSX_SHA256", hashlib.sha256(r.content).hexdigest())
    print("XLSX_LAST_MODIFIED", r.headers.get("last-modified"))
    r.raise_for_status()
    records = read_directory(r.content)
    summarize(records)
    arcgis_probe()


if __name__ == "__main__":
    main()
