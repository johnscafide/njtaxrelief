#!/usr/bin/env python3
"""Normalize the pinned HUD CHAS NJ snapshot without changing metric values.

This is intentionally narrow. The originally staged chunks contained a transport
transcription defect in several GEOID prefixes (060000US -> 0600000US) and one
source-name typo for the Jamesburg borough row. The source CSV control row is
0600000US3402334890 / Jamesburg borough, Middlesex County, New Jersey.

No percentages, numerators, denominators, or geography assignments are altered.
Unexpected malformed rows fail closed instead of being guessed.
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

changed_files: list[str] = []
seen: set[str] = set()
rows = 0

for path in sorted(SNAPSHOT.glob("part-*.json")):
    root = json.loads(path.read_text(encoding="utf-8"))
    if root.get("release") != RELEASE:
        raise RuntimeError(f"Unexpected CHAS release in {path}")
    records = root.get("records") or {}
    repaired: dict[str, list] = {}
    changed = False
    for raw_geoid, values in records.items():
        rows += 1
        geoid = str(raw_geoid)
        if geoid.startswith("060000US34"):
            geoid = "0600000US34" + geoid[len("060000US34"):]
            changed = True
        if not GEOID_RE.fullmatch(geoid):
            raise RuntimeError(f"Unexpected malformed HUD CHAS GEOID: {raw_geoid}")
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

if rows != 564:
    raise RuntimeError(f"HUD CHAS snapshot must contain 564 rows, got {rows}")
if len(seen) != 564:
    raise RuntimeError(f"HUD CHAS snapshot must contain 564 unique GEOIDs, got {len(seen)}")

print(json.dumps({"rows": rows, "unique_geoids": len(seen), "changed_files": changed_files}, indent=2))
