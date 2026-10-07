#!/usr/bin/env python3
"""Build property/data/acs-rental-2024.json from the Census ACS 2024 5-year summary file.

Source tables (keyless bulk files, all US geographies, pipe-delimited):
  https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25003.dat
  https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25004.dat
  https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25070.dat

Per municipality (Treasury district code; ACS county subdivision via the chas_geoid already
mapped in federal-housing-context-v041.json):
  renter_households       B25003_E003
  rental_vacancy_rate     B25004_E002 / (B25003_E003 + B25004_E003 + B25004_E002) * 100
                          (Census rental vacancy rate: vacant for rent over renter inventory)
  rent_burden_share       (B25070_E007..E010) / (B25070_E001 - B25070_E011) * 100
                          (renter households paying 30% or more of income on gross rent)

Usage: python3 property/scripts/build_acs_rental_2024.py DIR_WITH_DAT_FILES [--check]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "property/data/acs-rental-2024.json"
FEDERAL = ROOT / "property/data/federal-housing-context-v041.json"
BASE = "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/"
TABLES = ("b25003", "b25004", "b25070")


def read_table(path: Path, geoids: set[str]) -> dict[str, dict[str, float | None]]:
    out = {}
    with path.open() as fh:
        header = fh.readline().rstrip("\n").split("|")
        for line in fh:
            if not line.startswith("0600000US34"):
                continue
            cells = line.rstrip("\n").split("|")
            if cells[0] not in geoids:
                continue
            row = {}
            for k, v in zip(header[1:], cells[1:]):
                try:
                    row[k] = float(v)
                except ValueError:
                    row[k] = None
            out[cells[0]] = row
    return out


def pct(num, den):
    if num is None or den is None or den <= 0:
        return None
    return round(100 * num / den, 2)


def build(src: Path) -> dict:
    federal = json.loads(FEDERAL.read_text())
    if federal.get("district_key") != "modiv_pams":
        raise SystemExit("federal-housing-context-v041.json is not keyed by PAMS district")
    towns = federal["municipalities"]
    geo = {d: t["chas_geoid"] for d, t in towns.items() if t.get("chas_geoid")}
    if len(geo) != 564:
        raise SystemExit(f"expected 564 mapped towns, got {len(geo)}")
    ids = set(geo.values())
    t3, t4, t70 = (read_table(src / f"acsdt5y2024-{t}.dat", ids) for t in TABLES)

    out = {}
    for d in sorted(geo):
        g = geo[d]
        a, b, c = t3.get(g, {}), t4.get(g, {}), t70.get(g, {})
        renters, for_rent, rented_unocc = a.get("B25003_E003"), b.get("B25004_E002"), b.get("B25004_E003")
        inventory = None if None in (renters, for_rent, rented_unocc) else renters + for_rent + rented_unocc
        burdened = [c.get(f"B25070_E{n:03d}") for n in range(7, 11)]
        computed = None if c.get("B25070_E001") is None or c.get("B25070_E011") is None else c["B25070_E001"] - c["B25070_E011"]
        out[d] = {
            "name": towns[d]["name"],
            "geoid": g,
            "renter_households": None if renters is None else int(renters),
            "rental_vacancy_rate": pct(for_rent, inventory),
            "rent_burden_share": None if None in burdened else pct(sum(burdened), computed),
        }
    return {
        "schema_version": 1,
        "district_key": "modiv_pams",
        "vintage": "2024 ACS 5-year",
        "source": {"agency": "U.S. Census Bureau", "label": "American Community Survey 2020-2024 5-year summary file",
                   "tables": {t.upper(): BASE + f"acsdt5y2024-{t}.dat" for t in TABLES}},
        "municipalities": out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    text = json.dumps(build(args.src), indent=1) + "\n"
    if args.check:
        if (OUT.read_text() if OUT.exists() else "") != text:
            print(f"{OUT.relative_to(ROOT)} is out of date", file=sys.stderr)
            return 1
        return 0
    OUT.write_text(text)
    data = json.loads(text)["municipalities"]
    print(f"wrote {OUT.relative_to(ROOT)}: {len(data)} towns, "
          f"{sum(v['rental_vacancy_rate'] is not None for v in data.values())} vacancy, "
          f"{sum(v['rent_burden_share'] is not None for v in data.values())} burden")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
