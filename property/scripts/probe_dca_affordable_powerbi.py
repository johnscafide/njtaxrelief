#!/usr/bin/env python3
"""Discovery-only probe for NJ DCA zoning directory sources.

This intentionally reuses the existing temporary networked probe workflow path.
It prints source metadata/schema only and must not be treated as LIVE marker evidence.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from xml.etree import ElementTree as ET

import requests

XLSX_URL = "https://www.nj.gov/dca/library/home/Zoning_Information_Directory.xlsx"
SERVICE = "https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/Municipal_Zoning/FeatureServer/0"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
TARGET_TERMS = ("contact", "officer", "checked", "updated", "master", "redevelopment", "planning", "land use", "land_use", "status")


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out: list[str] = []
    for si in root.findall("m:si", NS):
        out.append("".join(t.text or "" for t in si.findall(".//m:t", NS)))
    return out


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


def workbook_rows(blob: bytes) -> None:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        shared = shared_strings(zf)
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall(f"{{{PKG_REL_NS}}}Relationship")}
        sheets = []
        for s in workbook.findall("m:sheets/m:sheet", NS):
            rid = s.attrib.get(f"{{{NS['r']}}}id")
            target = rel_map.get(rid or "", "")
            path = target if target.startswith("xl/") else "xl/" + target.lstrip("/")
            sheets.append((s.attrib.get("name", ""), path))
        print("WORKBOOK_SHEETS", json.dumps([name for name, _ in sheets]))
        for name, path in sheets:
            print(f"\n### SHEET {name!r} {path}")
            try:
                root = ET.fromstring(zf.read(path))
            except KeyError:
                print("MISSING_SHEET_XML")
                continue
            seen = 0
            for row in root.findall(".//m:sheetData/m:row", NS):
                vals = [cell_value(c, shared) for c in row.findall("m:c", NS)]
                if any(str(v).strip() for v in vals):
                    print("ROW", row.attrib.get("r"), json.dumps(vals, ensure_ascii=False))
                    seen += 1
                if seen >= 15:
                    break


def arcgis_probe() -> None:
    meta = requests.get(SERVICE, params={"f": "json"}, timeout=30)
    print("\nARCGIS_META_STATUS", meta.status_code)
    meta.raise_for_status()
    m = meta.json()
    fields = [f.get("name") for f in m.get("fields", [])]
    print("ARCGIS_NAME", m.get("name"))
    print("ARCGIS_LAST_EDIT", ((m.get("editingInfo") or {}).get("lastEditDate")))
    print("ARCGIS_FIELDS", json.dumps(fields))
    print("ARCGIS_TARGET_FIELDS", json.dumps([f for f in fields if any(t in str(f).lower().replace("_", " ") for t in TARGET_TERMS)]))
    sample = requests.get(SERVICE + "/query", params={
        "f": "json", "where": "1=1", "outFields": "*", "returnGeometry": "false", "resultRecordCount": "3"
    }, timeout=30)
    print("ARCGIS_SAMPLE_STATUS", sample.status_code)
    sample.raise_for_status()
    print("ARCGIS_SAMPLE", json.dumps([x.get("attributes", {}) for x in sample.json().get("features", [])], ensure_ascii=False))


def main() -> None:
    r = requests.get(XLSX_URL, timeout=45)
    print("XLSX_STATUS", r.status_code)
    print("XLSX_TYPE", r.headers.get("content-type"))
    print("XLSX_BYTES", len(r.content))
    print("XLSX_SHA256", hashlib.sha256(r.content).hexdigest())
    print("XLSX_LAST_MODIFIED", r.headers.get("last-modified"))
    r.raise_for_status()
    workbook_rows(r.content)
    arcgis_probe()


if __name__ == "__main__":
    main()
