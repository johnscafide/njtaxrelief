#!/usr/bin/env python3
"""Run the governed federal housing builder with collision-safe NJ normalization.

This runner contains two narrow compatibility guards around the immutable v0.41
source builder:
1. Preserve municipality-type tokens except duplicate terminal types such as
   ``Atlantic City city`` -> ``atlantic city`` so same-county City/Township pairs
   never collide.
2. Query ACS B08301 county-by-county. The Census API intermittently returns a
   non-JSON response for the statewide wildcard county-subdivision request even
   though the same official dataset succeeds with explicit county constraints.

Neither guard changes source semantics or manufactures missing values.
"""

from __future__ import annotations

import importlib.util
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


NJ_COUNTY_FIPS = (
    "001", "003", "005", "007", "009", "011", "013", "015", "017", "019", "021",
    "023", "025", "027", "029", "031", "033", "035", "037", "039", "041",
)


def load_commute_county_scoped(key_to_district):
    variables = [
        "NAME", "B08301_001E", "B08301_003E", "B08301_004E", "B08301_010E",
        "B08301_016E", "B08301_017E", "B08301_018E", "B08301_019E",
        "B08301_020E", "B08301_021E",
    ]
    values = []
    for county in NJ_COUNTY_FIPS:
        params = [
            ("get", ",".join(variables)),
            ("for", "county subdivision:*"),
            ("in", f"state:34 county:{county}"),
        ]
        response = module.requests.get(module.CENSUS_URL, params=params, timeout=60)
        response.raise_for_status()
        try:
            rows = response.json()
        except Exception as exc:
            sample = response.text[:240].replace("\n", " ")
            raise RuntimeError(
                f"ACS B08301 returned non-JSON for NJ county {county}: {sample!r}"
            ) from exc
        if not isinstance(rows, list) or not rows or not isinstance(rows[0], list):
            raise RuntimeError(f"ACS B08301 malformed response for NJ county {county}")
        header = rows[0]
        values.extend(dict(zip(header, row)) for row in rows[1:])

    records = {}
    unmatched = []
    ignored = 0
    for row in values:
        key = module.source_name_key(row.get("NAME") or "")
        if not key:
            ignored += 1
            continue
        district = key_to_district.get(key)
        if not district:
            unmatched.append(str(row.get("NAME")))
            continue
        if district in records:
            raise RuntimeError(f"Duplicate ACS commute district mapping: {district}")
        total = module.census_int(row.get("B08301_001E"))
        parts = {
            "drive_alone": module.census_int(row.get("B08301_003E")),
            "carpool": module.census_int(row.get("B08301_004E")),
            "public_transit": module.census_int(row.get("B08301_010E")),
            "taxi_ridehail": module.census_int(row.get("B08301_016E")),
            "motorcycle": module.census_int(row.get("B08301_017E")),
            "bicycle": module.census_int(row.get("B08301_018E")),
            "walk": module.census_int(row.get("B08301_019E")),
            "other": module.census_int(row.get("B08301_020E")),
            "work_from_home": module.census_int(row.get("B08301_021E")),
        }
        compact_counts = {
            "drive": None if parts["drive_alone"] is None or parts["carpool"] is None else parts["drive_alone"] + parts["carpool"],
            "transit": parts["public_transit"],
            "walk_bike": None if parts["walk"] is None or parts["bicycle"] is None else parts["walk"] + parts["bicycle"],
            "work_from_home": parts["work_from_home"],
            "other": None if any(parts[k] is None for k in ("taxi_ridehail", "motorcycle", "other")) else parts["taxi_ridehail"] + parts["motorcycle"] + parts["other"],
        }
        compact_pct = {k: module.pct(v, total) for k, v in compact_counts.items()}
        records[district] = {
            "total_workers": total,
            "counts": parts,
            "compact_pct": compact_pct,
            "source_name": row.get("NAME"),
            "census_county": row.get("county"),
            "census_county_subdivision": row.get("county subdivision"),
        }

    if unmatched:
        module.fail("Unmatched ACS county subdivisions: " + "; ".join(unmatched[:20]))
    if len(records) != 564:
        module.fail(
            f"ACS commute mapped coverage must be 564, got {len(records)} "
            f"(ignored={ignored}, api_rows={len(values)})"
        )
    available = sum(
        1
        for row in records.values()
        if row["total_workers"] and all(v is not None for v in row["compact_pct"].values())
    )
    return records, {
        "api_rows": len(values),
        "api_requests": len(NJ_COUNTY_FIPS),
        "query_strategy": "21 explicit NJ county requests for county subdivision:*",
        "ignored_nonmunicipal_rows": ignored,
        "mapped_districts": len(records),
        "available_values": available,
        "source_checked_no_value": 564 - available,
    }


module.load_commute = load_commute_county_scoped

raise SystemExit(module.main())
