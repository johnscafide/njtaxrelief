#!/usr/bin/env python3
"""Run the governed federal housing builder with collision-safe NJ normalization.

This runner contains two narrow compatibility guards around the immutable v0.41
source builder:
1. Preserve municipality-type tokens except duplicate terminal types such as
   ``Atlantic City city`` -> ``atlantic city`` so same-county City/Township pairs
   never collide.
2. Read ACS 2024 5-year B08301 from the Census Bureau's official bulk Variance
   Replicate Estimate download instead of the API. The API currently returns a
   key-required HTML page in GitHub Actions; the bulk Census file is public,
   versioned, and avoids a runtime secret dependency.

Neither guard changes source semantics or manufactures missing values.
"""

from __future__ import annotations

import csv
import importlib.util
import io
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILDER = HERE / "build_federal_housing_context_v041.py"

spec = importlib.util.spec_from_file_location("watchdog_federal_housing_v041", BUILDER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load governed builder: {BUILDER}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def collision_safe_locality_base(value):
    normalized = module.clean(value)
    tokens = normalized.split()
    if (
        len(tokens) >= 2
        and tokens[-1] in module.MUNI_TYPES
        and tokens[-2] == tokens[-1]
    ):
        return " ".join(tokens[:-1])
    return normalized


module.locality_base = collision_safe_locality_base

# Positive controls for the normalization contract.
assert collision_safe_locality_base("Atlantic City City") == "atlantic city"
assert collision_safe_locality_base("Egg Harbor City") == "egg harbor city"
assert collision_safe_locality_base("Egg Harbor Township") == "egg harbor township"
assert collision_safe_locality_base("Gloucester City") == "gloucester city"
assert collision_safe_locality_base("Gloucester Township") == "gloucester township"


ACS_VRE_URL = (
    "https://www2.census.gov/programs-surveys/acs/replicate_estimates/2024/"
    "data/5-year/060/B08301.csv.zip"
)
ACS_ORDERS = {
    1: "total",
    3: "drive_alone",
    4: "carpool",
    10: "public_transit",
    16: "taxi_ridehail",
    17: "motorcycle",
    18: "bicycle",
    19: "walk",
    20: "other",
    21: "work_from_home",
}


def estimate_int(value):
    try:
        numeric = float(str(value).strip())
    except Exception:
        return None
    if numeric < 0 or not numeric.is_integer():
        return None
    return int(numeric)


def load_commute_bulk(key_to_district):
    response = module.requests.get(
        ACS_VRE_URL,
        timeout=180,
        headers={"User-Agent": "Watchdog-source-build/0.41 (public-data-ingestion)"},
    )
    response.raise_for_status()
    if not response.content.startswith(b"PK"):
        sample = response.text[:240].replace("\n", " ")
        raise RuntimeError(f"ACS B08301 bulk source did not return a ZIP archive: {sample!r}")

    source_by_geoid = {}
    source_rows = 0
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(csv_names) != 1:
            raise RuntimeError(f"Expected one ACS B08301 CSV in ZIP, found {csv_names}")
        with archive.open(csv_names[0]) as raw:
            # Census VRE files contain legacy single-byte punctuation in some
            # geography/table-title records. Latin-1 is lossless for every byte;
            # identifiers, names, orders and numeric estimates used here are ASCII.
            text = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            reader = csv.reader(text)
            # Census VRE documentation specifies FIRSTOBS=4. The first three
            # physical records are table metadata; data rows then use the fixed
            # layout: tblid, geoid, name, order, title, estimate, ...
            for line_number, row in enumerate(reader, start=1):
                if line_number <= 3:
                    continue
                if len(row) < 6:
                    continue
                tblid, geoid, name = row[0].strip(), row[1].strip(), row[2].strip()
                if tblid.upper() != "B08301" or not geoid.startswith("0600000US34"):
                    continue
                try:
                    order = int(row[3])
                except Exception:
                    continue
                if order not in ACS_ORDERS:
                    continue
                source_rows += 1
                record = source_by_geoid.setdefault(geoid, {"name": name, "values": {}})
                if record["name"] != name:
                    raise RuntimeError(f"Conflicting ACS geography names for {geoid}")
                if order in record["values"]:
                    raise RuntimeError(f"Duplicate ACS B08301 order {order} for {geoid}")
                record["values"][order] = estimate_int(row[5])

    # A complete municipality row needs every governed B08301 component. Keep
    # exact source-null estimates as source_checked_no_value rather than zero.
    records = {}
    unmatched = []
    ignored_nonmunicipal = 0
    for geoid, source in source_by_geoid.items():
        key = module.source_name_key(source["name"])
        if not key:
            ignored_nonmunicipal += 1
            continue
        district = key_to_district.get(key)
        if not district:
            unmatched.append(source["name"])
            continue
        if district in records:
            raise RuntimeError(f"Duplicate ACS commute district mapping: {district}")
        values = source["values"]
        missing_orders = sorted(set(ACS_ORDERS) - set(values))
        if missing_orders:
            raise RuntimeError(
                f"ACS B08301 missing governed orders {missing_orders} for {source['name']} ({geoid})"
            )
        total = values[1]
        parts = {
            "drive_alone": values[3],
            "carpool": values[4],
            "public_transit": values[10],
            "taxi_ridehail": values[16],
            "motorcycle": values[17],
            "bicycle": values[18],
            "walk": values[19],
            "other": values[20],
            "work_from_home": values[21],
        }
        compact_counts = {
            "drive": None if parts["drive_alone"] is None or parts["carpool"] is None else parts["drive_alone"] + parts["carpool"],
            "transit": parts["public_transit"],
            "walk_bike": None if parts["walk"] is None or parts["bicycle"] is None else parts["walk"] + parts["bicycle"],
            "work_from_home": parts["work_from_home"],
            "other": None if any(parts[k] is None for k in ("taxi_ridehail", "motorcycle", "other")) else parts["taxi_ridehail"] + parts["motorcycle"] + parts["other"],
        }
        compact_pct = {k: module.pct(v, total) for k, v in compact_counts.items()}
        suffix = geoid.split("US", 1)[1] if "US" in geoid else ""
        records[district] = {
            "total_workers": total,
            "counts": parts,
            "compact_pct": compact_pct,
            "source_name": source["name"],
            "census_county": suffix[2:5] if len(suffix) >= 10 else None,
            "census_county_subdivision": suffix[5:10] if len(suffix) >= 10 else None,
        }

    if unmatched:
        module.fail("Unmatched ACS county subdivisions: " + "; ".join(unmatched[:20]))
    if len(records) != 564:
        module.fail(
            f"ACS commute mapped coverage must be 564, got {len(records)} "
            f"(source_geographies={len(source_by_geoid)}, ignored={ignored_nonmunicipal})"
        )
    available = sum(
        1
        for row in records.values()
        if row["total_workers"] and all(v is not None for v in row["compact_pct"].values())
    )
    return records, {
        "bulk_source_url": ACS_VRE_URL,
        "bulk_archive_bytes": len(response.content),
        "source_component_rows_retained": source_rows,
        "source_geographies_retained": len(source_by_geoid),
        "query_strategy": "official Census 2024 ACS 5-year VRE B08301 bulk file, summary level 060",
        "ignored_nonmunicipal_rows": ignored_nonmunicipal,
        "mapped_districts": len(records),
        "available_values": available,
        "source_checked_no_value": 564 - available,
    }


module.load_commute = load_commute_bulk

raise SystemExit(module.main())
