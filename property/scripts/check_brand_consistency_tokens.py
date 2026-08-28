#!/usr/bin/env python3
"""Regression guard for the shared Watchdog product brand/type layer.

NJW-73/NJW-74 migrated brand-consistency.css onto the canonical typography
and responsive contracts without changing its compatibility color palette.
This check prevents the shared Dashboard/Home/secondary-shell layer from
drifting back to raw microtype, Inter, or the retired 760px breakpoint.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGET = ROOT / "property" / "css" / "brand-consistency.css"

REQUIRED = {
    '@import url("/property/css/shared/00-design-tokens.css");',
    "font-family:var(--font-ui)",
    "var(--type-xs)",
    "var(--type-sm)",
    "var(--type-md)",
    "var(--type-xl)",
    "border-radius:var(--radius-md)",
    "@media (max-width:768px)",
}

FORBIDDEN = {
    "family=Inter",
    "font-family:Inter",
    "Inter,sans-serif",
    "@media (max-width:760px)",
    "Source Sans 3",
}

RAW_FONT_SIZE = re.compile(r"font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px", re.IGNORECASE)
RAW_FONT_SHORTHAND = re.compile(
    r"font\s*:\s*[^;{}]*?\b([0-9]+(?:\.[0-9]+)?)px(?:\s*/[^;{}]+)?",
    re.IGNORECASE,
)


def main() -> int:
    failures: list[str] = []
    if not TARGET.exists():
        print(f"Brand consistency token contract failed: missing {TARGET.relative_to(ROOT)}")
        return 1

    text = TARGET.read_text(encoding="utf-8")
    for required in sorted(REQUIRED):
        if required not in text:
            failures.append(f"missing canonical contract {required!r}")

    lowered = text.lower()
    for forbidden in sorted(FORBIDDEN):
        if forbidden.lower() in lowered:
            failures.append(f"forbidden legacy contract present: {forbidden!r}")

    for match in RAW_FONT_SIZE.finditer(text):
        value = float(match.group(1))
        if value < 12:
            failures.append(f"raw font-size below 12px remains: {match.group(0)!r}")

    for match in RAW_FONT_SHORTHAND.finditer(text):
        value = float(match.group(1))
        if value < 12:
            failures.append(f"raw font shorthand below 12px remains: {match.group(0)!r}")

    if failures:
        print("Brand consistency token contract failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print(
        "Brand consistency token contract passed: shared Dashboard/Home/secondary "
        "product chrome uses canonical Watchdog type tokens, UI font, 12px readable "
        "floor, radius token, and 768px mobile breakpoint."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
