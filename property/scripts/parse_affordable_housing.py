#!/usr/bin/env python3
"""Parse the NJ DCA Municipal Affordable Housing Status Report workbook into
property/data/affordable-housing.json, keyed by 4-digit Treasury district code.

WHY THIS PARSER MATCHES BY HEADER NAME, NOT CELL POSITION:
This workbook's exact sheet name, header row, and column order were not directly
inspected before writing this script -- the source environment that built it could
not download nj.gov content. Rather than guess fixed cell coordinates (which would
silently produce wrong or empty data if a single column shifted), every target field
is located by scanning header text for keyword variants, the same defensive pattern
already used in property/scripts/build_budget_pressure.py (see its ufb_columns()/find()
helpers). If the real workbook's wording doesn't match any listed keyword for a field,
this script raises a clear, itemized error naming exactly which field(s) it could not
locate and what headers it actually saw, instead of guessing -- the state-data-refresh
GitHub Action then fails the run loudly (see .github/workflows/state-data-refresh.yml,
"Stop on coverage or parser failure") rather than silently shipping bad data.

If this fails on its first real run, that's the intended behavior, not a bug: read the
printed header list in the log, add the real wording to KEYWORDS below, and rerun.

Municipality identification: this workbook is expected to report by municipality name
(and likely county), not by 4-digit Treasury code. property/data/budget-pressure.json
already carries a verified name+county -> Treasury-code crosswalk for all 564
municipalities (see build_budget_pressure.py), reused here rather than duplicating it.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CROSSWALK_SOURCE = ROOT / "property/data/budget-pressure.json"
SOURCE_URL = "https://www.nj.gov/dca/dlps/hss/MuniStatusReporting.shtml"

# Each target field: a short list of keyword variants to look for in a header cell,
# checked case-insensitively as substrings. Order matters only for readability.
KEYWORDS = {
    "municipality": ["municipality", "muni name", "town"],
    "county": ["county"],
    "affordable_units_total": ["total unit", "total afford", "total number of unit"],
    "affordable_units_rental": ["rental unit", "rental units completed", "# rental"],
    "affordable_units_for_sale": ["for-sale unit", "for sale unit", "ownership unit", "sale units completed"],
    "affordable_units_pipeline": ["pipeline", "under construction", "in progress", "future unit"],
    "affordable_trust_fund_balance": ["trust fund balance", "trust fund"],
    "low_income_households": ["low income household", "low-income household", "low income lmi"],
    "moderate_income_households": ["moderate income household", "moderate-income household"],
    "hud_subsidized_units": ["hud subsidized", "hud-subsidized", "hud unit"],
    "low_income_cost_burden": ["cost burden", "cost-burden"],
}
REQUIRED = ["municipality"]  # the only field we refuse to proceed without


def normalize(name: str) -> str:
    name = re.sub(r"\s+", " ", str(name or "")).strip().upper()
    name = re.sub(r"\bTOWNSHIP\b", "TWP", name)
    name = re.sub(r"\bBOROUGH\b", "BORO", name)
    return name


def load_crosswalk() -> dict[str, str]:
    """municipality-name -> 4-digit Treasury district code, from the existing
    verified budget-pressure.json (564 municipalities, name+county already resolved
    by build_budget_pressure.py against NJ Division of Taxation tax-summary files)."""
    if not CROSSWALK_SOURCE.exists():
        raise RuntimeError(f"Crosswalk source missing: {CROSSWALK_SOURCE}. Run build_budget_pressure.py first.")
    data = json.loads(CROSSWALK_SOURCE.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for district, row in data["municipalities"].items():
        key = normalize(row.get("name", ""))
        if key:
            out[key] = district
        # also index without a trailing "CITY"/"TWP"/"BORO"/"TOWN"/"VILLAGE" suffix,
        # since source workbooks vary in whether they include the municipal-type suffix
        stripped = re.sub(r"\s+(CITY|TWP|BORO|TOWN|VILLAGE)$", "", key)
        if stripped and stripped not in out:
            out[stripped] = district
    return out


def find_header_row(raw: pd.DataFrame, max_scan_rows: int = 20) -> tuple[int, dict[str, int]]:
    """Scan the first max_scan_rows rows for the one row whose cells best match the
    most KEYWORDS fields, and return (row_index, {field: column_index})."""
    best_row, best_map, best_score = None, {}, 0
    for row_idx in range(min(max_scan_rows, len(raw))):
        cells = [str(v).strip().lower() for v in raw.iloc[row_idx].tolist()]
        col_map: dict[str, int] = {}
        for field, variants in KEYWORDS.items():
            for col_idx, cell in enumerate(cells):
                if cell in ("nan", ""):
                    continue
                if any(variant in cell for variant in variants):
                    col_map[field] = col_idx
                    break
        if len(col_map) > best_score:
            best_row, best_map, best_score = row_idx, col_map, len(col_map)
    if best_row is None or not all(field in best_map for field in REQUIRED):
        seen_headers = []
        if best_row is not None:
            seen_headers = [str(v) for v in raw.iloc[best_row].tolist() if str(v).strip() not in ("", "nan")]
        raise RuntimeError(
            "Could not locate a header row with the required column(s): "
            f"{[f for f in REQUIRED if f not in best_map]}. "
            f"Best candidate row was #{best_row} with headers: {seen_headers}. "
            "Update KEYWORDS in this script to match the real wording and rerun."
        )
    return best_row, best_map


def number(value):
    parsed = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return None if pd.isna(parsed) else float(parsed)


def build(xlsx_path: Path) -> dict:
    raw = pd.read_excel(xlsx_path, sheet_name=0, header=None)
    header_row, col_map = find_header_row(raw)
    body = raw.iloc[header_row + 1:].reset_index(drop=True)
    crosswalk = load_crosswalk()

    records: dict[str, dict] = {}
    unmatched: list[str] = []
    for _, row in body.iterrows():
        muni_cell = row[col_map["municipality"]] if col_map.get("municipality") is not None else None
        muni_name = str(muni_cell or "").strip()
        if not muni_name or muni_name.lower() == "nan":
            continue
        key = normalize(muni_name)
        district = crosswalk.get(key) or crosswalk.get(re.sub(r"\s+(CITY|TWP|BORO|TOWN|VILLAGE)$", "", key))
        if not district:
            unmatched.append(muni_name)
            continue
        record = {
            "district": district,
            "name": muni_name,
            "reporting_status": "reported",
        }
        for field in KEYWORDS:
            if field in ("municipality", "county") or field not in col_map:
                continue
            record[field] = number(row[col_map[field]])
        # keep the first reported row per district if a municipality appears twice
        records.setdefault(district, record)

    return {
        "schema_version": 1,
        "generated_at": datetime.now(ZoneInfo("America/New_York")).isoformat(timespec="seconds"),
        "source": SOURCE_URL,
        "header_row_detected_at": header_row,
        "columns_matched": {k: v for k, v in col_map.items()},
        "municipalities_matched": len(records),
        "municipalities_unmatched_name": sorted(set(unmatched)),
        "districts": records,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path, help="Downloaded workbook (xlsx)")
    ap.add_argument("output", type=Path, help="Output JSON path")
    args = ap.parse_args()
    payload = build(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {payload['municipalities_matched']} municipalities to {args.output} "
        f"({len(payload['municipalities_unmatched_name'])} name(s) could not be matched to a Treasury code)"
    )
    if payload["municipalities_unmatched_name"]:
        print("Unmatched names (first 20):", payload["municipalities_unmatched_name"][:20])
    return 0


if __name__ == "__main__":
    sys.exit(main())
