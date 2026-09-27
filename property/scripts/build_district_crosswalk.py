#!/usr/bin/env python3
"""Build the NJ district-code crosswalk: Treasury (PAMS PIN) code <-> DCA MuniCode.

Watchdog keys every municipality by the four-digit Treasury taxing-district code,
which is the first four characters of a PAMS PIN. NJ DCA spreadsheets (UFB, tax
summaries, PILOT, development trends) use DCA's MuniCode, which follows an older
ordering and differs from the Treasury code for renamed towns (for example DCA
1330 Aberdeen Township is Treasury 1301, and Treasury 1330 is Marlboro Township).

Inputs (both already in the repository):
  - property/data/cod/cod-history.json   Treasury codes (official Division of
                                          Taxation COD table) with short names.
  - property/data/budget-pressure.json    DCA MuniCodes with full DCA names, as
                                          originally built (pass --dca to point at
                                          a DCA-keyed name source).
Output:
  - property/data/nj-district-crosswalk.json

The match is by municipality name within the county and must be one-to-one for
all 564 districts, otherwise the script fails. A few Treasury names are printed
truncated in the COD table; they are resolved by the explicit OVERRIDES below.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COD = ROOT / "property/data/cod/cod-history.json"
OUT = ROOT / "property/data/nj-district-crosswalk.json"

COUNTY = {
    "01": "Atlantic", "02": "Bergen", "03": "Burlington", "04": "Camden", "05": "Cape May",
    "06": "Cumberland", "07": "Essex", "08": "Gloucester", "09": "Hudson", "10": "Hunterdon",
    "11": "Mercer", "12": "Middlesex", "13": "Monmouth", "14": "Morris", "15": "Ocean",
    "16": "Passaic", "17": "Salem", "18": "Somerset", "19": "Sussex", "20": "Union", "21": "Warren",
}

# Treasury code -> full DCA-style name, for rows the COD table prints truncated or
# abbreviated so a plain name match is ambiguous.
OVERRIDES = {
    "0102": "Atlantic City City",
    "0305": "Burlington City",
    "0306": "Burlington Township",
    "0414": "Gloucester City City",
    "0508": "Ocean City City",
    "0703": "Caldwell Borough",
    "0719": "South Orange Village Township",
    "0906": "Jersey City City",
    "0910": "Union City City",
    "1429": "Parsippany-Troy Hills Township",
    "1526": "Point Pleasant Beach Borough",
    "1705": "Lower Alloways Creek Township",
    "1815": "Peapack and Gladstone Borough",
}

TYPES = {"boro": "borough", "borough": "borough", "twp": "township", "township": "township",
         "city": "city", "town": "town", "village": "village"}


def words(name: str) -> list[str]:
    name = name.lower().replace("-", " ").replace(".", " ").replace("'", "")
    return [w for w in name.split() if w]


def keys(name: str) -> set[str]:
    """Comparable forms of a name: full, and with one trailing type word removed."""
    w = [TYPES.get(x, x) for x in words(name)]
    out = {"".join(w)}
    if w and w[-1] in TYPES.values():
        out.add("".join(w[:-1]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dca", default="property/data/budget-pressure.json",
                    help="DCA-keyed JSON with municipalities.{code}.name")
    args = ap.parse_args()

    treasury = {r["code"]: r["municipality"] for r in json.loads(COD.read_text())["municipalities"]}
    dca_src = json.loads((ROOT / args.dca).read_text())
    if dca_src.get("district_key") == "modiv_pams":
        raise SystemExit(f"{args.dca} is already keyed by PIN district code; point --dca at a file still keyed by the state code. "
                         "The committed property/data/nj-district-crosswalk.json is the source of truth.")
    dca_rows = dca_src.get("municipalities") or dca_src.get("districts")
    dca = {code: row["name"] for code, row in dca_rows.items()}
    if len(treasury) != 564 or len(dca) != 564:
        raise SystemExit(f"Expected 564 districts on both sides, found treasury={len(treasury)} dca={len(dca)}")

    mapping: dict[str, str] = {}
    problems: list[str] = []
    for code, short in sorted(treasury.items()):
        county = code[:2]
        candidates = {c: n for c, n in dca.items() if c[:2] == county}
        wanted = OVERRIDES.get(code)
        if wanted:
            hits = [c for c, n in candidates.items() if n == wanted]
        else:
            short_keys = keys(short)
            hits = [c for c, n in candidates.items() if keys(n) & short_keys]
            if not hits:
                # The COD parser strips a leading county name, so "Burlington City"
                # arrives as "City" and "Cape May Point" as "Point".
                short_keys = keys(COUNTY[county] + " " + short)
                hits = [c for c, n in candidates.items() if keys(n) & short_keys]
            if len(hits) > 1:  # prefer an exact full-name match
                exact = [c for c in hits if "".join(TYPES.get(x, x) for x in words(candidates[c])) in short_keys
                         and "".join(TYPES.get(x, x) for x in words(short)) in keys(candidates[c])]
                hits = exact or hits
        if len(hits) != 1:
            problems.append(f"{code} {short!r}: {[candidates[c] for c in hits] or 'no match'}")
        else:
            mapping[code] = hits[0]

    targets = list(mapping.values())
    dupes = sorted({t for t in targets if targets.count(t) > 1})
    if dupes:
        problems += [f"DCA {d} ({dca[d]}) matched by {[c for c, t in mapping.items() if t == d]}" for d in dupes]
    if problems:
        raise SystemExit("District crosswalk is not one-to-one:\n  " + "\n  ".join(problems))

    rows = {
        code: {"name": dca[mapping[code]], "county": COUNTY[code[:2]], "dca_code": mapping[code]}
        for code in sorted(mapping)
    }
    payload = {
        "_readme": [
            "Canonical NJ municipality key crosswalk.",
            "Keys are Treasury taxing-district codes, the first four characters of a PAMS PIN.",
            "dca_code is the NJ DCA MuniCode for the same municipality. They differ for renamed towns.",
            "Every Watchdog municipal dataset must be keyed by the Treasury code.",
        ],
        "source": {
            "treasury": "NJ Division of Taxation, Coefficients of Deviation table (property/data/cod/cod-history.json)",
            "dca": "NJ DCA municipal tax summary MuniCode (property/data/budget-pressure.json as built from DCA files)",
        },
        "district_count": len(rows),
        "differing_codes": sum(1 for c, r in rows.items() if c != r["dca_code"]),
        "districts": rows,
    }
    OUT.write_text(json.dumps(payload, indent=1, sort_keys=False) + "\n")
    print(f"Wrote {len(rows)} districts, {payload['differing_codes']} with a different DCA code -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
