#!/usr/bin/env python3
"""Parse NJ DCA Municipal Affordable Housing Status data into governed JSON.

Safety properties:
- scans every workbook sheet instead of assuming the first sheet contains data;
- locates columns by header meaning rather than fixed cell position;
- resolves municipality identity by municipality + county whenever county exists;
- permits name-only fallback only when that normalized municipal name maps to one
  Treasury district statewide;
- never guesses an ambiguous Washington/Franklin/etc. municipality;
- fails loudly when no usable table can be found.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CROSSWALK_SOURCE = ROOT / "property/data/budget-pressure.json"
SOURCE_URL = "https://www.nj.gov/dca/dlps/hss/MuniStatusReporting.shtml"

KEYWORDS = {
    "municipality": ["municipality", "muni name", "municipal name", "town"],
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
REQUIRED = ["municipality"]
MUNICIPAL_SUFFIX_RE = re.compile(r"\s+(CITY|TWP|BORO|TOWN|VILLAGE)$")


def normalize(name: str) -> str:
    value = re.sub(r"\s+", " ", str(name or "")).strip().upper()
    value = re.sub(r"\bTOWNSHIP\b", "TWP", value)
    value = re.sub(r"\bBOROUGH\b", "BORO", value)
    return value


def normalize_county(name: str) -> str:
    value = re.sub(r"\s+", " ", str(name or "")).strip().upper()
    value = re.sub(r"\s+COUNTY$", "", value)
    return value


def name_aliases(name: str) -> list[str]:
    key = normalize(name)
    if not key:
        return []
    stripped = MUNICIPAL_SUFFIX_RE.sub("", key)
    return list(dict.fromkeys([key, stripped] if stripped else [key]))


def load_crosswalk() -> tuple[dict[tuple[str, str], str], dict[str, str], set[str]]:
    """Return county-aware and safe unique-name Treasury-code lookups.

    A name-only key is exposed only when every occurrence of that normalized alias
    statewide points to the same district. Ambiguous aliases intentionally have no
    fallback entry.
    """
    if not CROSSWALK_SOURCE.exists():
        raise RuntimeError(f"Crosswalk source missing: {CROSSWALK_SOURCE}. Run build_budget_pressure.py first.")
    data = json.loads(CROSSWALK_SOURCE.read_text(encoding="utf-8"))
    municipalities = data.get("municipalities") or {}
    by_pair: dict[tuple[str, str], str] = {}
    districts_by_name: dict[str, set[str]] = defaultdict(set)

    for district, row in municipalities.items():
        county = normalize_county(row.get("county", ""))
        for alias in name_aliases(row.get("name", "")):
            districts_by_name[alias].add(str(district))
            if county:
                pair = (alias, county)
                existing = by_pair.get(pair)
                if existing and existing != str(district):
                    raise RuntimeError(
                        f"Crosswalk collision for municipality/county {pair}: {existing} vs {district}"
                    )
                by_pair[pair] = str(district)

    unique_by_name = {
        alias: next(iter(districts))
        for alias, districts in districts_by_name.items()
        if len(districts) == 1
    }
    ambiguous = {alias for alias, districts in districts_by_name.items() if len(districts) > 1}
    return by_pair, unique_by_name, ambiguous


def header_map_for_row(raw: pd.DataFrame, row_idx: int) -> dict[str, int]:
    cells = [str(v).strip().lower() for v in raw.iloc[row_idx].tolist()]
    col_map: dict[str, int] = {}
    for field, variants in KEYWORDS.items():
        for col_idx, cell in enumerate(cells):
            if cell in ("nan", ""):
                continue
            if any(variant in cell for variant in variants):
                col_map[field] = col_idx
                break
    return col_map


def best_header_candidate(raw: pd.DataFrame, max_scan_rows: int = 40):
    best = None
    for row_idx in range(min(max_scan_rows, len(raw))):
        col_map = header_map_for_row(raw, row_idx)
        if not all(field in col_map for field in REQUIRED):
            continue
        candidate = (len(col_map), -row_idx, row_idx, col_map)
        if best is None or candidate[:2] > best[:2]:
            best = candidate
    return best


def choose_sheet(xlsx_path: Path) -> tuple[str, pd.DataFrame, int, dict[str, int]]:
    book = pd.ExcelFile(xlsx_path)
    candidates = []
    failures = []
    for sheet_name in book.sheet_names:
        try:
            raw = pd.read_excel(book, sheet_name=sheet_name, header=None)
        except Exception as error:
            failures.append(f"{sheet_name}: {type(error).__name__}: {error}")
            continue
        candidate = best_header_candidate(raw)
        if candidate is None:
            failures.append(f"{sheet_name}: no municipality header in first 40 rows")
            continue
        score, neg_row, row_idx, col_map = candidate
        # Prefer stronger semantic coverage, then the earlier header row.
        candidates.append((score, neg_row, str(sheet_name), raw, row_idx, col_map))

    if not candidates:
        detail = "; ".join(failures[:12]) or "no readable sheets"
        raise RuntimeError(f"No usable municipal-status table found in workbook. {detail}")

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    _, _, sheet_name, raw, row_idx, col_map = candidates[0]
    return sheet_name, raw, row_idx, col_map


def number(value):
    parsed = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return None if pd.isna(parsed) else float(parsed)


def resolve_district(
    municipality: str,
    county: str,
    by_pair: dict[tuple[str, str], str],
    unique_by_name: dict[str, str],
    ambiguous_names: set[str],
) -> tuple[str | None, str]:
    aliases = name_aliases(municipality)
    county_key = normalize_county(county)
    if county_key:
        for alias in aliases:
            district = by_pair.get((alias, county_key))
            if district:
                return district, "municipality_county"

    for alias in aliases:
        district = unique_by_name.get(alias)
        if district:
            return district, "unique_municipality_name"

    if any(alias in ambiguous_names for alias in aliases):
        return None, "ambiguous_municipality_name"
    return None, "unmatched_municipality_name"


def build(xlsx_path: Path) -> dict:
    sheet_name, raw, header_row, col_map = choose_sheet(xlsx_path)
    body = raw.iloc[header_row + 1 :].reset_index(drop=True)
    by_pair, unique_by_name, ambiguous_names = load_crosswalk()

    records: dict[str, dict] = {}
    unmatched: list[str] = []
    ambiguous: list[str] = []
    duplicate_rows = 0
    match_methods = defaultdict(int)

    for _, row in body.iterrows():
        muni_cell = row[col_map["municipality"]]
        muni_name = str(muni_cell or "").strip()
        if not muni_name or muni_name.lower() == "nan":
            continue
        county_name = ""
        if "county" in col_map:
            county_cell = row[col_map["county"]]
            county_name = "" if pd.isna(county_cell) else str(county_cell).strip()

        district, method = resolve_district(
            muni_name, county_name, by_pair, unique_by_name, ambiguous_names
        )
        if not district:
            label = f"{muni_name} ({county_name})" if county_name else muni_name
            if method == "ambiguous_municipality_name":
                ambiguous.append(label)
            else:
                unmatched.append(label)
            continue

        match_methods[method] += 1
        record = {
            "district": district,
            "name": muni_name,
            "county": county_name or None,
            "reporting_status": "reported",
            "identity_match": method,
        }
        for field in KEYWORDS:
            if field in ("municipality", "county") or field not in col_map:
                continue
            record[field] = number(row[col_map[field]])

        if district in records:
            duplicate_rows += 1
            continue
        records[district] = record

    return {
        "schema_version": 2,
        "generated_at": datetime.now(ZoneInfo("America/New_York")).isoformat(timespec="seconds"),
        "source": SOURCE_URL,
        "sheet_detected": sheet_name,
        "header_row_detected_at": header_row,
        "columns_matched": {k: v for k, v in col_map.items()},
        "municipalities_matched": len(records),
        "match_methods": dict(sorted(match_methods.items())),
        "duplicate_rows_ignored": duplicate_rows,
        "municipalities_unmatched_name": sorted(set(unmatched)),
        "municipalities_ambiguous_name": sorted(set(ambiguous)),
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
        f"Wrote {payload['municipalities_matched']} municipalities to {args.output} from sheet "
        f"{payload['sheet_detected']!r}; unmatched={len(payload['municipalities_unmatched_name'])}, "
        f"ambiguous={len(payload['municipalities_ambiguous_name'])}"
    )
    if payload["municipalities_unmatched_name"]:
        print("Unmatched names (first 20):", payload["municipalities_unmatched_name"][:20])
    if payload["municipalities_ambiguous_name"]:
        print("Ambiguous names (first 20):", payload["municipalities_ambiguous_name"][:20])
    return 0


if __name__ == "__main__":
    sys.exit(main())
