#!/usr/bin/env python3
"""Recover 2016-2017 NJ segmented Class 2 COD from official county PDFs.

The NJ Division of Taxation still hosts the legacy county deviation tables as
`dev*.pdf`.  Those tables omit C/D codes, so this importer reconciles each
municipality to the current canonical 4-digit district map in
`property/uniformity.json`.  Reconciliation is exact after documented name
normalization; no fuzzy match is allowed.

Only the segmented Property Class 2 coefficient is imported.  Empty official
cells remain null.  The former Pine Valley Borough row is retained in the
source diagnostic as a legacy-only municipality and is never reassigned to a
current district.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pdfplumber
import requests

BASE = "https://www.nj.gov/treasury/taxation/pdf/lpt"
COUNTIES = {
    "ATLANTIC": "atl", "BERGEN": "ber", "BURLINGTON": "bur", "CAMDEN": "cam",
    "CAPE MAY": "cap", "CUMBERLAND": "cum", "ESSEX": "ess", "GLOUCESTER": "glo",
    "HUDSON": "hud", "HUNTERDON": "hun", "MERCER": "mer", "MIDDLESEX": "mid",
    "MONMOUTH": "mon", "MORRIS": "mor", "OCEAN": "oce", "PASSAIC": "pas",
    "SALEM": "sal", "SOMERSET": "som", "SUSSEX": "sus", "UNION": "uni",
    "WARREN": "war",
}
EXPECTED_YEARS = (2016, 2017)
LEGACY_ONLY = {("CAMDEN", "PINE VALLEY BORO")}
ALIASES = {
    ("BERGEN", "E RUTHERFORD BORO"): "EAST RUTHERFORD BORO",
}


def norm_name(value: str) -> str:
    s = value.upper().replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]+", "", s)
    s = re.sub(r"\bBOROUGH\b", "BORO", s)
    s = re.sub(r"\bTOWNSHIP\b", "TWP", s)
    s = re.sub(r"\bMT\b", "MOUNT", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Some legacy PDFs duplicate the municipality type in the source label.
    s = re.sub(r"\b(CITY|BORO|TWP|TOWN|VILLAGE) \1$", r"\1", s)
    return s


def fnum(text: str):
    t = text.strip().replace(",", "")
    if not t or t in {"-", "–", "—"}:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def fint(text: str):
    t = text.strip().replace(",", "")
    if not t or t in {"-", "–", "—"}:
        return None
    try:
        return int(float(t))
    except ValueError:
        return None


def center(word: dict) -> float:
    return (float(word["x0"]) + float(word["x1"])) / 2.0


def group_lines(words: list[dict], tolerance: float = 2.2) -> list[list[dict]]:
    ordered = sorted(words, key=lambda w: (float(w["top"]), float(w["x0"])))
    lines: list[list[dict]] = []
    tops: list[float] = []
    for w in ordered:
        top = float(w["top"])
        target = None
        for i, y in enumerate(tops):
            if abs(top - y) <= tolerance:
                target = i
                break
        if target is None:
            tops.append(top)
            lines.append([w])
        else:
            lines[target].append(w)
    return [sorted(line, key=lambda w: float(w["x0"])) for line in lines]


def infer_columns(page) -> list[float]:
    """Return centers for general,strat1,strat2,strat4,seg1,seg2,seg4,sales1,sales2,sales4,total."""
    words = page.extract_words(x_tolerance=1, y_tolerance=2, keep_blank_chars=False) or []
    lines = group_lines(words)
    numbered = []
    for line in lines:
        vals = [w for w in line if str(w["text"]).strip() in {"1", "2", "4"}]
        if len(vals) >= 9:
            numbered = vals[:9]
            break
    if len(numbered) != 9:
        raise RuntimeError("Unable to locate nine class-column headers")
    nine = [center(w) for w in numbered]

    header_words = [w for w in words if float(w["top"]) < page.height * 0.28]
    total_words = [w for w in header_words if str(w["text"]).upper() == "TOTAL"]
    general_words = [w for w in header_words if str(w["text"]).upper() == "GENERAL"]
    if not total_words or not general_words:
        raise RuntimeError("Unable to locate GENERAL/TOTAL headers")
    total_x = max(center(w) for w in total_words)
    # GENERAL is positioned over the first numeric data column, before STRATIFIED.
    general_x = min(center(w) for w in general_words)
    cols = [general_x] + nine + [total_x]
    if any(b <= a for a, b in zip(cols, cols[1:])):
        # Some PDF text engines order the header labels unexpectedly.  The first
        # class header is reliable; infer the general center from table spacing.
        gap = nine[1] - nine[0]
        general_x = nine[0] - gap
        cols = [general_x] + nine + [total_x]
    if any(b <= a for a, b in zip(cols, cols[1:])):
        raise RuntimeError(f"Invalid column geometry: {cols}")
    return cols


def nearest_column(x: float, cols: list[float]) -> int | None:
    idx = min(range(len(cols)), key=lambda i: abs(cols[i] - x))
    if len(cols) > 1:
        gaps = [b - a for a, b in zip(cols, cols[1:])]
        tolerance = min(gaps) * 0.48
    else:
        tolerance = 20
    return idx if abs(cols[idx] - x) <= tolerance else None


def parse_county(pdf_bytes: bytes, county: str) -> tuple[list[dict], dict]:
    rows = []
    page_diagnostics = []
    current_muni = None
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_no, page in enumerate(pdf.pages, 1):
            cols = infer_columns(page)
            words = page.extract_words(x_tolerance=1, y_tolerance=2, keep_blank_chars=False) or []
            line_count = 0
            for line in group_lines(words):
                year_words = [w for w in line if str(w["text"]).strip() in {"2014", "2015", "2016", "2017"}]
                if not year_words:
                    continue
                yw = year_words[0]
                year = int(str(yw["text"]).strip())
                left = [str(w["text"]) for w in line if float(w["x1"]) < float(yw["x0"]) - 2]
                if left:
                    candidate = norm_name(" ".join(left))
                    # Ignore repeated header fragments that happen to share a baseline.
                    candidate = re.sub(r"^(COUNTY MUNICIPALITY )", "", candidate).strip()
                    if candidate:
                        current_muni = candidate
                if not current_muni:
                    continue

                values: dict[int, str] = {}
                for w in line:
                    if float(w["x0"]) <= float(yw["x1"]) + 1:
                        continue
                    text = str(w["text"]).strip()
                    if not re.fullmatch(r"[-–—]|\d[\d,.]*", text):
                        continue
                    idx = nearest_column(center(w), cols)
                    if idx is None:
                        continue
                    if idx in values:
                        raise RuntimeError(f"{county} page {page_no}: two values mapped to column {idx} on {current_muni} {year}")
                    values[idx] = text
                # 0 general; 1..3 stratified 1/2/4; 4..6 segmented 1/2/4;
                # 7..9 sales 1/2/4; 10 total.  Class 2 segmented is index 5.
                rows.append({
                    "county": county,
                    "municipality_source": current_muni,
                    "year": year,
                    "cod": fnum(values.get(5, "")),
                    "sales_count": fint(values.get(8, "")),
                    "general_cod": fnum(values.get(0, "")),
                    "page": page_no,
                })
                line_count += 1
            page_diagnostics.append({"page": page_no, "columns": [round(x, 2) for x in cols], "data_rows": line_count})
    return rows, {"pages": page_diagnostics, "row_count": len(rows)}


def load_current_map(path: Path) -> tuple[dict[tuple[str, str], str], dict[str, dict]]:
    root = json.loads(path.read_text(encoding="utf-8"))
    districts = root.get("districts", {})
    mapping = {}
    metadata = {}
    for code, row in districts.items():
        county = norm_name(str(row.get("county", "")))
        name = norm_name(str(row.get("name", "")))
        key = (county, name)
        if key in mapping and mapping[key] != code:
            raise RuntimeError(f"Duplicate normalized district identity {key}")
        mapping[key] = code
        metadata[code] = {"county": county, "name": name}
    if len(metadata) != 564:
        raise RuntimeError(f"Expected 564 current districts, found {len(metadata)}")
    return mapping, metadata


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uniformity", default="property/uniformity.json")
    ap.add_argument("--output", default="property/data/cod/historical-cod-2016-2017.json")
    ap.add_argument("--diagnostic", default="property/data/cod/historical-cod-2016-2017-diagnostic.json")
    ap.add_argument("--timeout", type=int, default=90)
    args = ap.parse_args()

    mapping, metadata = load_current_map(Path(args.uniformity))
    by_code: dict[str, dict[str, float | None]] = {code: {} for code in metadata}
    sales_by_code: dict[str, dict[str, int | None]] = {code: {} for code in metadata}
    source_rows = []
    diagnostics = {"counties": {}, "unmatched": [], "legacy_only": [], "duplicates": []}

    for county, suffix in COUNTIES.items():
        url = f"{BASE}/dev{suffix}.pdf"
        r = requests.get(url, timeout=args.timeout, headers={"User-Agent": "Watchdog-DataCenter/1.0"})
        r.raise_for_status()
        rows, county_diag = parse_county(r.content, county)
        county_diag["url"] = url
        diagnostics["counties"][county] = county_diag
        for row in rows:
            if row["year"] not in EXPECTED_YEARS:
                continue
            raw_name = norm_name(row["municipality_source"])
            alias = ALIASES.get((county, raw_name), raw_name)
            key = (county, alias)
            code = mapping.get(key)
            if not code:
                if (county, raw_name) in LEGACY_ONLY:
                    diagnostics["legacy_only"].append({"county": county, "municipality": raw_name, "year": row["year"]})
                else:
                    diagnostics["unmatched"].append({"county": county, "municipality": raw_name, "year": row["year"]})
                continue
            year_key = str(row["year"])
            if year_key in by_code[code]:
                diagnostics["duplicates"].append({"code": code, "year": row["year"], "source": raw_name})
                continue
            by_code[code][year_key] = row["cod"]
            sales_by_code[code][year_key] = row["sales_count"]
            source_rows.append({"code": code, "year": row["year"], "cod": row["cod"], "sales_count": row["sales_count"]})

    missing = []
    for code, meta in metadata.items():
        for year in EXPECTED_YEARS:
            if str(year) not in by_code[code]:
                missing.append({"code": code, "county": meta["county"], "municipality": meta["name"], "year": year})
    diagnostics["missing_current_district_years"] = missing
    diagnostics["matched_district_years"] = len(source_rows)
    diagnostics["current_district_count"] = len(metadata)
    diagnostics["expected_district_years"] = len(metadata) * len(EXPECTED_YEARS)
    diagnostics["status"] = "pass" if not diagnostics["unmatched"] and not diagnostics["duplicates"] and not missing else "blocked"

    diag_path = Path(args.diagnostic)
    diag_path.parent.mkdir(parents=True, exist_ok=True)
    diag_path.write_text(json.dumps(diagnostics, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if diagnostics["status"] != "pass":
        print(json.dumps({
            "status": diagnostics["status"],
            "unmatched": len(diagnostics["unmatched"]),
            "duplicates": len(diagnostics["duplicates"]),
            "missing": len(missing),
            "legacy_only": len(diagnostics["legacy_only"]),
        }, indent=2), file=sys.stderr)
        raise SystemExit(2)

    out = {
        "schema_version": 1,
        "source_id": "nj-cod-historical-county-pdfs",
        "source_agency": "NJ Division of Taxation",
        "metric": "segmented_class_2_cod",
        "years": list(EXPECTED_YEARS),
        "source_urls": [f"{BASE}/dev{suffix}.pdf" for suffix in COUNTIES.values()],
        "district_count": len(metadata),
        "legacy_only_excluded": [{"county": "CAMDEN", "municipality": "PINE VALLEY BORO", "reason": "former municipality; not reassigned to a current district"}],
        "districts": {
            code: {
                "name": metadata[code]["name"],
                "county": metadata[code]["county"],
                "series": by_code[code],
                "class_2_sales": sales_by_code[code],
            }
            for code in sorted(metadata)
        },
    }
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "pass", "districts": len(metadata), "district_years": len(source_rows), "output": str(out_path)}, indent=2))


if __name__ == "__main__":
    main()
