#!/usr/bin/env python3
"""Re-key NJ municipal datasets from the state county/municipal code to the MOD-IV
(PAMS PIN) district code.

Why: Watchdog looks municipal context up by the first four characters of a PAMS
PIN. Several datasets were built from Division of Taxation Abstract / NJ DCA
spreadsheets, which use the older county/municipal code. The two numberings differ
for 99 municipalities (towns whose names changed after codes were assigned), so a
property in, for example, Matawan (PIN 1331) was shown Middletown's budget, which
the state code list numbers 1331 but the PIN list numbers 1332.

Modes:
  move    the row's data and name belong together; move the row to the district
          whose state code is its current key (and fix any embedded code fields).
  rename  the row's data is already PIN-keyed (built from parcels); only the
          municipality name/county label is corrected.

The script is idempotent: each file records "district_key": "modiv_pams" once
re-keyed and is skipped on later runs. Every moved row with a name is checked
against the crosswalk name, and the run fails if the names do not line up.

Usage: python3 property/scripts/rekey_municipal_datasets.py [--check]
"""
from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CROSSWALK = ROOT / "property/data/nj-district-crosswalk.json"
MARK = "modiv_pams"

# (path glob, container key, mode, name locator, embedded code fields)
DATASETS = [
    ("property/data/budget-pressure.json", "municipalities", "move", "name", ["district"]),
    ("property/abatements.json", "districts", "move", "name", []),
    ("property/data/affordable-housing.json", "districts", "move", "name", ["district"]),
    ("property/data/affordable-housing-v037.json", "municipalities", "move", "municipality", ["district"]),
    ("property/data/exempt-pilot.json", "municipalities", "move", "name", ["code"]),
    ("property/data/federal-housing-context-v041.json", "municipalities", "move", "name", ["district"]),
    ("property/data/neighborhood-trends.json", "municipalities", "move", "name", ["district"]),
    ("property/data/dca-development-trends-v038.json", "municipalities", "move", 1, []),
    ("property/data/cod/historical-cod-2016-2017.json", "districts", "move", "name", []),
    ("property/data/cod/historical-cod-2018-2021.json", "districts", "move", "name", []),
    ("property/data/ufb-v039/[0-9][0-9].json", "municipalities", "move", 0, []),
    ("property/data/ufb-v040/[0-9][0-9].json", "municipalities", "move", 0, []),
    ("property/data/statewide-intelligence.json", "municipalities", "rename", "name", []),
]

LEGAL = {"township": "", "twp": "", "borough": "", "boro": "", "city": "", "town": "",
         "village": "", "of": "", "the": ""}


# Former names and source typos that still identify the same municipality.
ALIASES = {
    "swedesborough": "swedesboro", "newbrunsick": "newbrunswick", "southbelmar": "lakecomo",
    "dover": "tomsriver", "westpaterson": "woodlandpark", "peapackgladstone": "peapackandgladstone",
}
FORMER = {("1112", "washington"): "robbinsville"}


def norm(name: object, code: str = "") -> str:
    words = re.sub(r"[^a-z ]", " ", str(name or "").lower().replace("-", " ")).split()
    key = "".join(w for w in words if LEGAL.get(w, w))
    key = ALIASES.get(key, key)
    return FORMER.get((code, key), key)


def get_name(row, locator):
    if isinstance(locator, int):
        return row[locator] if isinstance(row, list) and len(row) > locator else None
    return row.get(locator) if isinstance(row, dict) else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only; write nothing")
    args = ap.parse_args()

    crosswalk = json.loads(CROSSWALK.read_text())["districts"]
    by_state = {row["dca_code"]: code for code, row in crosswalk.items()}
    if len(by_state) != len(crosswalk):
        raise SystemExit("Crosswalk state codes are not unique")

    failures: list[str] = []
    for pattern, container, mode, locator, code_fields in DATASETS:
        for path in sorted(glob.glob(str(ROOT / pattern))):
            rel = Path(path).relative_to(ROOT)
            data = json.loads(Path(path).read_text())
            if data.get("district_key") == MARK:
                print(f"skip  {rel} (already {MARK})")
                continue
            rows = data[container]
            if mode == "move" and all(
                norm(get_name(row, locator), code) == norm(crosswalk.get(code, {}).get("name"))
                for code, row in rows.items() if get_name(row, locator)
            ):
                # Names already agree with the PIN key (for example a rebuilt file from a
                # patched builder). Moving again would shift it the wrong way.
                print(f"ok    {rel} (already keyed by PIN district code)")
                data["district_key"] = MARK
                if not args.check:
                    Path(path).write_text(_dump(path, data))
                continue
            if mode == "move":
                moved = {}
                for state_code, row in rows.items():
                    code = by_state.get(state_code)
                    if code is None:
                        failures.append(f"{rel}: state code {state_code} not in crosswalk")
                        continue
                    for field in code_fields:
                        if isinstance(row, dict) and field in row:
                            row[field] = code
                    moved[code] = row
                mismatched = [
                    f"{code} {get_name(row, locator)!r} vs {crosswalk[code]['name']!r}"
                    for code, row in moved.items()
                    if get_name(row, locator) and norm(get_name(row, locator), code) != norm(crosswalk[code]["name"])
                ]
                # Any name that still disagrees after the move means this file was not
                # keyed by the state code after all, so stop instead of guessing.
                if mismatched:
                    failures.append(f"{rel}: {len(mismatched)} names disagree after moving, e.g. {mismatched[:4]}")
                    continue
                data[container] = {code: moved[code] for code in sorted(moved)}
                changed = sum(1 for s in rows if by_state.get(s) != s)
                print(f"move  {rel}: {len(moved)} rows, {changed} re-keyed, {len(mismatched)} spelling variants")
            else:
                renamed = 0
                for code, row in rows.items():
                    want = crosswalk.get(code)
                    if not want:
                        failures.append(f"{rel}: {code} not in crosswalk")
                        continue
                    if norm(row.get(locator)) != norm(want["name"]):
                        row[locator] = want["name"]
                        renamed += 1
                    if "county" in row and str(row["county"]).lower() != want["county"].lower():
                        row["county"] = want["county"]
                print(f"name  {rel}: {renamed} names corrected, data untouched")
            data["district_key"] = MARK
            if not args.check:
                Path(path).write_text(_dump(path, data))

    if failures:
        raise SystemExit("Re-key failed:\n  " + "\n  ".join(failures))
    return 0


def _dump(path: str, data) -> str:
    """Serialize in the file's existing style (indent width, separators, key order)."""
    text = Path(path).read_text()
    lines = text.split("\n", 2)
    if len(lines) > 1 and lines[1].strip():
        indent = len(lines[1]) - len(lines[1].lstrip(" "))
        return json.dumps(data, indent=indent or 1, ensure_ascii=False) + "\n"
    compact = '":' in text[:400] and '": ' not in text[:400]
    separators = (",", ":") if compact else None
    return json.dumps(data, separators=separators, ensure_ascii=False) + ("\n" if text.endswith("\n") else "")


if __name__ == "__main__":
    raise SystemExit(main())
