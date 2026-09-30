#!/usr/bin/env python3
"""Build the list the public Town Needs page shows: every red-flag town and what is still missing.

A red-flag town is one the checked-requirements generator flags (town certificate not confirmed,
"probably not required" without a clear written statement, or no published fee at all).

Inputs (property/data/municipal-requirements/):
  checked/<code>.json + approvals.json   towns live for agents; needs come from the live data
  unpublished-needs.json                 red-flag towns researched but not published yet (only
                                         town, county and the missing items, never the research)

Output: town-needs.json, served at /property/data/municipal-requirements/town-needs.json and read
by the /town-needs page and the submission API (which only accepts these towns and items).

  python3 property/scripts/build_town_needs.py                        write town-needs.json
  python3 property/scripts/build_town_needs.py --from-research DIR    also rebuild unpublished-needs.json
                                                                      from research files in DIR
  python3 property/scripts/build_town_needs.py --check                fail if town-needs.json is stale
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_checked_municipal_requirements as checked  # noqa: E402

DATA = checked.DATA
OUT = DATA / "town-needs.json"
UNPUBLISHED = DATA / "unpublished-needs.json"
NEEDS = {
    "co_required": {"label": "Is a resale CO required?",
                    "hint": "Does the town require a certificate or inspection before a one- or two-family home is sold? A town page, letter, form or ordinance that says yes or no."},
    "co_fee": {"label": "Town certificate (CO) fee",
               "hint": "The fee schedule or application that lists the resale inspection or certificate fee."},
    "co_contact": {"label": "Who to call at the town",
                   "hint": "The office, phone number or email that handles resale certificates, from the town's site or a town form."},
    "fire_fee": {"label": "Fire certificate fee",
                 "hint": "The smoke / CO alarm certificate fee, from the fire official's form or fee sheet."},
    "fire_contact": {"label": "Who to call for the fire certificate",
                     "hint": "The fire official or bureau that issues the smoke / CO alarm certificate, with a phone number or email."},
}


def has_contact(o: dict) -> bool:
    return bool(checked.clean(o.get("phone")) or checked.clean(o.get("email")))


def needs_of(r: dict, officials: dict) -> list[str]:
    co, fire = r.get("resale_co") or {}, r.get("fire_cert") or {}
    auths = fire.get("authorities") or []
    status, unsure = co.get("status"), checked.inferred_not_required(co)
    out = []
    if status == "not_found" or unsure:
        out.append("co_required")
    if status == "required" and not co.get("fees"):
        out.append("co_fee")
    if (status != "not_required" or unsure) and not has_contact(co):
        out.append("co_contact")
    if not any(a.get("fees") for a in auths):
        out.append("fire_fee")
    directory = (officials.get(r.get("municipality_code")) or {}).get("agencies") or []
    if not any(has_contact(a) for a in auths) and not any(o.get("phone") or o.get("email") for o in directory):
        out.append("fire_contact")
    return out


def town(code: str, name: str, county: str, live: bool, needs: list[str]) -> dict:
    return {"code": code, "town": checked.clean(name, 120), "county": checked.clean(county, 40).title(), "live": live, "needs": needs}


def live_towns(officials: dict) -> dict[str, dict]:
    approvals = json.loads((DATA / "approvals.json").read_text())["towns"]
    out = {}
    for p in sorted((DATA / "checked").glob("*.json")):
        r = json.loads(p.read_text())
        code = r["municipality_code"]
        if (approvals.get(code) or {}).get("status") != "approved" or not checked.flag_reasons(r):
            continue
        needs = needs_of(r, officials)
        if needs:
            out[code] = town(code, r.get("municipality"), r.get("county"), True, needs)
    return out


def from_research(folder: pathlib.Path, live_codes: set[str], officials: dict) -> dict:
    towns = []
    for p in sorted(folder.glob("*.json")):
        r = json.loads(p.read_text())
        code = r.get("municipality_code", "")
        if code in live_codes or not checked.flag_reasons(r):
            continue
        needs = needs_of(r, officials)
        if needs:
            towns.append(town(code, r.get("municipality"), r.get("county"), False, needs))
    return {"note": "Red-flag towns researched but not yet published. Only the missing items are kept here.", "towns": towns}


def build() -> dict:
    officials = checked.directory_officials()
    towns = live_towns(officials)
    approved = {c for c, v in json.loads((DATA / "approvals.json").read_text())["towns"].items() if v.get("status") == "approved"}
    for t in json.loads(UNPUBLISHED.read_text())["towns"] if UNPUBLISHED.exists() else []:
        if t["code"] not in approved and t["code"] not in towns:
            towns[t["code"]] = town(t["code"], t["town"], t["county"], False, [k for k in t["needs"] if k in NEEDS])
    ordered = sorted(towns.values(), key=lambda t: (t["county"], t["town"]))
    return {"generated_by": "property/scripts/build_town_needs.py", "needs": NEEDS, "towns": [t for t in ordered if t["needs"]]}


def dump(obj: dict) -> str:
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-research", type=pathlib.Path)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.from_research:
        officials = checked.directory_officials()
        live = {c for c, v in json.loads((DATA / "approvals.json").read_text())["towns"].items() if v.get("status") == "approved"}
        UNPUBLISHED.write_text(dump(from_research(args.from_research, live, officials)))
    data = build()
    for t in data["towns"]:
        assert len(t["code"]) == 4 and t["code"].isdigit() and t["needs"] and set(t["needs"]) <= set(NEEDS), t
    if args.check:
        if not OUT.exists() or OUT.read_text() != dump(data):
            print("town-needs.json is stale: run python3 property/scripts/build_town_needs.py")
            return 1
        print(f"town-needs.json is current ({len(data['towns'])} towns)")
        return 0
    OUT.write_text(dump(data))
    live = sum(t["live"] for t in data["towns"])
    print(json.dumps({"towns": len(data["towns"]), "live": live, "not_published": len(data["towns"]) - live}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
