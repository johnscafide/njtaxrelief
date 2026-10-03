"""Build co/towns.json, the town list behind the /co lookup page.

The page needs three things it can search before it asks the server for a town's rules:
  towns    every NJ municipality (code, name, county), from Municipal_Boundaries_of_NJ.json
  zips     ZIP code -> municipalities, from the 2020 Census ZCTA to county subdivision
           relationship file (in NJ, county subdivisions are the municipalities)
  aliases  common mailing-address town names that are not a municipality, such as
           Sewell or Marlton, mapped to the municipality (or municipalities) they cover

Which towns have published CO rules is not stored here. /api/co-lookup reads that live from
property/data/municipal-requirements/, so new towns show up without rebuilding this file.

Usage: python3 scripts/build_co_lookup_towns.py [--zcta-file tab20_zcta520_cousub20_natl.txt]
"""
import argparse
import csv
import io
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZCTA_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_cousub20_natl.txt"
# A ZIP lists a town only when at least this share of the ZIP's land is in that town, so a sliver
# along a border doesn't show up as a choice.
MIN_ZIP_SHARE = 0.05

# Mailing names the Post Office uses that aren't the town that sets the rules.
ALIASES = {
    "Atco": [("Waterford Township", "CAMDEN")],
    "Avenel": [("Woodbridge Township", "MIDDLESEX")],
    "Bayville": [("Berkeley Township", "OCEAN")],
    "Blackwood": [("Gloucester Township", "CAMDEN"), ("Washington Township", "GLOUCESTER")],
    "Browns Mills": [("Pemberton Township", "BURLINGTON")],
    "Cape May Court House": [("Middle Township", "CAPE MAY")],
    "Cedar Brook": [("Winslow Township", "CAMDEN")],
    "Clarksboro": [("East Greenwich Township", "GLOUCESTER")],
    "Colonia": [("Woodbridge Township", "MIDDLESEX")],
    "Columbus": [("Mansfield Township", "BURLINGTON")],
    "Dayton": [("South Brunswick Township", "MIDDLESEX")],
    "Erial": [("Gloucester Township", "CAMDEN")],
    "Fords": [("Woodbridge Township", "MIDDLESEX")],
    "Forked River": [("Lacey Township", "OCEAN")],
    "Franklinville": [("Franklin Township", "GLOUCESTER")],
    "Gibbstown": [("Greenwich Township", "GLOUCESTER")],
    "Glendora": [("Gloucester Township", "CAMDEN")],
    "Hamilton Square": [("Hamilton Township", "MERCER")],
    "Iselin": [("Woodbridge Township", "MIDDLESEX")],
    "Kendall Park": [("South Brunswick Township", "MIDDLESEX")],
    "Lanoka Harbor": [("Lacey Township", "OCEAN")],
    "Lawrenceville": [("Lawrence Township", "MERCER")],
    "Malaga": [("Franklin Township", "GLOUCESTER")],
    "Manahawkin": [("Stafford Township", "OCEAN")],
    "Marlton": [("Evesham Township", "BURLINGTON")],
    "Marmora": [("Upper Township", "CAPE MAY")],
    "Mays Landing": [("Hamilton Township", "ATLANTIC")],
    "Mercerville": [("Hamilton Township", "MERCER")],
    "Mickleton": [("East Greenwich Township", "GLOUCESTER")],
    "Monmouth Junction": [("South Brunswick Township", "MIDDLESEX")],
    "Mount Royal": [("East Greenwich Township", "GLOUCESTER")],
    "Mullica Hill": [("Harrison Township", "GLOUCESTER"), ("South Harrison Township", "GLOUCESTER")],
    "Ocean View": [("Dennis Township", "CAPE MAY")],
    "Parlin": [("Sayreville Borough", "MIDDLESEX"), ("Old Bridge Township", "MIDDLESEX")],
    "Pedricktown": [("Oldmans Township", "SALEM")],
    "Port Reading": [("Woodbridge Township", "MIDDLESEX")],
    "Princeton Junction": [("West Windsor Township", "MERCER")],
    "Rio Grande": [("Middle Township", "CAPE MAY"), ("Lower Township", "CAPE MAY")],
    "Roebling": [("Florence Township", "BURLINGTON")],
    "Sewaren": [("Woodbridge Township", "MIDDLESEX")],
    "Sewell": [("Washington Township", "GLOUCESTER"), ("Mantua Township", "GLOUCESTER"), ("Deptford Township", "GLOUCESTER")],
    "Sicklerville": [("Winslow Township", "CAMDEN"), ("Gloucester Township", "CAMDEN")],
    "Somerset": [("Franklin Township", "SOMERSET")],
    "Thorofare": [("West Deptford Township", "GLOUCESTER")],
    "Tuckerton": [("Tuckerton Borough", "OCEAN"), ("Little Egg Harbor Township", "OCEAN")],
    "Turnersville": [("Washington Township", "GLOUCESTER"), ("Gloucester Township", "CAMDEN")],
    "Villas": [("Lower Township", "CAPE MAY")],
    "Vincentown": [("Southampton Township", "BURLINGTON")],
    "Westmont": [("Haddon Township", "CAMDEN")],
    "Williamstown": [("Monroe Township", "GLOUCESTER")],
    "Yardville": [("Hamilton Township", "MERCER")],
}


def title_county(c: str) -> str:
    return " ".join(w.capitalize() for w in c.split())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zcta-file", help="local copy of the Census relationship file (downloaded if left out)")
    args = ap.parse_args()

    feats = json.loads((ROOT / "Municipal_Boundaries_of_NJ.json").read_text())["features"]
    props = sorted((f["properties"] for f in feats), key=lambda p: p["MUN_CODE"])
    by_census = {p["CENSUS2020"]: p["MUN_CODE"] for p in props}
    by_label = {(p["MUN_LABEL"], p["COUNTY"]): p["MUN_CODE"] for p in props}
    towns = [{"c": p["MUN_CODE"], "n": p["MUN_LABEL"], "k": title_county(p["COUNTY"])} for p in props]
    assert len(towns) == 564, len(towns)

    if args.zcta_file:
        text = Path(args.zcta_file).read_text(encoding="utf-8-sig")
    else:
        with urllib.request.urlopen(ZCTA_URL, timeout=120) as r:
            text = r.read().decode("utf-8-sig")
    parts: dict[str, list[tuple[int, int, str]]] = {}
    for row in csv.DictReader(io.StringIO(text), delimiter="|"):
        geoid, zcta = row["GEOID_COUSUB_20"], row["GEOID_ZCTA5_20"]
        if not zcta or geoid not in by_census:
            continue  # other states, water-only areas, or a town merged away since 2020
        parts.setdefault(zcta, []).append((int(row["AREALAND_PART"]), int(row["AREALAND_ZCTA5_20"]), by_census[geoid]))
    zips = {}
    for zcta, rows in sorted(parts.items()):
        keep = [code for land, total, code in sorted(rows, reverse=True) if total and land / total >= MIN_ZIP_SHARE]
        if keep:
            zips[zcta] = keep

    aliases = {}
    for name, picks in sorted(ALIASES.items()):
        codes = []
        for label, county in picks:
            assert (label, county) in by_label, f"alias {name}: no municipality {label}, {county}"
            codes.append(by_label[(label, county)])
        aliases[name] = codes

    out = {"source": "Municipal_Boundaries_of_NJ.json; 2020 Census ZCTA to county subdivision relationship file; "
                     "aliases listed in scripts/build_co_lookup_towns.py",
           "towns": towns, "zips": zips, "aliases": aliases}
    (ROOT / "co" / "towns.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"co/towns.json: {len(towns)} towns, {len(zips)} ZIPs, {len(aliases)} mailing names")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
