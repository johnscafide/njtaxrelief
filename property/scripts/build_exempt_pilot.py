#!/usr/bin/env python3
"""Build statewide exemption/PILOT web data from official NJ workbooks.

Inputs:
  1. NJ Division of Taxation Abstract of Ratables (.xls), 2025
  2. NJ DCA PILOT Database and Viewer (.xlsx), 2026 release using 2025 UFB data

The output intentionally contains municipal aggregates only. Project names and
owner/developer information are not needed by the product surface.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import xlrd


def num(value, default=0.0):
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except (TypeError, ValueError):
        return default


def percentile_map(rows, field):
    ordered = sorted((num(row.get(field)), code) for code, row in rows.items())
    total = max(1, len(ordered) - 1)
    return {code: (0 if value <= 0 else round(index / total * 100))
            for index, (value, code) in enumerate(ordered)}


def load_abstract(path):
    book = xlrd.open_workbook(str(path), on_demand=True)
    sheet = book.sheet_by_name("Abstracts")
    result = {}
    for index in range(3, sheet.nrows):
        row = sheet.row_values(index)
        code = str(row[0]).strip()
        if not (len(code) == 4 and code.isdigit()):
            continue
        result[code] = {
            "code": code,
            "name": str(row[1]).strip(),
            "county": str(row[2]).strip(),
            "land": round(num(row[3])),
            "improvements": round(num(row[4])),
            "taxable_before_partial_relief": round(num(row[5])),
            "partial_exemptions_abatements": round(num(row[6])),
            "net_taxable_land_improvements": round(num(row[7])),
            "general_tax_rate": num(row[10]),
        }
    return result


def load_pilots(path):
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = book["Summary By Town"]
    result = {}
    for row in sheet.iter_rows(min_row=4, max_col=45, values_only=True):
        code = str(row[0] or "").strip()
        if not (len(code) == 4 and code.isdigit()):
            continue
        result[code] = {
            "code": code,
            "name": str(row[1] or "").strip(),
            "county": str(row[2] or "").strip(),
            "region": str(row[4] or "").strip(),
            "community_type": str(row[5] or "").strip(),
            "pilot_count": round(num(row[34])),
            "pilot_billing": round(num(row[35]), 2),
            "pilot_assessed_value": round(num(row[36])),
            "tax_if_conventional": round(num(row[37]), 2),
            "assessed_including_exempt": round(num(row[38])),
            "general_tax_rate": num(row[39]),
            "municipal_levy_share": num(row[40]),
            "municipal_subsidy": round(num(row[41]), 2),
            "pilot_value_share": num(row[42]),
            "municipal_budget": round(num(row[43]), 2),
            "subsidy_budget_share": num(row[44]),
        }
    return result


def build(abstract, pilots):
    municipalities = {}
    for code in sorted(set(abstract) | set(pilots)):
        a = abstract.get(code, {})
        p = pilots.get(code, {})
        all_assessed = num(p.get("assessed_including_exempt"))
        taxable_before = num(a.get("taxable_before_partial_relief"))
        exempt_value = max(0.0, all_assessed - taxable_before) if all_assessed and taxable_before else 0.0
        pilot_value = num(p.get("pilot_assessed_value"))
        exempt_nonpilot = max(0.0, exempt_value - pilot_value)
        partial = num(a.get("partial_exemptions_abatements"))
        municipalities[code] = {
            "code": code,
            "name": p.get("name") or a.get("name") or "",
            "county": p.get("county") or a.get("county") or "",
            "region": p.get("region") or "",
            "community_type": p.get("community_type") or "",
            "taxable_before_partial_relief": round(taxable_before),
            "net_taxable_land_improvements": round(num(a.get("net_taxable_land_improvements"))),
            "assessed_including_exempt": round(all_assessed),
            "exempt_value": round(exempt_value),
            "exempt_nonpilot_value": round(exempt_nonpilot),
            "exempt_share": exempt_value / all_assessed if all_assessed else None,
            "partial_exemptions_abatements": round(partial),
            "partial_relief_share": partial / taxable_before if taxable_before else None,
            "pilot_count": int(num(p.get("pilot_count"))),
            "pilot_billing": round(num(p.get("pilot_billing")), 2),
            "pilot_assessed_value": round(pilot_value),
            "pilot_value_share": num(p.get("pilot_value_share")) if all_assessed else None,
            "tax_if_conventional": round(num(p.get("tax_if_conventional")), 2),
            "municipal_subsidy": round(num(p.get("municipal_subsidy")), 2),
            "municipal_budget": round(num(p.get("municipal_budget")), 2),
            "subsidy_budget_share": num(p.get("subsidy_budget_share")) if p else None,
            "coverage": {"abstract_2025": bool(a), "dca_pilot_2026": bool(p)},
        }

    for field, target in [
        ("exempt_share", "exempt_percentile"),
        ("pilot_value_share", "pilot_percentile"),
        ("subsidy_budget_share", "subsidy_percentile"),
    ]:
        ranked = {k: v for k, v in municipalities.items() if v.get(field) is not None}
        for code, pct in percentile_map(ranked, field).items():
            municipalities[code][target] = pct

    def median(field):
        vals = sorted(num(x[field]) for x in municipalities.values() if x.get(field) is not None)
        if not vals:
            return None
        mid = len(vals) // 2
        return (vals[mid] if len(vals) % 2 else (vals[mid - 1] + vals[mid]) / 2)

    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_year": 2025,
        "release_year": 2026,
        "sources": [
            {
                "agency": "NJ Division of Taxation",
                "label": "2025 Abstract of Ratables",
                "url": "https://www.nj.gov/treasury/taxation/lpt/statdata.shtml",
            },
            {
                "agency": "NJ Department of Community Affairs, DLGS",
                "label": "PILOT Database and Viewer 2026",
                "url": "https://www.nj.gov/dca/dlgs/taxabatementkit.shtml",
            },
        ],
        "methodology": {
            "exempt_value": "DCA assessed valuation including exempt property minus Abstract column 2 taxable land and improvements.",
            "exempt_nonpilot_value": "Derived exempt value minus DCA PILOT assessed value, floored at zero.",
            "municipal_subsidy": "DCA-published estimate in the 2026 PILOT Database; it is municipal levy impact, not total foregone conventional tax.",
            "zero_vs_missing": "Every metric carries source coverage; zero is only reported when its source municipality is present.",
        },
        "statewide": {
            "municipalities": len(municipalities),
            "median_exempt_share": median("exempt_share"),
            "median_pilot_share": median("pilot_value_share"),
            "median_subsidy_budget_share": median("subsidy_budget_share"),
        },
        "municipalities": municipalities,
    }
    return output


def build_abatements(abstract):
    districts = {}
    shares = []
    for code, row in abstract.items():
        base = num(row["taxable_before_partial_relief"])
        abated = num(row["partial_exemptions_abatements"])
        share = abated / base if base else 0.0
        shares.append(share)
        districts[code] = {
            "name": row["name"], "county": row["county"].upper(),
            "land": row["land"], "improvements": row["improvements"],
            "total_base": round(base), "abated": round(abated),
            "net_base": row["net_taxable_land_improvements"],
            "abated_share": share,
        }
    ranked = percentile_map(districts, "abated_share")
    median = sorted(shares)[len(shares) // 2] if shares else 0
    for code, pct in ranked.items():
        districts[code]["percentile"] = pct
        districts[code]["vs_median"] = districts[code]["abated_share"] / median if median else 0
    return {
        "_readme": "2025 statewide partial exemption/abatement values rebuilt from the NJ Abstract of Ratables.",
        "source": "NJ Division of Taxation 2025 Abstract of Ratables, column 3",
        "statewide_median_share": median,
        "districts": districts,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("abstract_xls", type=Path)
    parser.add_argument("pilot_xlsx", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("--abatements-output", type=Path)
    args = parser.parse_args()
    abstract = load_abstract(args.abstract_xls)
    pilots = load_pilots(args.pilot_xlsx)
    output = build(abstract, pilots)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    if args.abatements_output:
        args.abatements_output.write_text(json.dumps(build_abatements(abstract), separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(output['municipalities'])} municipalities to {args.output_json}")


if __name__ == "__main__":
    main()
