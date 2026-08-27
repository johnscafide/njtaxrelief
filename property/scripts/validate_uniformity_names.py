#!/usr/bin/env python3
"""Fail closed when NJ assessment-uniformity materialization looks corrupted."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "uniformity.json"
MIN_DISTRICTS = 500
MAX_DISTRICTS = 564
DISTRICT_CODE = re.compile(r"^\d{4}$")
BAD_PREFIX = re.compile(r"^(?:Boro|Twp|Creek Twp)\s+", re.I)


def fail(message: str, rows: list[str] | None = None) -> None:
    details = "" if not rows else "\n" + "\n".join(f"  {row}" for row in rows[:50])
    raise SystemExit(message + details)


def numeric_in_range(value: object, low: float, high: float) -> bool:
    return value is None or (isinstance(value, (int, float)) and low <= float(value) <= high)


def main() -> int:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    districts = payload.get("districts")
    if not isinstance(districts, dict):
        fail("Uniformity contract invalid: districts must be an object")

    district_count = len(districts)
    if not MIN_DISTRICTS <= district_count <= MAX_DISTRICTS:
        fail(
            "Uniformity district-count drift: "
            f"expected {MIN_DISTRICTS}..{MAX_DISTRICTS}, found {district_count}"
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

        # Missing evidence is valid and remains null. Only present numeric values
        # are range-checked so the guard never turns missingness into a fake zero.
        if not numeric_in_range(score, 0, 100):
            bad_values.append(f"{code}: score={score!r} outside 0..100")
        if not numeric_in_range(coefficient, 0, 100):
            bad_values.append(f"{code}: coefficient={coefficient!r} outside 0..100")
        if not numeric_in_range(latest, 0, 100):
            bad_values.append(f"{code}: latest={latest!r} outside 0..100")
        if sales is not None and (not isinstance(sales, int) or sales < 0):
            bad_values.append(f"{code}: sales={sales!r} is not a non-negative integer")

    if bad_names:
        fail("Uniformity parser/name bleed detected:", bad_names)
    if bad_values:
        fail("Uniformity range/schema validation failed:", bad_values)

    print(
        f"Validated {district_count:,} NJ uniformity districts: coverage, names, codes, present score/COD ranges, and sales counts"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
