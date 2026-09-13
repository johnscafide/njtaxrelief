#!/usr/bin/env python3
"""Normalize the pinned HUD CHAS NJ snapshot without changing metric values.

This is intentionally narrow. The originally staged chunks contained transport
transcription defects in GEOID text and one source-name typo for the Jamesburg
borough row. Canonical GEOIDs below were checked against the staged official
HUD CHAS 2018-2022 NJ Table 8 CSV. No percentages, numerators, denominators,
or geography assignments are altered.

Unexpected malformed rows are all reported together and fail closed.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "property" / "data" / "source-snapshots" / "hud-chas-2018-2022"
RELEASE = "hud-chas-2018-2022-nj-table8-cost-burden-v1"
GEOID_RE = re.compile(r"^0600000US34\d{8}$")
JAMESBURG_GEOID = "0600000US3402334890"
JAMESBURG_NAME = "Jamesburg borough, Middlesex County, New Jersey"

# Exact source-name -> canonical HUD/Census county-subdivision GEOID controls for
# the rows whose identifiers were damaged during chunk transport. These values
# come from the pinned official NJ Table 8 CSV, not from fuzzy reconstruction.
KNOWN_GEOID_REPAIRS = {
    "Elmer borough, Salem County, New Jersey": "0600000US3403321240",
    "Far Hills borough, Somerset County, New Jersey": "0600000US3403522890",
    "Montgomery township, Somerset County, New Jersey": "0600000US3403547580",
    "Peapack and Gladstone borough, Somerset County, New Jersey": "0600000US3403557300",
    "Somerville borough, Somerset County, New Jersey": "0600000US3403568460",
    "South Bound Brook borough, Somerset County, New Jersey": "0600000US3403568730",
    "Andover township, Sussex County, New Jersey": "0600000US3403701360",
    "Branchville borough, Sussex County, New Jersey": "0600000US3403707300",
    "Franklin borough, Sussex County, New Jersey": "0600000US3403724930",
    "Green township, Sussex County, New Jersey": "0600000US3403727420",
    "Hamburg borough, Sussex County, New Jersey": "0600000US3403729220",
    "Hardyston township, Sussex County, New Jersey": "0600000US3403729850",
    "Montague township, Sussex County, New Jersey": "0600000US3403747430",
    "Newton town, Sussex County, New Jersey": "0600000US3403751930",
    "Ogdensburg borough, Sussex County, New Jersey": "0600000US3403754660",
    "Sandyston township, Sussex County, New Jersey": "0600000US3403765700",
    "Wantage township, Sussex County, New Jersey": "0600000US3403776790",
    "Clark township, Union County, New Jersey": "0600000US3403913150",
    "Elizabeth city, Union County, New Jersey": "0600000US3403921000",
    "Garwood borough, Union County, New Jersey": "0600000US3403925800",
    "Kenilworth borough, Union County, New Jersey": "0600000US3403936690",
    "Mountainside borough, Union County, New Jersey": "0600000US3403948510",
    "Plainfield city, Union County, New Jersey": "0600000US3403959190",
    "Rahway city, Union County, New Jersey": "0600000US3403961530",
    "Scotch Plains township, Union County, New Jersey": "0600000US3403966060",
    "Summit city, Union County, New Jersey": "0600000US3403971430",
    "Union township, Union County, New Jersey": "0600000US3403974480",
    "Westfield town, Union County, New Jersey": "0600000US3403979040",
}


def source_name(values: object) -> str:
    if not isinstance(values, list) or not values:
        return ""
    return str(values[0])


def canonical_geoid(raw_geoid: object, values: object) -> str:
    name = source_name(values)
    if name in KNOWN_GEOID_REPAIRS:
        return KNOWN_GEOID_REPAIRS[name]
    geoid = str(raw_geoid)
    if geoid.startswith("060000US34"):
        return "0600000US34" + geoid[len("060000US34"):]
    return geoid


loaded: list[tuple[Path, dict]] = []
malformed: list[dict[str, str]] = []
rows = 0

# First pass diagnoses the complete repaired candidate set. Do not partially
# rewrite the snapshot if any unexpected malformed identifier remains.
for path in sorted(SNAPSHOT.glob("part-*.json")):
    root = json.loads(path.read_text(encoding="utf-8"))
    if root.get("release") != RELEASE:
        raise RuntimeError(f"Unexpected CHAS release in {path}")
    loaded.append((path, root))
    for raw_geoid, values in (root.get("records") or {}).items():
        rows += 1
        geoid = canonical_geoid(raw_geoid, values)
        if not GEOID_RE.fullmatch(geoid):
            malformed.append({
                "file": str(path.relative_to(ROOT)),
                "geoid": str(raw_geoid),
                "source_name": source_name(values),
                "repair_candidate": geoid,
            })

if rows != 564:
    raise RuntimeError(f"HUD CHAS snapshot must contain 564 rows, got {rows}")
if malformed:
    print(json.dumps({"rows": rows, "malformed": malformed}, indent=2))
    raise RuntimeError(f"HUD CHAS snapshot has {len(malformed)} malformed GEOID(s); see diagnostic above")

changed_files: list[str] = []
seen: set[str] = set()

for path, root in loaded:
    repaired: dict[str, list] = {}
    changed = False
    for raw_geoid, values in (root.get("records") or {}).items():
        geoid = canonical_geoid(raw_geoid, values)
        if geoid != str(raw_geoid):
            changed = True
        if geoid in seen or geoid in repaired:
            raise RuntimeError(f"Duplicate HUD CHAS GEOID after repair: {geoid}")
        seen.add(geoid)
        row = list(values)
        if geoid == JAMESBURG_GEOID:
            if row[0] not in {JAMESBURG_NAME, "Jamesbury borough, Middlesex County, New Jersey"}:
                raise RuntimeError(f"Unexpected Jamesburg source label: {row[0]}")
            if row[0] != JAMESBURG_NAME:
                row[0] = JAMESBURG_NAME
                changed = True
        repaired[geoid] = row
    if changed:
        root["records"] = repaired
        path.write_text(json.dumps(root, separators=(",", ":")) + "\n", encoding="utf-8")
        changed_files.append(str(path.relative_to(ROOT)))

if len(seen) != 564:
    raise RuntimeError(f"HUD CHAS snapshot must contain 564 unique GEOIDs, got {len(seen)}")

print(json.dumps({"rows": rows, "unique_geoids": len(seen), "changed_files": changed_files}, indent=2))
