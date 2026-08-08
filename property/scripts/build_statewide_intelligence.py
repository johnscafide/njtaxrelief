#!/usr/bin/env python3
"""Compile 3.2M privacy-limited MOD-IV rows into compact Watchdog benchmarks.

The large parcel source remains a local analytical input. Output contains only
municipality/county/state aggregates and derived signals; it contains no parcel
rows and no person-level fields.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import math
import pathlib
from array import array
from collections import defaultdict


ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "artifacts/data-factory/modiv/2026"
DEFAULT_OUTPUT = ROOT / "property/data/statewide-intelligence.json"
DEFAULT_PACK = ROOT / "property/data/statewide-intelligence-marker-pack.json"
DEFAULT_MUNI = ROOT / "property/data/budget-pressure.json"
STATE_SAMPLE_EVERY = 16

METRICS = {
    "assessed_value": 1,
    "land_value": 1,
    "improvement_value": 1,
    "annual_tax": 100,
    "sale_price": 1,
    "year_built": 1,
    "acres": 10_000,
    "assessment_change": 1_000_000,
    "land_share": 1_000_000,
    "effective_tax_rate": 1_000_000,
    "sale_assessment_ratio": 1_000_000,
}

SIGNAL_DEFS = [
    ("median_assessed_value", "Median assessed value", "currency", "pro", "Median net assessment across MOD-IV parcels."),
    ("assessment_dispersion_iqr_pct", "Assessment dispersion", "percent", "pro_plus", "Interquartile assessment range divided by median assessment."),
    ("median_annual_tax", "Median reported annual property tax", "currency", "pro", "Median latest positive annual-tax field available in this MOD-IV release. The 2026 file currently reports this in the prior-year tax field."),
    ("tax_dispersion_iqr_pct", "Reported tax dispersion", "percent", "pro_plus", "Interquartile latest-reported annual-tax range divided by the median reported annual tax."),
    ("median_assessment_change_pct", "Median assessment change", "percent", "pro_plus", "Median current net assessment change versus prior-year net assessment."),
    ("assessment_growth_positive_share_pct", "Assessment growth prevalence", "percent", "pro_plus", "Share of comparable prior-year records whose net assessment increased."),
    ("assessment_change_dispersion_pct", "Assessment change dispersion", "percent", "pro_plus", "Interquartile spread of parcel assessment changes versus prior-year assessment, expressed in percentage points."),
    ("assessment_jump_share_pct", "Assessment jump prevalence", "percent", "pro_plus", "Share of parcels with comparable prior-year assessment whose absolute assessment change exceeded 10%."),
    ("median_land_share_pct", "Median land assessment share", "percent", "pro", "Median land value as a share of net assessment."),
    ("improvement_value_share_pct", "Improvement value share", "percent", "pro", "Aggregate improvement assessment divided by aggregate net assessment."),
    ("residential_parcel_share_pct", "Residential parcel share", "percent", "pro", "Share of MOD-IV parcels classified as property class 2."),
    ("commercial_parcel_share_pct", "Commercial parcel share", "percent", "pro_plus", "Share of MOD-IV parcels in class 4 commercial/industrial/apartment categories."),
    ("exempt_parcel_share_pct", "Exempt parcel share", "percent", "pro_plus", "Share of MOD-IV parcels in class 15 exempt categories."),
    ("vacant_parcel_share_pct", "Vacant parcel share", "percent", "pro_plus", "Share of MOD-IV parcels in class 1 vacant land."),
    ("farm_parcel_share_pct", "Farm parcel share", "percent", "pro_plus", "Share of MOD-IV parcels in class 3 farm categories."),
    ("recent_sale_turnover_pct", "Recent recorded-sale turnover", "percent", "pro_plus", "2024-or-later deed records with positive sale price divided by parcel count; not an arm's-length-sale claim."),
    ("median_building_age", "Median building age", "years", "pro", "2026 minus median plausible construction year."),
    ("pre_1978_building_share_pct", "Pre-1978 building share", "percent", "pro_plus", "Share of parcels with plausible construction year before 1978."),
    ("recent_build_share_pct", "Recent construction share", "percent", "pro_plus", "Share of parcels with plausible construction year 2020–2026."),
    ("median_effective_tax_rate_pct", "Median reported tax-to-assessment rate", "percent", "pro_plus", "Median latest reported annual tax divided by current net assessment; indicative only and distinct from an equalized market-value tax rate."),
    ("median_sale_assessment_ratio_pct", "Median sale assessment ratio", "percent", "pro_plus", "Median sale-assessment divided by recorded sale price across positive observations; not a verified SR-1A equalization statistic."),
    ("sale_assessment_ratio_dispersion_pct", "Sale assessment ratio dispersion", "percent", "pro_plus", "Interquartile spread of sale-assessment ratios divided by their median."),
    ("median_parcel_acres", "Median calculated parcel acres", "acres", "pro", "Median positive calculated acreage reported in MOD-IV."),
    ("assessed_value_per_acre", "Assessed value per reported acre", "currency_per_acre", "pro_plus", "Aggregate net assessment divided by aggregate positive reported acreage."),
]

PROFESSIONS = ["attorney", "agent", "lender", "appraiser", "contractor", "investor", "municipal"]


def pct(numerator: float, denominator: float) -> float | None:
    return round(numerator / denominator * 100, 3) if denominator else None


def quantile(values: list[int], q: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return float(values[0])
    pos = (len(values) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    if lo == hi:
        return float(values[lo])
    return values[lo] * (hi - pos) + values[hi] * (pos - lo)


class Accumulator:
    def __init__(self, sample_every: int = 1):
        self.rows = 0
        self.sample_every = max(1, sample_every)
        self.series = {name: array("q") for name in METRICS}
        self.sums = defaultdict(float)
        self.counts = defaultdict(int)

    def append(self, metric: str, value: float | int | None) -> None:
        if value is None or not math.isfinite(float(value)):
            return
        self.sums[metric] += float(value)
        self.counts[metric] += 1
        if self.rows % self.sample_every == 0:
            self.series[metric].append(round(float(value) * METRICS[metric]))

    def add(self, row: dict) -> None:
        self.rows += 1
        net = row.get("net_value")
        land = row.get("land_value")
        improvement = row.get("improvement_value")
        current_tax = row.get("current_year_tax")
        prior_tax = row.get("last_year_tax")
        # Treasury's 2026 county release currently leaves current_year_tax blank.
        # Use the latest positive tax field without fabricating a year-over-year change.
        tax = current_tax if current_tax is not None else prior_tax
        prior = row.get("prior_year_net_value")
        sale = row.get("sale_price")
        sale_assessment = row.get("sale_assessment")
        year = row.get("year_constructed")
        acres = row.get("calculated_acres")

        self.append("assessed_value", net if net and net > 0 else None)
        self.append("land_value", land if land and land > 0 else None)
        self.append("improvement_value", improvement if improvement and improvement > 0 else None)
        self.append("annual_tax", tax if tax and tax > 0 else None)
        self.append("sale_price", sale if sale and sale > 0 else None)
        self.append("year_built", year if year and 1600 <= year <= 2026 else None)
        self.append("acres", acres if acres and 0 < acres < 100000 else None)
        if prior and prior > 0 and net is not None:
            change = (net - prior) / prior
            self.append("assessment_change", change)
            self.counts["assessment_change_positive"] += change > 0
            self.counts["assessment_jump"] += abs(change) > .10
        if net and net > 0 and land is not None:
            self.append("land_share", land / net)
        if net and net > 0 and tax is not None and tax >= 0:
            self.append("effective_tax_rate", tax / net)
        if sale and sale > 0 and sale_assessment and sale_assessment > 0:
            ratio = sale_assessment / sale
            if 0 < ratio < 10:
                self.append("sale_assessment_ratio", ratio)

        prop_class = str(row.get("property_class") or "").strip().upper()
        bucket = "other"
        if prop_class.startswith("15"):
            bucket = "exempt"
        elif prop_class.startswith("4"):
            bucket = "commercial"
        elif prop_class.startswith("3"):
            bucket = "farm"
        elif prop_class.startswith("2"):
            bucket = "residential"
        elif prop_class.startswith("1"):
            bucket = "vacant"
        self.counts["class_" + bucket] += 1

        if year and 1600 <= year <= 2026:
            self.counts["build_year_known"] += 1
            self.counts["pre_1978"] += year < 1978
            self.counts["recent_build"] += year >= 2020
        deed = str(row.get("deed_date") or "")
        if sale and sale > 0 and deed >= "2024-01-01":
            self.counts["recent_sale"] += 1

    def finish(self) -> dict:
        distributions = {}
        for name, scale in METRICS.items():
            values = list(self.series[name])
            values.sort()
            if not values:
                distributions[name] = {"count": self.counts[name]}
                continue
            conv = lambda v: round(v / scale, 4)
            distributions[name] = {
                "count": self.counts[name],
                "sample_count": len(values),
                "p10": conv(quantile(values, .10)),
                "p25": conv(quantile(values, .25)),
                "median": conv(quantile(values, .50)),
                "p75": conv(quantile(values, .75)),
                "p90": conv(quantile(values, .90)),
                "mean": round(self.sums[name] / self.counts[name], 4) if self.counts[name] else None,
            }

        d_assess, d_tax = distributions["assessed_value"], distributions["annual_tax"]
        d_ratio = distributions["sale_assessment_ratio"]
        building_median = distributions["year_built"].get("median")
        total_net = self.sums["assessed_value"]
        total_improvement = self.sums["improvement_value"]
        total_acres = self.sums["acres"]
        signals = {
            "median_assessed_value": d_assess.get("median"),
            "assessment_dispersion_iqr_pct": pct((d_assess.get("p75") or 0) - (d_assess.get("p25") or 0), d_assess.get("median") or 0),
            "median_annual_tax": d_tax.get("median"),
            "tax_dispersion_iqr_pct": pct((d_tax.get("p75") or 0) - (d_tax.get("p25") or 0), d_tax.get("median") or 0),
            "median_assessment_change_pct": round((distributions["assessment_change"].get("median") or 0) * 100, 3) if self.counts["assessment_change"] else None,
            "assessment_growth_positive_share_pct": pct(self.counts["assessment_change_positive"], self.counts["assessment_change"]),
            "assessment_change_dispersion_pct": round(((distributions["assessment_change"].get("p75") or 0) - (distributions["assessment_change"].get("p25") or 0)) * 100, 3) if self.counts["assessment_change"] else None,
            "assessment_jump_share_pct": pct(self.counts["assessment_jump"], self.counts["assessment_change"]),
            "median_land_share_pct": round((distributions["land_share"].get("median") or 0) * 100, 3) if self.counts["land_share"] else None,
            "improvement_value_share_pct": pct(total_improvement, total_net),
            "residential_parcel_share_pct": pct(self.counts["class_residential"], self.rows),
            "commercial_parcel_share_pct": pct(self.counts["class_commercial"], self.rows),
            "exempt_parcel_share_pct": pct(self.counts["class_exempt"], self.rows),
            "vacant_parcel_share_pct": pct(self.counts["class_vacant"], self.rows),
            "farm_parcel_share_pct": pct(self.counts["class_farm"], self.rows),
            "recent_sale_turnover_pct": pct(self.counts["recent_sale"], self.rows),
            "median_building_age": round(2026 - building_median, 1) if building_median else None,
            "pre_1978_building_share_pct": pct(self.counts["pre_1978"], self.counts["build_year_known"]),
            "recent_build_share_pct": pct(self.counts["recent_build"], self.counts["build_year_known"]),
            "median_effective_tax_rate_pct": round((distributions["effective_tax_rate"].get("median") or 0) * 100, 4) if self.counts["effective_tax_rate"] else None,
            "median_sale_assessment_ratio_pct": round((d_ratio.get("median") or 0) * 100, 3) if self.counts["sale_assessment_ratio"] else None,
            "sale_assessment_ratio_dispersion_pct": pct((d_ratio.get("p75") or 0) - (d_ratio.get("p25") or 0), d_ratio.get("median") or 0),
            "median_parcel_acres": distributions["acres"].get("median"),
            "assessed_value_per_acre": round(total_net / total_acres, 2) if total_acres else None,
        }
        return {
            "property_count": self.rows,
            "composition": {k.removeprefix("class_"): self.counts[k] for k in ("class_residential", "class_commercial", "class_exempt", "class_vacant", "class_farm", "class_other")},
            "distributions": distributions,
            "signals": {key: {"value": value} for key, value in signals.items()},
        }


def add_percentiles(scopes: dict) -> None:
    for signal, *_ in SIGNAL_DEFS:
        usable = sorted((float(item["signals"][signal]["value"]), key) for key, item in scopes.items() if item["signals"][signal]["value"] is not None)
        if not usable:
            continue
        n = len(usable)
        for index, (_, key) in enumerate(usable):
            scopes[key]["signals"][signal]["state_percentile"] = round((index + .5) / n * 100, 1)


def marker_pack() -> dict:
    markers = []
    for key, label, unit, tier, description in SIGNAL_DEFS:
        markers.append({
            "id": "modiv_intel." + key,
            "label": label,
            "description": description,
            "category": "statewide MOD-IV intelligence",
            "scope": "municipality",
            "tier": tier,
            "origin": "watchdog-derived",
            "proprietary": True,
            "professions": PROFESSIONS,
            "source_id": "treasury-modiv-2026",
            "field": key,
            "unit": unit,
            "formula": description,
            "professional_reason": "Statewide parcel-level MOD-IV context condensed into a comparable municipal benchmark."
        })
    return {"schema_version": 1, "version": "0.35.0", "source_id": "treasury-modiv-2026", "markers": markers}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--marker-pack", default=str(DEFAULT_PACK))
    parser.add_argument("--municipality-map", default=str(DEFAULT_MUNI))
    args = parser.parse_args()

    source_dir = pathlib.Path(args.input_dir)
    files = sorted(source_dir.glob("*.jsonl.gz"))
    if len(files) != 21:
        raise SystemExit(f"Expected 21 normalized county files, found {len(files)}")
    muni_map = json.loads(pathlib.Path(args.municipality_map).read_text(encoding="utf-8")).get("municipalities", {})
    state = Accumulator(STATE_SAMPLE_EVERY)
    municipalities, counties = {}, {}
    processed = 0

    for source in files:
        county_name = source.stem.replace(".jsonl", "").replace("-", " ").title()
        county = Accumulator()
        muni_acc = {}
        with gzip.open(source, "rt", encoding="utf-8") as stream:
            for line in stream:
                row = json.loads(line)
                district = row.get("county_district")
                if not district:
                    continue
                acc = muni_acc.setdefault(district, Accumulator())
                acc.add(row); county.add(row); state.add(row); processed += 1
        for district, acc in muni_acc.items():
            profile = acc.finish()
            lookup = muni_map.get(district, {})
            profile.update({"district": district, "name": lookup.get("name") or district, "county": lookup.get("county") or county_name})
            municipalities[district] = profile
        county_profile = county.finish()
        county_profile.update({"county": county_name})
        counties[county_name] = county_profile

    add_percentiles(municipalities)
    add_percentiles(counties)
    statewide = state.finish()
    generated = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    document = {
        "schema_version": 1,
        "version": "0.35.0",
        "generated_at": generated,
        "tax_year": 2026,
        "source_id": "treasury-modiv-2026",
        "privacy": "aggregate_output_only_no_parcel_or_person_rows",
        "scope_counts": {"source_records": processed, "municipalities": len(municipalities), "counties": len(counties)},
        "methodology": {
            "municipality_and_county_quantiles": "exact over valid reported observations",
            "statewide_quantiles": f"deterministic every-{STATE_SAMPLE_EVERY}th-record sample; counts and means remain exact",
            "percentiles": "rank of municipal/county signal value, not a good/bad score",
            "tax_field": "latest positive reported annual tax; 2026 current_year_tax is blank so last_year_tax is used without inferring a tax-change trend",
            "sale_warning": "recorded MOD-IV sale fields are not represented as verified arm's-length SR-1A sales"
        },
        "statewide": statewide,
        "counties": counties,
        "municipalities": municipalities,
    }
    pathlib.Path(args.output).write_text(json.dumps(document, separators=(",", ":")) + "\n", encoding="utf-8")
    pathlib.Path(args.marker_pack).write_text(json.dumps(marker_pack(), indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, **document["scope_counts"], "signals": len(SIGNAL_DEFS), "output_bytes": pathlib.Path(args.output).stat().st_size}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
