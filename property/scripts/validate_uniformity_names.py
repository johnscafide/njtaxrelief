#!/usr/bin/env python3
"""Reject parser bleed in the public Coefficient of Deviation town registry."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "uniformity.json"
BAD_PREFIX = re.compile(
    r"^(?:Boro|Twp|Creek Twp|Town Hunterdon|Bergen County|Middlesex County|Morris County|Salem County)\s+",
    re.I,
)


def main() -> int:
    districts = json.loads(DATA.read_text(encoding="utf-8"))["districts"]
    bad = [(code, row.get("name", "")) for code, row in districts.items() if BAD_PREFIX.search(row.get("name", ""))]
    if bad:
        details = "\n".join(f"  {code}: {name}" for code, name in bad)
        raise SystemExit(f"Uniformity parser bleed detected:\n{details}")
    print(f"Validated {len(districts):,} uniformity district names")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
