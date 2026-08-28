#!/usr/bin/env python3
"""Build governed NJ DCA UFB longitudinal artifacts for v0.40.

The source workbook is the already-certified 2025 NJ DCA User Friendly Budget
Database. This builder uses only annual Summary fields whose group/heading
semantics remain identical across every 2015-2025 sheet after replacing only
literal calendar-year tokens with YEAR. No weights, scores, interpolation, or
missing-year synthesis are introduced.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V039_SCRIPT = ROOT / "scripts" / "build_ufb_v039.py"
V039_PACK = ROOT / "data" / "nj-source-pack-v039.json"

spec = importlib.util.spec_from_file_location("ufb_v039", V039_SCRIPT)
ufb = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(ufb)

EXPECTED_SHA256 = ufb.EXPECTED_SHA256
SOURCE_URL = ufb.SOURCE_URL
SOURCE_ID = "nj-dca-user-friendly-budget-longitudinal"
RELEASE = "nj-dca-ufb-2015-2025-v1"
PROVIDER_VERSION = "nj-dca-ufb-v040-longitudinal"
YEARS = list(range(2015, 2026))
WARNING = (
    "Official NJ DCA compilation of municipal User Friendly Budget submissions. "
    "DCA states all data are self-reported by municipalities and have not been independently audited or verified; "
    "missing submissions and blank/obvious-error cells may have no data. Longitudinal histories contain only actual "
    "published annual Summary-sheet observations; missing years are not synthesized."
)
SELECTED = (
    list(range(13, 18))
    + list(range(19, 67))
    + list(range(68, 140))
    + list(range(189, 197))
    + list(range(315, 354))
    + list(range(397, 399))
    + list(range(402, 407))
)


def norm(v):
    if v is None:
        return None
    s = re.sub(r"\b20(?:1[4-9]|2[0-6])\b", "YEAR", str(v))
    return re.sub(r"\s+", " ", s).strip()


def headers(rows):
    group_by_col = {}
    group = None
    for c in range(1, 417):
        if rows.get(4, {}).get(c) not in (None, ""):
            group = rows[4][c]
        group_by_col[c] = group
    return {c: (group_by_col[c], rows.get(5, {}).get(c)) for c in SELECTED}


def municipality_rows(rows):
    out = {}
    for rn, vals in rows.items():
        code = vals.get(1)
        if isinstance(code, str) and re.fullmatch(r"\d{4}", code):
            out[code] = rn
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook", type=Path)
    ap.add_argument("--repo-root", type=Path, default=Path("."))
    args = ap.parse_args()
    root = args.repo_root.resolve()

    if ufb.sha256(args.workbook) != EXPECTED_SHA256:
        raise SystemExit("UFB workbook SHA-256 does not match the certified source artifact")

    v039 = json.loads((root / "property/data/nj-source-pack-v039.json").read_text(encoding="utf-8"))
    base_by_pair = {}
    for item in v039.get("markers", []):
        pair = (str(item.get("source_group")), str(item.get("source_heading")))
        if pair in base_by_pair:
            raise SystemExit(f"Duplicate v0.39 source pair: {pair}")
        base_by_pair[pair] = item

    with zipfile.ZipFile(args.workbook) as z:
        shared = ufb.read_shared(z)
        targets = ufb.sheet_targets(z)
        annual = {}
        for name, target in targets.items():
            m = re.match(r"^(20(?:1[5-9]|2[0-5]))(?: Summary)?$", name.strip())
            if m:
                annual[int(m.group(1))] = (name, ufb.read_sheet(z, target, shared))

    if sorted(annual) != YEARS:
        raise SystemExit(f"Expected annual Summary sheets 2015-2025, found {sorted(annual)}")

    header_maps = {year: headers(rows) for year, (_, rows) in annual.items()}
    base_headers = header_maps[2025]
    stable_columns = []
    for c in SELECTED:
        fingerprint = (norm(base_headers[c][0]), norm(base_headers[c][1]))
        if all((norm(header_maps[y][c][0]), norm(header_maps[y][c][1])) == fingerprint for y in YEARS):
            stable_columns.append(c)
    if len(stable_columns) != 130:
        raise SystemExit(f"Expected 130 year-token-normalized stable fields, found {len(stable_columns)}")

    current_codes = municipality_rows(annual[2025][1])
    if len(current_codes) != 564:
        raise SystemExit(f"Expected 564 current municipalities, found {len(current_codes)}")
    year_codes = {year: municipality_rows(rows) for year, (_, rows) in annual.items()}
    for year in YEARS:
        missing = sorted(set(current_codes) - set(year_codes[year]))
        if missing:
            raise SystemExit(f"Annual sheet {year} is missing current municipality codes: {missing[:10]}")

    fields = []
    for index, c in enumerate(stable_columns):
        pair = (str(base_headers[c][0]), str(base_headers[c][1]))
        base = base_by_pair.get(pair)
        if not base:
            raise SystemExit(f"Stable column {c} does not map to a v0.39 governed field: {pair}")
        field = f"{base['field']}_history"
        marker_id = f"njplus.nj-dca-ufb-longitudinal.{field}"
        headings_by_year = {
            str(year): {
                "source_group": header_maps[year][c][0],
                "source_heading": header_maps[year][c][1],
            }
            for year in YEARS
        }
        fields.append(
            {
                "index": index,
                "column": c,
                "field": field,
                "id": marker_id,
                "marker_id": marker_id,
                "base_marker_id": base["marker_id"],
                "label": f"{base['label']} history (2015-2025)",
                "description": (
                    f"Annual NJ DCA User Friendly Budget Summary history for {base['label']}. "
                    "History keys are UFB Summary-sheet years 2015-2025. Where DCA labels a field as prior-year actual, "
                    "that source meaning is preserved; the key does not relabel the underlying fiscal period. Missing "
                    "annual source cells are omitted rather than filled."
                ),
                "category": base.get("category"),
                "scope": "municipality",
                "tier": "pro_plus",
                "origin": "public",
                "proprietary": False,
                "professions": base.get("professions") or [],
                "source_id": SOURCE_ID,
                "source_field": f"2015-2025 annual Summary sheets · {norm(base_headers[c][0])} · {norm(base_headers[c][1])}",
                "unit": base.get("unit"),
                "headings_by_year": headings_by_year,
            }
        )

    if len({f["id"] for f in fields}) != 130:
        raise SystemExit("v0.40 marker IDs are not unique")

    counties = defaultdict(dict)
    coverage = [0] * len(fields)
    observation_counts = [0] * len(fields)
    min_years = [None] * len(fields)
    max_years = [None] * len(fields)

    for code, row2025 in current_codes.items():
        vals2025 = annual[2025][1][row2025]
        name = vals2025.get(3)
        county = vals2025.get(4)
        quality_by_year = []
        histories = []
        for year in YEARS:
            rows = annual[year][1]
            vals = rows[year_codes[year][code]]
            quality_by_year.append([year, bool(vals.get(6)), bool(vals.get(7))])
        for fi, field in enumerate(fields):
            c = field["column"]
            history = []
            for year in YEARS:
                rows = annual[year][1]
                value = ufb.clean(rows[year_codes[year][code]].get(c))
                if value is not None:
                    history.append([year, value])
            histories.append(history)
            if history:
                coverage[fi] += 1
                observation_counts[fi] += len(history)
                min_years[fi] = history[0][0] if min_years[fi] is None else min(min_years[fi], history[0][0])
                max_years[fi] = history[-1][0] if max_years[fi] is None else max(max_years[fi], history[-1][0])
        counties[code[:2]][code] = [name, county, quality_by_year, histories]

    manifest_fields = []
    pack_markers = []
    for i, field in enumerate(fields):
        manifest_fields.append(
            {
                "index": i,
                "marker_id": field["marker_id"],
                "base_marker_id": field["base_marker_id"],
                "field": field["field"],
                "source_field": field["source_field"],
                "unit": field["unit"],
                "coverage_municipalities": coverage[i],
                "observation_count": observation_counts[i],
                "min_observation_year": min_years[i],
                "max_observation_year": max_years[i],
                "headings_by_year": field["headings_by_year"],
            }
        )
        pack_markers.append({k: v for k, v in field.items() if k not in ("index", "column", "headings_by_year", "marker_id")})

    data_dir = root / "property/data/ufb-v040"
    data_dir.mkdir(parents=True, exist_ok=True)
    for old in data_dir.glob("*.json"):
        old.unlink()

    manifest = {
        "schema_version": 1,
        "release": RELEASE,
        "provider_version": PROVIDER_VERSION,
        "source_id": SOURCE_ID,
        "source_url": SOURCE_URL,
        "source_sheets": [f"{y} Summary" for y in YEARS],
        "observation_years": YEARS,
        "observation_year_semantics": "UFB annual Summary-sheet year; each field retains DCA's source heading semantics, including prior-year actual labels where applicable.",
        "workbook_sha256": EXPECTED_SHA256,
        "municipality_count": 564,
        "county_count": 21,
        "field_count": 130,
        "selection_rule": "Included only when source group + source heading are identical across all 2015-2025 annual Summary sheets after replacing literal calendar-year tokens with YEAR; no other text normalization is permitted.",
        "missing_value_tokens": ["--", "No data"],
        "warning": WARNING,
        "field_order": [f["marker_id"] for f in fields],
        "fields": manifest_fields,
    }
    (data_dir / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")
    for cc, data in sorted(counties.items()):
        payload = {
            "schema_version": 1,
            "release": RELEASE,
            "county_code": cc,
            "observation_years": YEARS,
            "municipalities": data,
        }
        (data_dir / f"{cc}.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")

    pack = {
        "schema_version": 1,
        "version": "0.40.0",
        "released": "2026-08-28",
        "definition": "130 exact municipality-level longitudinal histories from semantically stable NJ DCA User Friendly Budget annual Summary fields, 2015-2025. No score, weighting, interpolation, or qualitative inference is included.",
        "activation_rule": "Markers enter planned. Live state requires committed source artifacts, authenticated production canary, provider coverage, and static governance reconciliation.",
        "source_contract": {
            "source_id": SOURCE_ID,
            "source_release": RELEASE,
            "source_url": SOURCE_URL,
            "source_sheets": [f"{y} Summary" for y in YEARS],
            "workbook_sha256": EXPECTED_SHA256,
            "municipality_count": 564,
            "field_count": 130,
            "source_artifact": "property/data/ufb-v040/manifest.json + county 01-21 JSON shards",
            "warning": WARNING,
        },
        "markers": pack_markers,
    }
    (root / "property/data/nj-source-pack-v040.json").write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "markers": 130,
                "municipalities": 564,
                "counties": 21,
                "years": YEARS,
                "coverage_min": min(coverage),
                "coverage_max": max(coverage),
                "observation_count_min": min(observation_counts),
                "observation_count_max": max(observation_counts),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
