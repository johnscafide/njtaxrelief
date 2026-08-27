#!/usr/bin/env python3
"""Build the governed Watchdog v0.38 NJ DCA Development Trends source pack.

Input is the official DCA Development Trends Viewer XLSB. This builder:
- validates source identity / cover date / latest published annual year,
- reads only the governed Source Data sheet,
- applies only source-explicit legacy municipality handling,
- emits a compact 564-municipality source artifact,
- emits 46 bounded marker definitions (34 public facts/series + 12 exact arithmetic markers),
- optionally adds those definitions to the canonical marker registry as planned.

Requires: pyxlsb
"""
from __future__ import annotations
import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from pyxlsb import open_workbook

SOURCE_ID = "nj-dca-development-trends"
RELEASE = "nj-dca-development-trends-2025-08-21-v1"
SOURCE_AS_OF = "2025-08-21"
LATEST_YEAR = 2024
SERIES_YEARS = [2020, 2021, 2022, 2023, 2024]
EXPECTED_MUNICIPALITIES = 564

LATEST_FIELDS = [
    ("latest_annual_housing_units_authorized", 100000, "Latest annual housing units authorized", "count"),
    ("latest_annual_one_two_family_units_authorized", 200000, "Latest annual 1 & 2 family housing units authorized", "count"),
    ("latest_annual_multifamily_units_authorized", 300000, "Latest annual multifamily housing units authorized", "count"),
    ("latest_annual_mixed_use_units_authorized", 400000, "Latest annual mixed-use housing units authorized", "count"),
    ("latest_annual_new_housing_units_authorized", 600000, "Latest annual new-construction housing units authorized", "count"),
    ("latest_annual_new_one_two_family_units_authorized", 700000, "Latest annual new 1 & 2 family housing units authorized", "count"),
    ("latest_annual_new_multifamily_units_authorized", 800000, "Latest annual new multifamily housing units authorized", "count"),
    ("latest_annual_new_mixed_use_units_authorized", 900000, "Latest annual new mixed-use housing units authorized", "count"),
    ("latest_annual_residential_addition_alteration_units_authorized", 1000000, "Latest annual residential additions/alterations housing units authorized", "count"),
    ("latest_annual_construction_cost_authorized", 1400000, "Latest annual construction cost authorized", "usd"),
    ("latest_annual_residential_new_construction_cost", 1500000, "Latest annual residential new-construction cost", "usd"),
    ("latest_annual_residential_addition_alteration_cost", 1600000, "Latest annual residential additions/alterations cost", "usd"),
    ("latest_annual_nonresidential_new_construction_cost", 1700000, "Latest annual nonresidential new-construction cost", "usd"),
    ("latest_annual_nonresidential_addition_alteration_cost", 1800000, "Latest annual nonresidential additions/alterations cost", "usd"),
    ("latest_annual_office_new_construction_square_feet", 1900000, "Latest annual office new-construction square feet", "square_feet"),
    ("latest_annual_office_addition_square_feet", 2000000, "Latest annual office addition square feet", "square_feet"),
    ("latest_annual_retail_new_construction_square_feet", 2100000, "Latest annual retail new-construction square feet", "square_feet"),
    ("latest_annual_retail_addition_square_feet", 2200000, "Latest annual retail addition square feet", "square_feet"),
    ("latest_annual_total_nonresidential_square_feet", 1850000, "Latest annual total nonresidential square feet", "square_feet"),
    ("latest_annual_demolitions", 3600000, "Latest annual demolitions", "count"),
    ("latest_annual_one_two_family_demolitions", 3700000, "Latest annual 1 & 2 family demolitions", "count"),
    ("latest_annual_multifamily_demolitions", 3800000, "Latest annual multifamily demolitions", "count"),
    ("latest_annual_mixed_use_demolitions", 3900000, "Latest annual mixed-use demolitions", "count"),
    ("latest_annual_net_housing_unit_change", 4000000, "Latest annual net housing unit change", "count"),
    ("latest_annual_net_one_two_family_unit_change", 4100000, "Latest annual net 1 & 2 family unit change", "count"),
    ("latest_annual_net_multifamily_unit_change", 4200000, "Latest annual net multifamily unit change", "count"),
    ("latest_annual_net_mixed_use_unit_change", 4300000, "Latest annual net mixed-use unit change", "count"),
]
SERIES_FIELDS = [
    ("housing_units_authorized", 100000, "TOTAL HOUSING UNITS - BUILDING PERMITS", "count"),
    ("new_housing_units_authorized", 600000, "TOTAL NEW CONSTRUCTION HOUSING UNITS - BUILDING PERMITS", "count"),
    ("construction_cost_authorized", 1400000, "All Construction Costs", "usd"),
    ("total_nonresidential_square_feet", 1850000, "Total Nonres. SF", "square_feet"),
    ("demolitions", 3600000, "TOTAL DEMOLITIONS", "count"),
    ("net_housing_unit_change", 4000000, "Net Change in Housing Units - TOTAL", "count"),
]
PROFESSIONS = ["agent", "lender", "appraiser", "contractor", "investor", "municipal"]

def cells(row: Any) -> list[Any]: return [c.v for c in row]

def clean_number(v: Any) -> int | float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"Expected numeric source value, got {v!r}")
    x = float(v)
    return int(x) if x.is_integer() else x

def normalized_municode(code: str) -> str | None:
    code = str(code or "").strip()
    if not code: return None
    code = code.zfill(4)
    if code in {"1109", "0429", "2118", "9999"}: return None
    if code == "1110": return "1114"
    return code if len(code) == 4 and code.isdigit() else None

def build(source: Path) -> tuple[dict[str, Any], dict[str, Any], str]:
    raw = source.read_bytes(); source_sha = hashlib.sha256(raw).hexdigest()
    with open_workbook(str(source)) as wb:
        required = {"Cover", "Glossary", "Source Data", "Active Data for Viewers"}
        missing = required.difference(wb.sheets)
        if missing: raise RuntimeError(f"Missing expected sheets: {sorted(missing)}")
        with wb.get_sheet("Cover") as sh:
            cover_text = "\n".join(str(v) for row in sh.rows() for v in cells(row) if v is not None)
        if "Development Trends Viewer" not in cover_text or "8/21/2025" not in cover_text:
            raise RuntimeError("Workbook identity/as-of date did not match certified source contract")
        latest = None
        with wb.get_sheet("Active Data for Viewers") as sh:
            for row in sh.rows():
                vals = cells(row)
                for i, v in enumerate(vals):
                    if str(v or "").strip() == "LATEST DATA YEAR":
                        for cand in vals[i+1:i+4]:
                            if isinstance(cand, (int, float)): latest = int(cand); break
        if latest != LATEST_YEAR: raise RuntimeError(f"Expected latest published data year {LATEST_YEAR}, found {latest}")
        rows_by_code: dict[int, list[list[Any]]] = {}; header: list[Any] | None = None
        with wb.get_sheet("Source Data") as sh:
            for row in sh.rows():
                vals = cells(row)
                if vals and vals[0] == "Category Code":
                    if header is None: header = vals
                    continue
                if vals and isinstance(vals[0], (int, float)):
                    rows_by_code.setdefault(int(vals[0]), []).append(vals)
        if header is None: raise RuntimeError("Source Data header not found")
        year_index = {int(v): i for i, v in enumerate(header) if isinstance(v, (int, float)) and 1900 <= int(v) <= 2100}
        for y in SERIES_YEARS:
            if y not in year_index: raise RuntimeError(f"Missing source year {y}")
        exact_headings: dict[int, str] = {}
        with wb.get_sheet("Source Data") as sh:
            pending_heading: str | None = None
            for row in sh.rows():
                vals = cells(row)
                if vals and isinstance(vals[0], str) and vals[0] not in {"Category Code", "Source Data"}:
                    pending_heading = str(vals[0]).strip(); continue
                if vals and isinstance(vals[0], (int, float)) and pending_heading:
                    exact_headings.setdefault(int(vals[0]), pending_heading); pending_heading = None
        selected_codes = {c for _, c, _, _ in LATEST_FIELDS} | {c for _, c, _, _ in SERIES_FIELDS}
        data: dict[int, dict[str, list[Any]]] = {}; identity: dict[str, tuple[str, str]] = {}
        for code in selected_codes:
            data[code] = {}
            for vals in rows_by_code.get(code, []):
                if len(vals) < 6: continue
                norm = normalized_municode(str(vals[3] or "").strip())
                if not norm: continue
                county = str(vals[4] or "").strip(); muni = str(vals[5] or "").strip()
                if norm == "1114": muni = "Princeton"
                data[code][norm] = vals; identity.setdefault(norm, (county, muni))
        base_codes = set(data[100000])
        if len(base_codes) != EXPECTED_MUNICIPALITIES:
            raise RuntimeError(f"Expected {EXPECTED_MUNICIPALITIES} normalized municipalities, got {len(base_codes)}")
        for code in selected_codes:
            if set(data[code]) != base_codes:
                missing_codes = sorted(base_codes.difference(data[code]))[:10]
                raise RuntimeError(f"Category {code} municipality coverage mismatch; examples missing={missing_codes}")
        fields_meta: dict[str, Any] = {"latest_data_year": {"category_code": None, "label": "Latest published annual data year", "category": "source_metadata", "unit": "year", "source_heading": "LATEST DATA YEAR"}}
        latest_order: list[str] = []
        for field, code, label, unit in LATEST_FIELDS:
            latest_order.append(field); fields_meta[field] = {"category_code": code, "label": label, "category": ("construction_cost" if unit == "usd" else "square_feet" if unit == "square_feet" else "development"), "unit": unit, "source_heading": exact_headings.get(code, "")}
        series_meta = {}; series_order = []
        for field, code, expected_heading, unit in SERIES_FIELDS:
            series_order.append(field); heading = exact_headings.get(code, "")
            if heading != expected_heading: raise RuntimeError(f"Unexpected source heading for {code}: {heading!r}")
            series_meta[field] = {"category_code": code, "source_heading": heading, "unit": unit}
        municipalities: dict[str, Any] = {}
        for municode in sorted(base_codes):
            county, muni = identity[municode]
            latest_values = [clean_number(data[code][municode][year_index[LATEST_YEAR]]) for _, code, _, _ in LATEST_FIELDS]
            series_values = [[clean_number(data[code][municode][year_index[y]]) for y in SERIES_YEARS] for _, code, _, _ in SERIES_FIELDS]
            municipalities[municode] = [county, muni, latest_values, series_values]
        artifact = {"schema_version": 1, "source_id": SOURCE_ID, "source_version": RELEASE, "source_file": "NJ DCA Development Trends Viewer", "source_sheet": "Source Data", "source_as_of": SOURCE_AS_OF, "latest_data_year": LATEST_YEAR, "series_years": SERIES_YEARS, "source_sha256": source_sha, "definition_notes": {"housing_units": "DCA glossary: a rental or for-sale dwelling unit authorized by a construction permit.", "new_construction": "DCA glossary: permit type authorizing the start of a new structure.", "net_new_housing_units": "DCA glossary: difference between new-construction housing units authorized and housing units demolished.", "square_feet": "DCA glossary: estimated building area reported on permits for new construction and additions.", "legacy_municipality_handling": "Governed current-municipality normalization: Princeton Borough 1109 excluded and source row 1110 emitted as current Princeton 1114; Pine Valley 0429 excluded; Pahaquarry 2118 excluded; 9999 State Buildings excluded. Princeton/Pine Valley handling is source-explicit; Pahaquarry dissolution is confirmed by the NJ Division of Taxation Assessors Handbook."}, "municipality_count": EXPECTED_MUNICIPALITIES, "fields": fields_meta, "series_fields": series_meta, "field_order": latest_order, "series_field_order": series_order, "municipality_row_format": ["county", "municipality", "latest_values_by_field_order", "series_values_by_series_field_order"], "municipalities": municipalities}
        validate_artifact(artifact); return artifact, marker_pack(artifact), source_sha

def validate_artifact(a: dict[str, Any]) -> None:
    if a.get("municipality_count") != EXPECTED_MUNICIPALITIES or len(a.get("municipalities") or {}) != EXPECTED_MUNICIPALITIES: raise RuntimeError("Municipality count gate failed")
    if a.get("latest_data_year") != LATEST_YEAR: raise RuntimeError("Latest year gate failed")
    for code, rec in (a.get("municipalities") or {}).items():
        latest, series = rec[2], rec[3]
        if len(latest) != len(LATEST_FIELDS) or any(not isinstance(v, (int, float)) for v in latest): raise RuntimeError(f"{code}: invalid latest source values")
        if len(series) != len(SERIES_FIELDS): raise RuntimeError(f"{code}: series field count mismatch")
        for vals in series:
            if len(vals) != len(SERIES_YEARS) or any(not isinstance(v, (int, float)) for v in vals): raise RuntimeError(f"{code}: invalid governed annual series")

def marker_pack(a: dict[str, Any]) -> dict[str, Any]:
    prefix = "njplus.nj-dca-development-trends."
    direct: list[dict[str, Any]] = [{"id": prefix+"latest_data_year", "label": "Development Trends latest data year", "description": "Latest annual data year identified by the NJ DCA Development Trends Viewer active-data metadata.", "category": "development", "scope": "municipality", "tier": "pro_plus", "origin": "public", "proprietary": False, "professions": PROFESSIONS, "source_id": SOURCE_ID, "field": "latest_data_year", "source_field": "LATEST DATA YEAR", "unit": "year", "professional_reason": "Shows the latest annual data year certified by the NJ DCA Development Trends Viewer."}]
    for field, code, label, unit in LATEST_FIELDS:
        heading = a["fields"][field]["source_heading"]
        direct.append({"id": prefix+field, "label": label, "description": f"NJ DCA Development Trends Viewer {LATEST_YEAR} annual municipality fact: {heading}.", "category": "development", "scope": "municipality", "tier": "pro_plus", "origin": "public", "proprietary": False, "professions": PROFESSIONS, "source_id": SOURCE_ID, "field": field, "source_field": heading, "unit": unit, "professional_reason": "Published municipality-level development trend fact for professional research; verify the official record before reliance."})
    history_ids: dict[str, str] = {}
    for field, code, heading, unit in SERIES_FIELDS:
        mid = prefix+field+"_history_2020_2024"; history_ids[field] = mid
        direct.append({"id": mid, "label": field.replace("_", " ").title()+" history, 2020–2024", "description": f"Exact NJ DCA Development Trends Viewer annual municipality series for 2020–2024: {heading}.", "category": "development", "scope": "municipality", "tier": "pro_plus", "origin": "public", "proprietary": False, "professions": PROFESSIONS, "source_id": SOURCE_ID, "field": field+"_history_2020_2024", "source_field": heading, "unit": unit, "professional_reason": "Preserves the exact five-year public source series without a trend or risk interpretation."})
    derived: list[dict[str, Any]] = []
    for field, _, _, unit in SERIES_FIELDS:
        dep = history_ids[field]; label_base = field.replace("_", " ")
        for metric, suffix, title in [("sum", "rolling_5yr_"+field, "Five-year total"), ("latest_delta", "latest_yoy_"+field+"_delta", "Latest year-over-year change")]:
            derived.append({"id": "watchdog.njplus."+suffix, "label": f"{title}: {label_base}", "description": "Exact sum of the 2020–2024 NJ DCA annual source series." if metric == "sum" else "Exact 2024 minus 2023 change from the NJ DCA annual source series.", "category": "development", "scope": "municipality", "tier": "pro_plus", "origin": "watchdog-derived", "proprietary": True, "professions": PROFESSIONS, "source_id": "watchdog-nj-source-v038", "field": suffix, "formula": f"sum({dep})" if metric == "sum" else f"2024({dep}) - 2023({dep})", "dependencies": [dep], "unit": unit, "professional_reason": "Deterministic arithmetic over the exact governed DCA annual series; not a qualitative momentum, risk, compliance, or legal score.", "calculation_key": "watchdog-dca-development-trends-window-v1", "operation": "history_metric", "calculation_config": {"metric": metric, "years": SERIES_YEARS}})
    markers = direct + derived
    if len(markers) != 46: raise RuntimeError(f"Expected 46 v0.38 markers, got {len(markers)}")
    return {"schema_version": 1, "version": "0.38.0", "released": "2026-08-27", "definition": "46 governed municipality markers from the NJ DCA Development Trends Viewer: 34 public-source facts/series and 12 deterministic Watchdog arithmetic markers.", "activation_rule": "New markers enter planned. Live state requires the source artifact, authenticated production canary, provider coverage and static governance reconciliation.", "source_contract": {"source_id": SOURCE_ID, "source_release": RELEASE, "source_as_of": SOURCE_AS_OF, "latest_data_year": LATEST_YEAR, "municipality_count": EXPECTED_MUNICIPALITIES, "source_artifact": "property/data/dca-development-trends-v038.json", "warning": "DCA annual permit/development reporting. Do not interpret these facts as code compliance, zoning approval, legal status, construction completion, appraisal, lending, insurance, eligibility, or transaction determinations."}, "markers": markers}

def manifest(a: dict[str, Any]) -> str:
    direct_lines = "\n".join(f"- `{field}` — {a['fields'][field]['source_heading']} (category code {code})" for field, code, _, _ in LATEST_FIELDS)
    series_lines = "\n".join(f"- `{field}` — {heading}" for field, _, heading, _ in SERIES_FIELDS)
    return f"""# NJ DCA Development Trends Viewer v0.38 source manifest

## Source identity

- Source: New Jersey Department of Community Affairs, Development Trends Viewer
- Source SHA-256: `{a['source_sha256']}`
- Workbook cover date: **As of 8/21/2025**
- Governed source release: `{RELEASE}`
- Latest published annual data year used by Watchdog: **{LATEST_YEAR}**
- Governed sheet: `Source Data`
- Municipality coverage: **{EXPECTED_MUNICIPALITIES} current municipalities**

The workbook contains a 2025 column, but its active-viewer metadata identifies 2024 as the latest data year. Watchdog does not present 2025 zero placeholders as published annual observations.

## Source glossary preserved

The workbook defines housing units as dwelling units authorized by construction permits; new construction as permits authorizing a new structure; net new housing units as new-construction units authorized less units demolished; and square feet as estimated building area reported on permits for new construction and additions. Preliminary figures are monthly-reported sums subject to revision after adjusted annual totals.

Watchdog does not convert these facts into a legal, zoning, code-compliance, appraisal, lending, insurance, eligibility, construction-completion, or transaction determination.

## Municipality normalization

1. Princeton Borough `1109` is excluded.
2. Princeton Township source row `1110` is emitted as current Princeton `1114`.
3. Pine Valley `0429` is excluded because the workbook directs users to Pine Hill.
4. Pahaquarry `2118` is excluded because the NJ Division of Taxation Assessors Handbook confirms it was dissolved and incorporated into Hardwick Township in 1997.
5. `9999` State Buildings is excluded because it is not a municipality.

No other municipality remapping is inferred.

## Certified direct 2024 fields

{direct_lines}

`latest_data_year = 2024` is exposed from the workbook metadata.

## Certified 2020–2024 source series

{series_lines}

The six history markers may support only deterministic governed arithmetic such as explicit five-year sums and latest-year deltas. Weighted or qualitative momentum, priority, risk, or compliance scores are not certified by this source contract.

## Quality gates

- All 27 selected 2024 numeric measures are numeric for all {EXPECTED_MUNICIPALITIES} normalized municipalities.
- All six retained 2020–2024 annual series are numeric for all {EXPECTED_MUNICIPALITIES} normalized municipalities.
- Missing source observations remain missing; runtime providers must not substitute synthetic zero.
- Existing property-level permit/certificate facts from the raw DCA permit provider remain separate and are not replaced by this annual municipality source.
"""

def apply_registry(root: Path, pack: dict[str, Any]) -> dict[str, Any]:
    reg_path = root / "data" / "marker-registry.json"; reg = json.loads(reg_path.read_text(encoding="utf-8"))
    markers = reg.setdefault("markers", []); by_id = {str(m.get("id")): m for m in markers}; added = 0
    for item in pack["markers"]:
        mid = str(item["id"])
        if mid in by_id:
            prior = by_id[mid]; keep = {k: prior.get(k) for k in ("provider_status","provider_note","provider_contract","status","status_reason") if k in prior}; prior.update(item); prior.update(keep)
        else:
            row = {**item, "status": "cataloged", "provider_status": "planned", "status_reason": "Governed v0.38 catalog definition added; live state is controlled by production data_center_provider_coverage."}; markers.append(row); by_id[mid] = row; added += 1
    summary = reg.setdefault("summary", {}); summary["total"] = len(markers); summary["public_source"] = sum(m.get("origin") == "public" for m in markers); summary["proprietary_derived"] = sum(bool(m.get("proprietary")) for m in markers); summary["by_tier"] = {t: sum(m.get("tier") == t for m in markers) for t in ("standard","pro","pro_plus")}; professions = [p.get("id") for p in reg.get("professions", []) if p.get("id")]; summary["by_profession"] = {p: sum(p in (m.get("professions") or []) for m in markers) for p in professions}; summary["percent_of_goal"] = round(len(markers)/10, 1); summary["provider_status"] = dict(sorted(Counter(str(m.get("provider_status") or "planned") for m in markers).items())); reg["schema_version"] = "1+provider-status+v038"; reg["generated_at"] = datetime.now(timezone.utc).isoformat(); reg["catalog_extension"] = "nj-source-pack-v038.json; availability is resolved from production data_center_provider_coverage."; reg_path.write_text(json.dumps(reg, indent=2)+"\n", encoding="utf-8"); return {"added": added, "total": len(markers), "provider_status": summary["provider_status"]}

def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument("--source", required=True); ap.add_argument("--root", default=str(Path(__file__).resolve().parents[1])); ap.add_argument("--apply-registry", action="store_true"); args = ap.parse_args(); root = Path(args.root)
    artifact, pack, source_sha = build(Path(args.source)); data_dir = root / "data"; data_dir.mkdir(parents=True, exist_ok=True); (data_dir/"dca-development-trends-v038.json").write_text(json.dumps(artifact, separators=(",",":"))+"\n", encoding="utf-8"); (data_dir/"nj-source-pack-v038.json").write_text(json.dumps(pack, indent=2)+"\n", encoding="utf-8"); (data_dir/"dca-development-trends-v038-SOURCE-MANIFEST.md").write_text(manifest(artifact), encoding="utf-8"); out = {"source_sha256": source_sha, "municipalities": artifact["municipality_count"], "markers": len(pack["markers"])}
    if args.apply_registry: out["registry"] = apply_registry(root, pack)
    print(json.dumps(out, indent=2))

if __name__ == "__main__": main()
