#!/usr/bin/env python3
"""Apply or promote the governed v0.40 UFB longitudinal source pack.

Default behavior catalogs new markers as planned. --live is used only after the
production provider, authenticated canary, and provider-coverage promotion pass.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = ROOT / "data" / "marker-registry.json"
PACK = ROOT / "data" / "nj-source-pack-v040.json"


def recalc(reg):
    markers = reg.get("markers", [])
    summary = reg.setdefault("summary", {})
    summary["total"] = len(markers)
    summary["public_source"] = sum(m.get("origin") == "public" for m in markers)
    summary["proprietary_derived"] = sum(bool(m.get("proprietary")) for m in markers)
    summary["by_tier"] = {t: sum(m.get("tier") == t for m in markers) for t in ("standard", "pro", "pro_plus")}
    professions = [p.get("id") for p in reg.get("professions", []) if p.get("id")]
    summary["by_profession"] = {p: sum(p in (m.get("professions") or []) for m in markers) for p in professions}
    target = int(reg.get("target_markers") or 1000)
    summary["percent_of_goal"] = min(100, round(len(markers) / target * 100, 1))
    summary["provider_status"] = dict(sorted(Counter(str(m.get("provider_status") or "planned") for m in markers).items()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="Promote only v0.40 markers to the certified live static mirror")
    args = ap.parse_args()

    reg = json.loads(REG.read_text(encoding="utf-8"))
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    markers = reg.setdefault("markers", [])
    by_id = {str(m.get("id")): m for m in markers}
    added = 0
    touched = 0

    for item in pack.get("markers", []):
        mid = str(item["id"])
        if mid not in by_id:
            row = {
                **item,
                "status": "cataloged",
                "provider_status": "planned",
                "provider_note": "Governed longitudinal catalog definition added; live state requires production provider coverage and release certification.",
                "provider_contract": "workbench-hydrate",
            }
            markers.append(row)
            by_id[mid] = row
            added += 1
        else:
            row = by_id[mid]
            keep = {k: row.get(k) for k in ("provider_status", "provider_note", "provider_contract", "status", "status_reason") if k in row}
            row.update(item)
            row.update(keep)
        if args.live:
            row = by_id[mid]
            row["provider_status"] = "live"
            row["provider_note"] = "Production Data Center provider governance certifies this exact NJ DCA UFB longitudinal history marker live; missing annual observations remain missing."
            row["provider_contract"] = "workbench-hydrate-v040-longitudinal"
        touched += 1

    recalc(reg)
    reg["schema_version"] = "1+provider-status+v040"
    reg["generated_at"] = datetime.now(timezone.utc).isoformat()
    reg["catalog_extension"] = "nj-source-pack-v040.json; 130 exact NJ DCA UFB 2015-2025 longitudinal histories. Availability is controlled by production data_center_provider_coverage."
    REG.write_text(json.dumps(reg, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"added": added, "touched": touched, "live_mode": args.live, "summary": reg["summary"]}, indent=2))


if __name__ == "__main__":
    main()
