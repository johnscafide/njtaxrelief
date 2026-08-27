#!/usr/bin/env python3
"""Regression guard for the final Agent Control mobile typography/token layer."""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGET = ROOT / "property" / "css" / "agent-control-mobile-final.css"

REQUIRED = {
    '@import url("/property/css/shared/00-design-tokens.css");',
    "@media (max-width:768px)",
    "@media (max-width:480px)",
    "var(--type-xs)",
    "var(--type-sm)",
    "var(--type-md)",
    "var(--type-lg)",
    "var(--type-xl)",
    "var(--radius-md)",
}
FORBIDDEN = {
    "@media (max-width:760px)",
    "@media (max-width:420px)",
    "Source Sans 3",
}

RAW_FONT_PX = re.compile(r"font-size\s*:\s*\d+(?:\.\d+)?px", re.IGNORECASE)
RAW_RADIUS_PX = re.compile(r"border-radius\s*:\s*\d+(?:\.\d+)?px", re.IGNORECASE)


def main() -> int:
    if not TARGET.exists():
        print(f"Agent Control mobile token contract failed: missing {TARGET.relative_to(ROOT)}")
        return 1

    text = TARGET.read_text(encoding="utf-8")
    failures: list[str] = []

    for value in sorted(REQUIRED):
        if value not in text:
            failures.append(f"missing required canonical token contract: {value}")

    for value in sorted(FORBIDDEN):
        if value.lower() in text.lower():
            failures.append(f"retired Agent Control mobile value returned: {value}")

    raw_font = sorted(set(RAW_FONT_PX.findall(text)))
    if raw_font:
        failures.append(f"raw px font-size declarations are forbidden: {', '.join(raw_font)}")

    raw_radius = sorted(set(RAW_RADIUS_PX.findall(text)))
    if raw_radius:
        failures.append(f"raw px border-radius declarations are forbidden: {', '.join(raw_radius)}")

    if failures:
        print("Agent Control mobile token contract failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print(
        "Agent Control mobile token contract passed: final layer uses the canonical "
        "768/480 breakpoints, shared rem typography, and shared radius tokens."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
