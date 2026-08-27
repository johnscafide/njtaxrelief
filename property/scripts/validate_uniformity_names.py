#!/usr/bin/env python3
"""Fail closed when NJ assessment-uniformity materialization looks corrupted."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "uniformity.json"
EXPECTED_DISTRICTS = 564
DISTRICT_CODE = re.compile(r"^\d{4}$")
BAD_PREFIX = re.compile(r"^(?:Boro|Twp|Creek Twp)\s+", re.I)


def fail(message: str, rows: list[str] | None = None) -> None:
    details = "" if not rows else "\n" + "\n".join(f"  {row}" for row in rows[:50])
    raise SystemExit(message + details)


def main() -> int:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    districts = payload.get("districts")
    if not isinstance(districts, dict):
        fail("Uniformity contract invalid: districts must be an object")

    if len(districts) != EXPECTED_DISTRICTS:
        fail(
            f"Uniformity district-count drift: expected {EXPECTED_DISTRICTS}, found {len(districts)}"
        )

    bad_codes = [code for code in districts if not DISTRICT_CODE.fullmatch(str(code))]
    if bad_codes:
        fail("Uniformity district-code corruption detected:", bad_codes)

    bad_names: list[str] = []
    bad_values: list[str] = []
    for code, row in districts.items():
        if not isinstance(row, dict):
            bad_values.append(f"{code}: row is not an object")
            continue

        name = str(row.get("name") or "").strip()
        county = str(row.get("county") or "").strip()
        if not name or BAD_PREFIX.search(name) or re.search(r"\bCounty\b", name, re.I):
            bad_names.append(f"{code}: {name!r}")
        if not county:
            bad_values.append(f"{code}: missing county")

        score = row.get("score")
        coefficient = row.get("coefficient")
        latest = row.get("latest")
        sales = row.get("sales")

        if not isinstance(score, (int, float)) or not 0 <= float(score) <= 100:
            bad_values.append(f"{code}: score={score!r} outside 0..100")
        if not isinstance(coefficient, (int, float)) or not 0 <= float(coefficient) <= 100:
            bad_values.append(f"{code}: coefficient={coefficient!r} outside 0..100")
        if latest is not None and (
            not isinstance(latest, (int, float)) or not 0 <= float(latest) <= 100
        ):
            bad_values.append(f"{code}: latest={latest!r} outside 0..100")
        if not isinstance(sales, int) or sales < 0:
            bad_values.append(f"{code}: sales={sales!r} is not a non-negative integer")

    if bad_names:
        fail("Uniformity parser/name bleed detected:", bad_names)
    if bad_values:
        fail("Uniformity range/schema validation failed:", bad_values)

    print(
        f"Validated {len(districts):,} NJ uniformity districts: names, codes, score/COD ranges, and sales counts"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
