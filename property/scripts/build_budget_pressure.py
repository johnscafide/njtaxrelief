#!/usr/bin/env python3
"""Build statewide Municipal Budget Pressure data from NJ DCA workbooks.

The output contains municipality-level fiscal and levy statistics only. It never
reads or emits owner names, addresses, or other person-level information.
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd


YEARS = tuple(range(2021, 2026))
WEIGHTS = {
    "levy_base_gap": 0.35,
    "levy_growth": 0.20,
    "budget_growth": 0.15,
    "debt_service_share": 0.10,
    "collection_weakness": 0.10,
    "structural_imbalance_share": 0.10,
}
SOURCE_URLS = {
    "property_tax": "https://www.nj.gov/dca/dlgs/resources/Property_Tax_info.shtml",
    "budget": "https://nj.gov/dca/dlgs/programs/mc_budgets.shtml",
}


def number(value):
    value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return None if pd.isna(value) or not math.isfinite(float(value)) else float(value)


def rounded(value, digits=6):
    return None if value is None or not math.isfinite(float(value)) else round(float(value), digits)


def growth(first, last, periods):
    first, last = number(first), number(last)
    if first is None or last is None or first <= 0 or last <= 0 or periods <= 0:
        return None
    return (last / first) ** (1 / periods) - 1


def municipality_rows(path: Path):
    frame = pd.read_excel(path, sheet_name="Municipal Tax Summary", header=1)
    codes = pd.to_numeric(frame["MuniCode"], errors="coerce")
    frame = frame[codes.notna()].copy()
    frame["district"] = codes[codes.notna()].astype(int).astype(str).str.zfill(4)
    frame = frame[~frame["district"].str.endswith("00")]
    return frame.set_index("district", drop=False)


def ufb_columns(raw):
    categories = raw.iloc[3].ffill()
    headings = raw.iloc[4]

    def find(category, heading):
        for index, (cat, head) in enumerate(zip(categories, headings)):
            if category.lower() in str(cat).lower() and heading.lower() in str(head).lower():
                return index
        return None

    return {
        "prior_appropriation": find("2024 Total Modified Appropriations", "TOTAL APPROPRIATION"),
        "current_appropriation": find("2025 Total Appropriations", "TOTAL APPROPRIATION"),
        "collection_rate": find("Tax Collections", "% of Taxes Collected"),
        "net_debt_pct": find("Net Debt", "Net Debt as %"),
        "debt_payment": find("Debt Service", "CY Budget Debt Pmt"),
        "revenues_at_risk": find("Structural Imbalances", "Revenues at Risk"),
        "nonrecurring_reductions": find("Structural Imbalances", "Non-recurring"),
        "future_increases": find("Structural Imbalances", "Future Year"),
    }


def read_ufb(path: Path):
    raw = pd.read_excel(path, sheet_name="2025 Summary", header=None)
    columns = ufb_columns(raw)
    missing = [key for key, index in columns.items() if index is None]
    if missing:
        raise RuntimeError("UFB columns not found: " + ", ".join(missing))
    out = {}
    for row_index in range(5, len(raw)):
        district = str(raw.iat[row_index, 0]).strip()
        if not district or district.lower() == "nan":
            continue
        if district.endswith(".0"):
            district = district[:-2]
        district = district.zfill(4)
        if not (district.isdigit() and len(district) == 4 and not district.endswith("00")):
            continue
        values = {key: number(raw.iat[row_index, index]) for key, index in columns.items()}
        current = values["current_appropriation"]
        prior = values["prior_appropriation"]
        values["budget_growth"] = (current / prior - 1) if current and prior and prior > 0 else None
        values["debt_service_share"] = values["debt_payment"] / current if current and values["debt_payment"] is not None else None
        structural = sum(value or 0 for value in (
            values["revenues_at_risk"], values["nonrecurring_reductions"], values["future_increases"]
        ))
        values["structural_imbalance"] = structural
        values["structural_imbalance_share"] = structural / current if current else None
        values["collection_weakness"] = max(0, 1 - values["collection_rate"]) if values["collection_rate"] is not None else None
        out[district] = values
    return out


def organic_ratable_growth(history):
    """Median annual taxable-base growth, ignoring apparent revaluation resets."""
    changes, resets = [], []
    for previous, current in zip(history, history[1:]):
        first, last = previous["tax_base"], current["tax_base"]
        if first is None or last is None or first <= 0:
            continue
        change = last / first - 1
        ratio_first, ratio_last = previous["equalization_ratio"], current["equalization_ratio"]
        ratio_shift = abs(ratio_last - ratio_first) if ratio_first is not None and ratio_last is not None else 0
        reset = (change > 0.20 and ratio_shift > 0.10) or change > 0.35
        if reset:
            resets.append(current["year"])
        else:
            changes.append(change)
    return (float(np.median(changes)) if changes else None), resets


def pct_rank(series):
    return series.rank(method="average", pct=True) * 100


def build(input_dir: Path):
    tax = {year: municipality_rows(input_dir / f"{str(year)[2:]}taxes.xls") for year in YEARS}
    ufb = read_ufb(input_dir / "UFB Database - FINAL.xlsm")
    common = sorted(set.intersection(*(set(frame.index) for frame in tax.values())))
    records = {}
    scoring_rows = []

    for district in common:
        latest = tax[2025].loc[district]
        history = []
        for year in YEARS:
            row = tax[year].loc[district]
            history.append({
                "year": year,
                "tax_base": number(row.get("Net Valuation Taxable")),
                "equalized_value": number(row.get("CY Equalized Property Value (Pre-Appeal)")),
                "equalization_ratio": number(row.get("State Equalization Table Average Ratio (Decimal Form)")),
                "total_levy": number(row.get("Total Levy on Which Tax Rate is Computed")),
                "municipal_levy": number(row.get("Total Local Municipal Tax Levy")),
                "school_levy": number(row.get("Total School Levy")),
                "county_levy": number(row.get("Total County Levy")),
            })

        ratable_growth, reset_years = organic_ratable_growth(history)
        first, last = history[0], history[-1]
        total_cagr = growth(first["total_levy"], last["total_levy"], 4)
        municipal_cagr = growth(first["municipal_levy"], last["municipal_levy"], 4)
        school_cagr = growth(first["school_levy"], last["school_levy"], 4)
        county_cagr = growth(first["county_levy"], last["county_levy"], 4)
        equalized_growth = growth(first["equalized_value"], last["equalized_value"], 4)
        levy_base_gap = total_cagr - ratable_growth if total_cagr is not None and ratable_growth is not None else None
        budget = ufb.get(district, {})

        total_levy = last["total_levy"] or 0
        components = {
            "municipal_share": last["municipal_levy"] / total_levy if total_levy and last["municipal_levy"] is not None else None,
            "school_share": last["school_levy"] / total_levy if total_levy and last["school_levy"] is not None else None,
            "county_share": last["county_levy"] / total_levy if total_levy and last["county_levy"] is not None else None,
        }
        metrics = {
            "levy_base_gap": levy_base_gap,
            "levy_growth": total_cagr,
            "budget_growth": budget.get("budget_growth"),
            "debt_service_share": budget.get("debt_service_share"),
            "collection_weakness": budget.get("collection_weakness"),
            "structural_imbalance_share": budget.get("structural_imbalance_share"),
        }
        scoring_rows.append({"district": district, **metrics})
        records[district] = {
            "district": district,
            "name": str(latest.get("Municipality") or "").strip(),
            "county": str(latest.get("County") or "").strip(),
            "score": None,
            "band": None,
            "trend": {
                "total_levy_cagr": rounded(total_cagr),
                "total_levy_change": rounded(last["total_levy"] / first["total_levy"] - 1 if first["total_levy"] else None),
                "ratable_growth": rounded(ratable_growth),
                "equalized_value_cagr": rounded(equalized_growth),
                "levy_base_gap": rounded(levy_base_gap),
                "municipal_levy_cagr": rounded(municipal_cagr),
                "school_levy_cagr": rounded(school_cagr),
                "county_levy_cagr": rounded(county_cagr),
                "revaluation_reset_years": reset_years,
            },
            "components": {key: rounded(value) for key, value in components.items()},
            "budget": {
                "current_appropriation": rounded(budget.get("current_appropriation"), 2),
                "prior_appropriation": rounded(budget.get("prior_appropriation"), 2),
                "appropriation_growth": rounded(budget.get("budget_growth")),
                "debt_payment": rounded(budget.get("debt_payment"), 2),
                "debt_service_share": rounded(budget.get("debt_service_share")),
                "net_debt_pct": rounded(budget.get("net_debt_pct")),
                "collection_rate": rounded(budget.get("collection_rate")),
                "structural_imbalance": rounded(budget.get("structural_imbalance"), 2),
                "structural_imbalance_share": rounded(budget.get("structural_imbalance_share")),
            },
            "history": [{
                "year": row["year"],
                "total_levy": rounded(row["total_levy"], 2),
                "municipal_levy": rounded(row["municipal_levy"], 2),
                "school_levy": rounded(row["school_levy"], 2),
                "county_levy": rounded(row["county_levy"], 2),
                "tax_base": rounded(row["tax_base"], 2),
            } for row in history],
            "drivers": [],
        }

    scoring = pd.DataFrame(scoring_rows).set_index("district")
    ranks = pd.DataFrame(index=scoring.index)
    for key in WEIGHTS:
        ranks[key] = pct_rank(pd.to_numeric(scoring[key], errors="coerce"))

    for district in records:
        weighted, available = 0.0, 0.0
        drivers = []
        for key, weight in WEIGHTS.items():
            raw = number(scoring.at[district, key])
            percentile = number(ranks.at[district, key])
            if raw is None or percentile is None:
                continue
            weighted += percentile * weight
            available += weight
            drivers.append({
                "key": key,
                "value": rounded(raw),
                "pressure_percentile": round(percentile, 1),
                "weight": weight,
            })
        score = round(weighted / available) if available else None
        band = None if score is None else ("low" if score < 35 else "moderate" if score < 55 else "elevated" if score < 75 else "high")
        records[district]["score"] = score
        records[district]["band"] = band
        records[district]["drivers"] = drivers

    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = build(args.input_dir)
    now = datetime.now(ZoneInfo("America/New_York")).isoformat(timespec="seconds")
    payload = {
        "schema_version": 1,
        "score_version": "1.0",
        "generated_at": now,
        "source_years": list(YEARS),
        "sources": SOURCE_URLS,
        "methodology": {
            "description": "Relative municipal fiscal pressure from levy growth, organic ratable growth, municipal budget growth, debt service, tax collections, and reported structural imbalances. It is context, not a forecast.",
            "weights": WEIGHTS,
            "ratable_note": "Organic ratable growth uses annual net taxable valuation changes and excludes apparent revaluation resets before taking the median annual change.",
            "bands": {"low": "0-34", "moderate": "35-54", "elevated": "55-74", "high": "75-100"},
        },
        "municipalities": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(records)} municipalities to {args.output}")


if __name__ == "__main__":
    main()
