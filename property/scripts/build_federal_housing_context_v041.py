#!/usr/bin/env python3
"""Build governed NJ federal housing/commute context for Watchdog.

Inputs:
- Watchdog canonical 564-town manifest.
- Pinned NJ-only HUD CHAS Table 8 derived source chunks committed under
  property/data/source-snapshots/hud-chas-2018-2022/.
- HUD Picture of Subsidized Households FY2025 project workbook (official URL).
- Census ACS 2024 5-year B08301 county-subdivision API.
- NJOGIS Municipal Boundaries FeatureServer for project point-in-polygon assignment.

The builder fails closed when canonical municipality coverage does not reconcile.
"""

from __future__ import annotations

import io
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "towns" / "town-manifest.json"
CHAS_DIR = ROOT / "property" / "data" / "source-snapshots" / "hud-chas-2018-2022"
OUT = ROOT / "property" / "data" / "federal-housing-context-v041.json"
AUDIT = ROOT / "property" / "data" / "federal-housing-context-v041-audit.json"

RELEASE = "federal-housing-context-v041-2026-09-13"
HUD_PROJECT_URL = "https://www.huduser.gov/portal/datasets/pictures/files/PROJECT_2025_2020census.xlsx"
CENSUS_URL = "https://api.census.gov/data/2024/acs/acs5"
NJOGIS_URL = (
    "https://services1.arcgis.com/PsDtSYIjNsyfjwcX/arcgis/rest/services/"
    "Municipal_Boundaries/FeatureServer/0/query"
)

MUNI_TYPES = ("city", "borough", "township", "town", "village")


def fail(message: str) -> None:
    raise RuntimeError(message)


def clean(value: Any) -> str:
    s = "" if value is None else str(value)
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return re.sub(r"\s+", " ", s)


def locality_base(value: Any) -> str:
    s = clean(value)
    # Remove exactly one terminal municipality type. This preserves names such as
    # "Atlantic City" after normalizing source text "Atlantic City city".
    for suffix in MUNI_TYPES:
        token = " " + suffix
        if s.endswith(token):
            return s[: -len(token)].strip()
    return s


def county_base(value: Any) -> str:
    s = clean(value)
    if s.endswith(" county"):
        s = s[:-7].strip()
    return s


def source_name_key(name: str) -> tuple[str, str] | None:
    parts = [p.strip() for p in str(name or "").split(",")]
    if len(parts) < 2:
        return None
    locality, county = parts[0], parts[1]
    if clean(locality).startswith("county subdivisions not defined"):
        return None
    return locality_base(locality), county_base(county)


def load_manifest() -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str], str], dict[str, str]]:
    root = json.loads(MANIFEST.read_text(encoding="utf-8"))
    pages = root.get("pages") or []
    if len(pages) != 564:
        fail(f"Canonical town manifest must contain 564 towns, got {len(pages)}")
    towns: dict[str, dict[str, Any]] = {}
    key_to_district: dict[tuple[str, str], str] = {}
    raw_aliases: dict[str, list[str]] = defaultdict(list)
    base_aliases: dict[str, list[str]] = defaultdict(list)
    for row in pages:
        district = str(row.get("district") or "").zfill(4)
        name = str(row.get("name") or "").strip()
        county = str(row.get("county") or "").strip()
        if not re.fullmatch(r"\d{4}", district):
            fail(f"Invalid district in town manifest: {row}")
        key = (locality_base(name), county_base(county))
        if key in key_to_district and key_to_district[key] != district:
            fail(f"Ambiguous canonical municipality key {key}")
        key_to_district[key] = district
        towns[district] = {"name": name, "county": county}
        raw_aliases[clean(name)].append(district)
        base_aliases[locality_base(name)].append(district)
    if len(towns) != 564 or len(key_to_district) != 564:
        fail("Canonical town manifest did not resolve to 564 unique districts/keys")
    city_alias: dict[str, str] = {}
    for alias_map in (raw_aliases, base_aliases):
        for alias, districts in alias_map.items():
            unique = sorted(set(districts))
            if len(unique) == 1:
                city_alias.setdefault(alias, unique[0])
    return towns, key_to_district, city_alias


def load_chas(key_to_district: dict[tuple[str, str], str]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    unmatched: list[str] = []
    source_rows = 0
    for path in sorted(CHAS_DIR.glob("part-*.json")):
        root = json.loads(path.read_text(encoding="utf-8"))
        if root.get("release") != "hud-chas-2018-2022-nj-table8-cost-burden-v1":
            fail(f"Unexpected CHAS release in {path}")
        for geoid, values in (root.get("records") or {}).items():
            source_rows += 1
            name, pct, numerator, denominator = values
            key = source_name_key(name)
            district = key_to_district.get(key) if key else None
            if not district:
                unmatched.append(str(name))
                continue
            if district in records:
                fail(f"Duplicate CHAS district mapping: {district}")
            records[district] = {
                "value": pct,
                "numerator": numerator,
                "denominator": denominator,
                "geoid": str(geoid),
                "source_name": str(name),
            }
    if source_rows != 564:
        fail(f"CHAS source chunks must contain 564 rows, got {source_rows}")
    if unmatched:
        fail("Unmatched CHAS municipalities: " + "; ".join(unmatched[:20]))
    if len(records) != 564:
        fail(f"CHAS mapped coverage must be 564, got {len(records)}")
    available = sum(1 for row in records.values() if row["value"] is not None)
    return records, {
        "source_rows": source_rows,
        "mapped_districts": len(records),
        "available_values": available,
        "source_checked_no_value": 564 - available,
    }


def census_int(value: Any) -> int | None:
    try:
        v = int(str(value))
    except Exception:
        return None
    # ACS API sentinel negatives indicate missing/not applicable.
    return v if v >= 0 else None


def pct(value: int | None, total: int | None) -> float | None:
    if value is None or total is None or total <= 0:
        return None
    return round(100.0 * value / total, 2)


def load_commute(key_to_district: dict[tuple[str, str], str]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    variables = [
        "NAME", "B08301_001E", "B08301_003E", "B08301_004E", "B08301_010E",
        "B08301_016E", "B08301_017E", "B08301_018E", "B08301_019E",
        "B08301_020E", "B08301_021E",
    ]
    params = [
        ("get", ",".join(variables)),
        ("for", "county subdivision:*"),
        ("in", "state:34"),
        ("in", "county:*"),
    ]
    response = requests.get(CENSUS_URL, params=params, timeout=60)
    response.raise_for_status()
    rows = response.json()
    header = rows[0]
    values = [dict(zip(header, row)) for row in rows[1:]]
    records: dict[str, dict[str, Any]] = {}
    unmatched: list[str] = []
    ignored = 0
    for row in values:
        key = source_name_key(row.get("NAME") or "")
        if not key:
            ignored += 1
            continue
        district = key_to_district.get(key)
        if not district:
            unmatched.append(str(row.get("NAME")))
            continue
        total = census_int(row.get("B08301_001E"))
        parts = {
            "drive_alone": census_int(row.get("B08301_003E")),
            "carpool": census_int(row.get("B08301_004E")),
            "public_transit": census_int(row.get("B08301_010E")),
            "taxi_ridehail": census_int(row.get("B08301_016E")),
            "motorcycle": census_int(row.get("B08301_017E")),
            "bicycle": census_int(row.get("B08301_018E")),
            "walk": census_int(row.get("B08301_019E")),
            "other": census_int(row.get("B08301_020E")),
            "work_from_home": census_int(row.get("B08301_021E")),
        }
        compact_counts = {
            "drive": None if parts["drive_alone"] is None or parts["carpool"] is None else parts["drive_alone"] + parts["carpool"],
            "transit": parts["public_transit"],
            "walk_bike": None if parts["walk"] is None or parts["bicycle"] is None else parts["walk"] + parts["bicycle"],
            "work_from_home": parts["work_from_home"],
            "other": None if any(parts[k] is None for k in ("taxi_ridehail", "motorcycle", "other")) else parts["taxi_ridehail"] + parts["motorcycle"] + parts["other"],
        }
        compact_pct = {k: pct(v, total) for k, v in compact_counts.items()}
        records[district] = {
            "total_workers": total,
            "counts": parts,
            "compact_pct": compact_pct,
            "source_name": row.get("NAME"),
            "census_county": row.get("county"),
            "census_county_subdivision": row.get("county subdivision"),
        }
    if unmatched:
        fail("Unmatched ACS county subdivisions: " + "; ".join(unmatched[:20]))
    if len(records) != 564:
        fail(f"ACS commute mapped coverage must be 564, got {len(records)} (ignored={ignored})")
    available = sum(1 for row in records.values() if row["total_workers"] and all(v is not None for v in row["compact_pct"].values()))
    return records, {
        "api_rows": len(values),
        "ignored_nonmunicipal_rows": ignored,
        "mapped_districts": len(records),
        "available_values": available,
        "source_checked_no_value": 564 - available,
    }


def fetch_boundaries() -> tuple[list[Any], list[str], dict[str, dict[str, Any]]]:
    params = {
        "where": "1=1",
        "outFields": "MUN_CODE,MUN_LABEL,COUNTY,NAME",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
    }
    response = requests.get(NJOGIS_URL, params=params, timeout=90)
    response.raise_for_status()
    root = response.json()
    features = root.get("features") or []
    geometries: list[Any] = []
    codes: list[str] = []
    attrs: dict[str, dict[str, Any]] = {}
    for feature in features:
        properties = feature.get("properties") or {}
        code = str(properties.get("MUN_CODE") or "").zfill(4)
        geometry = feature.get("geometry")
        if not re.fullmatch(r"\d{4}", code) or not geometry:
            continue
        geometries.append(shape(geometry))
        codes.append(code)
        attrs[code] = properties
    if len(set(codes)) != 564:
        fail(f"NJOGIS boundary layer must expose 564 unique MUN_CODE values, got {len(set(codes))}")
    return geometries, codes, attrs


def project_county_fips(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    try:
        digits = str(int(float(value))).zfill(11)
    except Exception:
        digits = re.sub(r"\D", "", str(value))
    if len(digits) >= 5 and digits.startswith("34"):
        return digits[2:5]
    return None


def load_hud_projects(
    towns: dict[str, dict[str, Any]],
    city_alias: dict[str, str],
) -> tuple[dict[str, int], dict[str, Any]]:
    response = requests.get(HUD_PROJECT_URL, timeout=120)
    response.raise_for_status()
    frame = pd.read_excel(io.BytesIO(response.content), sheet_name="PROJECT_EXTRACT")
    nj = frame[frame["state"].astype(str).str.upper().eq("NJ")].copy()
    raw_rows = len(nj)
    if raw_rows < 900:
        fail(f"Unexpected FY2025 NJ project row count: {raw_rows}")
    nj["total_units"] = pd.to_numeric(nj["total_units"], errors="coerce")
    nj["latitude"] = pd.to_numeric(nj["latitude"], errors="coerce")
    nj["longitude"] = pd.to_numeric(nj["longitude"], errors="coerce")
    if nj["code"].isna().any():
        fail("HUD FY2025 NJ project rows contain missing project codes")

    # Project codes can repeat for program/sub-program breakouts. Use the maximum
    # published "subsidized units available" for each project code to avoid
    # double-counting the same physical project across overlapping program rows.
    projects: list[dict[str, Any]] = []
    duplicate_codes = 0
    for code, group in nj.groupby("code", sort=True, dropna=False):
        if len(group) > 1:
            duplicate_codes += 1
        valid_units = group.loc[group["total_units"].notna() & (group["total_units"] >= 0), "total_units"]
        if valid_units.empty:
            fail(f"No usable HUD subsidized-unit count for project code {code}")
        # Coordinates are expected to be stable across repeated program rows.
        lat_values = sorted(set(float(x) for x in group["latitude"].dropna()))
        lon_values = sorted(set(float(x) for x in group["longitude"].dropna()))
        if len(lat_values) > 1 or len(lon_values) > 1:
            fail(f"Conflicting coordinates for HUD project code {code}")
        first = group.iloc[0]
        projects.append({
            "code": str(code),
            "name": str(first.get("name") or ""),
            "units": int(valid_units.max()),
            "latitude": lat_values[0] if lat_values else None,
            "longitude": lon_values[0] if lon_values else None,
            "std_city": str(first.get("STD_CITY") or "").strip(),
            "county_fips": project_county_fips(first.get("Stctytrt")),
            "row_count": len(group),
        })

    geometries, boundary_codes, _ = fetch_boundaries()
    tree = STRtree(geometries)
    municipality_units = {district: 0 for district in towns}
    mapped_projects = 0
    fallback_projects = 0
    ambiguous_projects: list[str] = []
    unmapped_projects: list[str] = []
    for project in projects:
        district: str | None = None
        lat, lon = project["latitude"], project["longitude"]
        if lat is not None and lon is not None and -76.0 <= lon <= -73.0 and 38.5 <= lat <= 41.5:
            point = Point(lon, lat)
            candidates = tree.query(point)
            hits = []
            for idx in candidates:
                i = int(idx)
                if geometries[i].covers(point):
                    hits.append(boundary_codes[i])
            hits = sorted(set(hits))
            if len(hits) == 1:
                district = hits[0]
            elif len(hits) > 1:
                ambiguous_projects.append(project["code"])
                continue
        if district is None:
            alias = clean(project["std_city"])
            district = city_alias.get(alias)
            if district:
                fallback_projects += 1
        if not district or district not in municipality_units:
            unmapped_projects.append(project["code"] + " " + project["name"])
            continue
        municipality_units[district] += int(project["units"])
        mapped_projects += 1

    if ambiguous_projects:
        fail("Ambiguous HUD project boundary assignments: " + ", ".join(ambiguous_projects[:20]))
    if unmapped_projects:
        fail("Unmapped HUD projects: " + "; ".join(unmapped_projects[:20]))
    if mapped_projects != len(projects):
        fail(f"HUD project mapping incomplete: {mapped_projects}/{len(projects)}")

    return municipality_units, {
        "source_rows_nj": raw_rows,
        "unique_project_codes": len(projects),
        "duplicate_project_codes": duplicate_codes,
        "mapped_project_codes": mapped_projects,
        "fallback_city_matches": fallback_projects,
        "raw_units_sum": int(nj.loc[nj["total_units"].notna() & (nj["total_units"] >= 0), "total_units"].sum()),
        "deduplicated_project_units_sum": int(sum(p["units"] for p in projects)),
        "municipal_units_sum": int(sum(municipality_units.values())),
        "municipalities_with_project_units": sum(1 for v in municipality_units.values() if v > 0),
        "dedupe_rule": "max subsidized units available per project code; prevents overlap across repeated program/sub-program rows",
        "semantic_limit": "Project-level public housing and multifamily assisted units only; tenant-based vouchers without a project location are excluded.",
    }


def main() -> int:
    towns, key_to_district, city_alias = load_manifest()
    chas, chas_audit = load_chas(key_to_district)
    commute, commute_audit = load_commute(key_to_district)
    hud_units, hud_audit = load_hud_projects(towns, city_alias)

    municipalities: dict[str, dict[str, Any]] = {}
    for district in sorted(towns):
        municipalities[district] = {
            "name": towns[district]["name"],
            "county": towns[district]["county"],
            "low_income_cost_burden": chas[district]["value"],
            "low_income_cost_burden_numerator": chas[district]["numerator"],
            "low_income_households_denominator": chas[district]["denominator"],
            "chas_geoid": chas[district]["geoid"],
            "hud_subsidized_units": hud_units[district],
            "commute_mode_mix": commute[district]["compact_pct"],
            "commute_total_workers": commute[district]["total_workers"],
            "commute_source_geography": {
                "county": commute[district]["census_county"],
                "county_subdivision": commute[district]["census_county_subdivision"],
            },
        }

    output = {
        "schema_version": 1,
        "release": RELEASE,
        "generated_by": "property/scripts/build_federal_housing_context_v041.py",
        "municipalities_total": len(municipalities),
        "sources": {
            "low_income_cost_burden": {
                "source": "U.S. HUD Comprehensive Housing Affordability Strategy (CHAS)",
                "vintage": "2018-2022 ACS 5-year; released 2025-12-23",
                "table": "Table 8, summary level 060",
                "definition": "Share of owner- and renter-occupied households at or below 80% HAMFI with housing cost burden greater than 30%.",
                "unit": "percent",
                "formula": "100 * (Table 8 >30%-50% burden + >50% burden counts across <=30%, >30-50%, >50-80% HAMFI; owners+renter) / (owner+renter household counts across the same <=80% HAMFI bands)",
                "landing_page": "https://www.huduser.gov/portal/datasets/cp.html",
                "source_snapshot_release": "hud-chas-2018-2022-nj-table8-cost-burden-v1",
            },
            "hud_subsidized_units": {
                "source": "U.S. HUD Picture of Subsidized Households",
                "vintage": "FY 2025; 2020 Census geographies; 31DEC2025 snapshot",
                "definition": "Subsidized units available in HUD project-level public-housing and multifamily-assisted records spatially located inside the municipality.",
                "unit": "units",
                "source_url": HUD_PROJECT_URL,
                "landing_page": "https://www.huduser.gov/portal/datasets/assthsg.html",
                "dedupe_rule": hud_audit["dedupe_rule"],
                "semantic_limit": hud_audit["semantic_limit"],
                "spatial_join": "HUD project coordinates -> NJOGIS Municipal Boundaries MUN_CODE; unique project-code city fallback only when coordinates are missing.",
            },
            "commute_mode_mix": {
                "source": "U.S. Census Bureau American Community Survey",
                "vintage": "2024 ACS 5-year",
                "table": "B08301 Means of Transportation to Work",
                "definition": "Percentage mix among workers 16+ by five compact categories: drive, public transit, walk/bike, work from home, and other.",
                "unit": "percent",
                "api": CENSUS_URL,
                "variables": {
                    "total": "B08301_001E",
                    "drive": ["B08301_003E", "B08301_004E"],
                    "transit": ["B08301_010E"],
                    "walk_bike": ["B08301_018E", "B08301_019E"],
                    "work_from_home": ["B08301_021E"],
                    "other": ["B08301_016E", "B08301_017E", "B08301_020E"],
                },
            },
            "municipal_boundaries": {
                "source": "New Jersey Office of GIS Municipal Boundaries",
                "service": NJOGIS_URL.rsplit("/query", 1)[0],
                "join_key": "MUN_CODE",
            },
        },
        "municipalities": municipalities,
    }
    audit = {
        "schema_version": 1,
        "release": RELEASE,
        "status": "passed",
        "canonical_municipalities": len(towns),
        "chas": chas_audit,
        "commute": commute_audit,
        "hud_projects": hud_audit,
        "checks": [
            "canonical town manifest = 564",
            "CHAS mapped districts = 564",
            "ACS county-subdivision mapped districts = 564",
            "NJOGIS boundary MUN_CODE coverage = 564",
            "all deduplicated NJ HUD project codes assigned to one Watchdog municipality",
            "HUD project aggregation excludes tenant-based vouchers without project locations",
        ],
    }

    OUT.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    AUDIT.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
