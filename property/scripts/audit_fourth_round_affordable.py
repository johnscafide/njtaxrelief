#!/usr/bin/env python3
"""Audit the official NJ DCA Fourth Round affordable-housing calculation workbook.

This is a source-contract diagnostic only. It downloads the official workbook,
records sheet dimensions, and locates municipality / present-need / prospective-
need / regional / land-capacity semantics without publishing any Data Center value.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from openpyxl import load_workbook

SOURCE_URL = "https://www.nj.gov/dca/dlps/pdf/FourthRoundCalculation_Workbook.xlsx"
TARGETS = {
    "municipality": [r"municipalit", r"municipal name"],
    "county": [r"county"],
    "region": [r"region"],
    "present_need": [r"present need"],
    "prospective_need": [r"prospective need"],
    "fair_share": [r"fair share", r"obligation"],
    "land_capacity": [r"land capacity", r"developable land", r"vacant land"],
    "income_capacity": [r"income capacity", r"income factor"],
    "nonresidential": [r"non.?residential", r"nonresidential"],
}


def norm(v: object) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    response = requests.get(SOURCE_URL, timeout=120)
    response.raise_for_status()
    content = response.content

    tmp = args.output.with_suffix(".xlsx")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(content)
    wb = load_workbook(tmp, read_only=True, data_only=True)

    sheets = []
    hits = {k: [] for k in TARGETS}
    for ws in wb.worksheets:
        sheets.append({"name": ws.title, "max_row": ws.max_row, "max_column": ws.max_column})
        # Audit the top 80 rows; calculation workbooks commonly keep headers/labels there.
        for r_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 80), values_only=True), start=1):
            for c_idx, value in enumerate(row, start=1):
                text = norm(value)
                if not text:
                    continue
                low = text.lower()
                for key, patterns in TARGETS.items():
                    if any(re.search(p, low, flags=re.I) for p in patterns):
                        hits[key].append({"sheet": ws.title, "row": r_idx, "column": c_idx, "text": text[:500]})

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_url": SOURCE_URL,
        "workbook_bytes": len(content),
        "sheets": sheets,
        "target_hits": hits,
        "target_hit_counts": {k: len(v) for k, v in hits.items()},
        "activation_gate": {
            "status": "diagnostic_only",
            "rule": "Do not publish Fourth Round markers until municipality-level rows and exact field semantics are validated against DCA methodology and all 564 municipalities are reconciled."
        }
    }
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.unlink(missing_ok=True)
    print(json.dumps(payload["target_hit_counts"], sort_keys=True))


if __name__ == "__main__":
    main()
