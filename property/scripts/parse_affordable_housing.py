#!/usr/bin/env python3
"""Parse NJ DCA Municipal Affordable Housing Status workbook into governed municipal JSON.

The DCA workbook is not one flat municipal table. It contains project-level unit data
and a separate municipal affordable-housing trust-fund table. This parser:

1. scans every workbook sheet and locates semantic headers;
2. prefers Taxation/DCA municipal codes when they match the governed Treasury district crosswalk;
3. otherwise resolves municipality + county, then only a statewide-unique name fallback;
4. aggregates project-level affordable-unit rows to one municipal record;
5. merges trust-fund balance data without silently summing conflicting duplicate balances;
6. keeps unmatched, ambiguous and conflict evidence explicit.

No missing value is invented and ambiguous municipal identity fails closed.
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
    "taxation_muni_code": ["taxation muni code", "taxation municipality code"],
    "dca_muni_code": ["dca muni code", "dca municipality code"],
    "affordable_units_total": ["total units", "total afford", "total number of unit"],
    "affordable_units_rental": ["for rent", "rental unit", "rental units completed", "# rental"],
    "affordable_units_for_sale": ["for sale", "for-sale", "ownership unit", "sale units completed"],
    "affordable_units_pipeline": ["pipeline", "under construction", "in progress", "future unit"],
    "affordable_trust_fund_balance": ["balance in account", "trust fund balance", "ahtf balance"],
    "low_income_households": ["low income (affordable", "low income household", "low-income household"],
    "moderate_income_households": ["moderate income (affordable", "moderate income household", "moderate-income household"],
    "hud_subsidized_units": ["hud subsidized", "hud-subsidized", "hud unit"],
    "low_income_cost_burden": ["cost burden", "cost-burden"],
}
REQUIRED = ["municipality"]
PROJECT_FIELDS = [
    "affordable_units_total",
    "affordable_units_rental",
    "affordable_units_for_sale",
    "affordable_units_pipeline",
    "low_income_households",
    "moderate_income_households",
    "hud_subsidized_units",
    "low_income_cost_burden",
]
TRUST_FIELDS = ["affordable_trust_fund_balance"]
MUNICIPAL_SUFFIX_RE = re.compile(r"\s+(CITY|TWP|BORO|TOWN|VILLAGE)$")


def normalize(name: str) -> str:
    value = re.sub(r"\s+", " ", str(name or "")).strip().upper().rstrip(".")
    value = re.sub(r"\bTOWNSHIP\b", "TWP", value)
    value = re.sub(r"\bBOROUGH\b", "BORO", value)
    return value


def normalize_county(name: str) -> str:
    value = re.sub(r"\s+", " ", str(name or "")).strip().upper()
    return re.sub(r"\s+COUNTY$", "", value)


def name_aliases(name: str) -> list[str]:
    full = normalize(name)
    if not full:
        return []
    stripped = MUNICIPAL_SUFFIX_RE.sub("", full)
    return list(dict.fromkeys([full, stripped] if stripped and stripped != full else [full]))


def municipal_code(value) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    text = re.sub(r"\.0+$", "", text)
    digits = re.sub(r"\D", "", text)
    if not digits or len(digits) > 4:
        return None
    return digits.zfill(4)


def load_crosswalk():
    if not CROSSWALK_SOURCE.exists():
        raise RuntimeError(f"Crosswalk source missing: {CROSSWALK_SOURCE}. Run build_budget_pressure.py first.")
    data = json.loads(CROSSWALK_SOURCE.read_text(encoding="utf-8"))
    municipalities = data.get("municipalities") or {}
    valid_districts = {str(k) for k in municipalities.keys()}
    exact_pairs: dict[tuple[str, str], str] = {}
    alias_pair_candidates: dict[tuple[str, str], set[str]] = defaultdict(set)
    districts_by_name: dict[str, set[str]] = defaultdict(set)

    for district, row in municipalities.items():
        district = str(district)
        county = normalize_county(row.get("county", ""))
        aliases = name_aliases(row.get("name", ""))
        if not aliases:
            continue
        full = aliases[0]
        if county:
            pair = (full, county)
            existing = exact_pairs.get(pair)
            if existing and existing != district:
                raise RuntimeError(f"Exact crosswalk collision for {pair}: {existing} vs {district}")
            exact_pairs[pair] = district
        for alias in aliases:
            districts_by_name[alias].add(district)
            if county:
                alias_pair_candidates[(alias, county)].add(district)

    # Stripped aliases such as EGG HARBOR are admitted only when unique inside
    # the county. Exact full-name pairs always retain precedence.
    by_pair = dict(exact_pairs)
    for pair, districts in alias_pair_candidates.items():
        if len(districts) == 1:
            by_pair.setdefault(pair, next(iter(districts)))

    unique_by_name = {
        alias: next(iter(districts))
        for alias, districts in districts_by_name.items()
        if len(districts) == 1
    }
    ambiguous_names = {alias for alias, districts in districts_by_name.items() if len(districts) > 1}
    return municipalities, valid_districts, by_pair, unique_by_name, ambiguous_names


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


def discover_tables(xlsx_path: Path, max_scan_rows: int = 50):
    book = pd.ExcelFile(xlsx_path)
    tables = []
    failures = []
    for sheet_name in book.sheet_names:
        try:
            raw = pd.read_excel(book, sheet_name=sheet_name, header=None)
        except Exception as error:
            failures.append(f"{sheet_name}: {type(error).__name__}: {error}")
            continue
        best = None
        for row_idx in range(min(max_scan_rows, len(raw))):
            col_map = header_map_for_row(raw, row_idx)
            if not all(field in col_map for field in REQUIRED):
                continue
            score = len(col_map)
            candidate = (score, -row_idx, row_idx, col_map)
            if best is None or candidate[:2] > best[:2]:
                best = candidate
        if best is None:
            failures.append(f"{sheet_name}: no municipality header in first {max_scan_rows} rows")
            continue
        score, _, row_idx, col_map = best
        tables.append({"sheet": str(sheet_name), "raw": raw, "header_row": row_idx, "columns": col_map, "score": score})
    if not tables:
        raise RuntimeError("No usable municipal table found. " + "; ".join(failures[:12]))
    return tables, failures


def choose_table(tables, required_any: list[str], label: str):
    candidates = []
    for table in tables:
        matched = [field for field in required_any if field in table["columns"]]
        if not matched:
            continue
        name = table["sheet"].lower()
        name_bonus = 3 if (label == "projects" and "project" in name) or (label == "trust" and ("ahtf" in name or "trust" in name)) else 0
        candidates.append((len(matched) * 10 + table["score"] + name_bonus, table))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def number(value):
    parsed = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return None if pd.isna(parsed) else float(parsed)


def resolve_district(row, col_map, valid_districts, by_pair, unique_by_name, ambiguous_names):
    for field, method in (("taxation_muni_code", "taxation_muni_code"), ("dca_muni_code", "dca_muni_code")):
        if field in col_map:
            code = municipal_code(row[col_map[field]])
            if code and code in valid_districts:
                return code, method

    muni_name = str(row[col_map["municipality"]] if "municipality" in col_map else "").strip()
    county_name = ""
    if "county" in col_map:
        county_cell = row[col_map["county"]]
        county_name = "" if pd.isna(county_cell) else str(county_cell).strip()
    aliases = name_aliases(muni_name)
    county_key = normalize_county(county_name)
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


def identity_label(row, col_map):
    muni = str(row[col_map["municipality"]] if "municipality" in col_map else "").strip()
    county = ""
    if "county" in col_map:
        value = row[col_map["county"]]
        county = "" if pd.isna(value) else str(value).strip()
    return f"{muni} ({county})" if county else muni, muni, county


def ensure_record(records, district, municipalities, muni_name, county_name, method):
    base = municipalities.get(district, {})
    record = records.setdefault(
        district,
        {
            "district": district,
            "name": base.get("name") or muni_name or None,
            "county": base.get("county") or county_name or None,
            "reporting_status": "reported",
            "identity_methods": [],
            "project_records": 0,
        },
    )
    if method not in record["identity_methods"]:
        record["identity_methods"].append(method)
    return record


def aggregate_projects(table, records, municipalities, valid_districts, by_pair, unique_by_name, ambiguous_names, diagnostics):
    if table is None:
        diagnostics["project_table_missing"] = True
        return
    body = table["raw"].iloc[table["header_row"] + 1 :].reset_index(drop=True)
    col_map = table["columns"]
    observed_fields: dict[str, set[str]] = defaultdict(set)
    for _, row in body.iterrows():
        label, muni_name, county_name = identity_label(row, col_map)
        if not muni_name or muni_name.lower() == "nan":
            continue
        district, method = resolve_district(row, col_map, valid_districts, by_pair, unique_by_name, ambiguous_names)
        if not district:
            diagnostics["ambiguous" if method == "ambiguous_municipality_name" else "unmatched"].add(label)
            continue
        rec = ensure_record(records, district, municipalities, muni_name, county_name, method)
        rec["project_records"] += 1
        for field in PROJECT_FIELDS:
            if field not in col_map:
                continue
            value = number(row[col_map[field]])
            if value is None:
                continue
            rec[field] = float(rec.get(field, 0.0)) + value
            observed_fields[district].add(field)
    diagnostics["project_sheet"] = table["sheet"]
    diagnostics["project_header_row"] = table["header_row"]
    diagnostics["project_columns"] = sorted(table["columns"].keys())
    diagnostics["project_municipalities"] = len(observed_fields)


def merge_trust(table, records, municipalities, valid_districts, by_pair, unique_by_name, ambiguous_names, diagnostics):
    if table is None:
        diagnostics["trust_table_missing"] = True
        return
    body = table["raw"].iloc[table["header_row"] + 1 :].reset_index(drop=True)
    col_map = table["columns"]
    balance_field = "affordable_trust_fund_balance"
    seen_balances: dict[str, set[float]] = defaultdict(set)
    for _, row in body.iterrows():
        label, muni_name, county_name = identity_label(row, col_map)
        if not muni_name or muni_name.lower() == "nan":
            continue
        district, method = resolve_district(row, col_map, valid_districts, by_pair, unique_by_name, ambiguous_names)
        if not district:
            diagnostics["ambiguous" if method == "ambiguous_municipality_name" else "unmatched"].add(label)
            continue
        rec = ensure_record(records, district, municipalities, muni_name, county_name, method)
        if balance_field not in col_map:
            continue
        value = number(row[col_map[balance_field]])
        if value is None:
            continue
        seen_balances[district].add(value)
        if len(seen_balances[district]) == 1:
            rec[balance_field] = value
        else:
            # Conflicting duplicate trust balances are evidence of unresolved source
            # duplication; remove the value rather than silently picking/summing one.
            rec.pop(balance_field, None)
            rec["trust_balance_conflict"] = True
    diagnostics["trust_sheet"] = table["sheet"]
    diagnostics["trust_header_row"] = table["header_row"]
    diagnostics["trust_columns"] = sorted(table["columns"].keys())
    diagnostics["trust_balance_conflicts"] = sum(1 for values in seen_balances.values() if len(values) > 1)


def tidy_number(value):
    if not isinstance(value, float):
        return value
    return int(value) if value.is_integer() else round(value, 2)


def build(xlsx_path: Path) -> dict:
    tables, discovery_failures = discover_tables(xlsx_path)
    project_table = choose_table(tables, PROJECT_FIELDS, "projects")
    trust_table = choose_table(tables, TRUST_FIELDS, "trust")
    municipalities, valid_districts, by_pair, unique_by_name, ambiguous_names = load_crosswalk()
    records: dict[str, dict] = {}
    diagnostics = {"unmatched": set(), "ambiguous": set(), "discovery_failures": discovery_failures}

    aggregate_projects(project_table, records, municipalities, valid_districts, by_pair, unique_by_name, ambiguous_names, diagnostics)
    merge_trust(trust_table, records, municipalities, valid_districts, by_pair, unique_by_name, ambiguous_names, diagnostics)

    for record in records.values():
        for key, value in list(record.items()):
            record[key] = tidy_number(value)
        record["identity_methods"] = sorted(record.get("identity_methods", []))

    match_methods = defaultdict(int)
    for record in records.values():
        for method in record.get("identity_methods", []):
            match_methods[method] += 1

    return {
        "schema_version": 3,
        "generated_at": datetime.now(ZoneInfo("America/New_York")).isoformat(timespec="seconds"),
        "source": SOURCE_URL,
        "source_contract": "dca-affordable-housing-municipal-v3-project-trust-merge",
        "municipalities_matched": len(records),
        "match_methods": dict(sorted(match_methods.items())),
        "project_sheet": diagnostics.get("project_sheet"),
        "project_header_row_detected_at": diagnostics.get("project_header_row"),
        "project_columns_matched": diagnostics.get("project_columns", []),
        "trust_sheet": diagnostics.get("trust_sheet"),
        "trust_header_row_detected_at": diagnostics.get("trust_header_row"),
        "trust_columns_matched": diagnostics.get("trust_columns", []),
        "trust_balance_conflicts": diagnostics.get("trust_balance_conflicts", 0),
        "municipalities_unmatched_name": sorted(diagnostics["unmatched"]),
        "municipalities_ambiguous_name": sorted(diagnostics["ambiguous"]),
        "sheet_discovery_notes": diagnostics["discovery_failures"],
        "districts": dict(sorted(records.items())),
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
        f"Wrote {payload['municipalities_matched']} municipalities to {args.output}; "
        f"project_sheet={payload['project_sheet']!r}; trust_sheet={payload['trust_sheet']!r}; "
        f"unmatched={len(payload['municipalities_unmatched_name'])}; "
        f"ambiguous={len(payload['municipalities_ambiguous_name'])}; "
        f"trust_conflicts={payload['trust_balance_conflicts']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
