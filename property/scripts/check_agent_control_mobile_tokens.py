#!/usr/bin/env python3
"""Regression guard for the Agent Control workspace typography/token layer.

Agent Control (Opportunity Desk, Farm Map, Growth, Advanced Farm) shares one
chrome stylesheet (agent-workspace.css) and the Opportunity Desk has one content
stylesheet (agent-desk.css). Both must stay on the canonical 768px breakpoint,
the shared rem type scale and the 12px text / 48px mobile-control floor.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGETS = {
    ROOT / "property" / "css" / "agent-workspace.css": {
        "required": {
            "--aw-xs:var(--type-xs",
            "--aw-sm:var(--type-sm",
            "--aw-md:var(--type-md",
            "@media(max-width:768px)",
            "min-height:44px",
        },
    },
    ROOT / "property" / "css" / "agent-desk.css": {
        "required": {
            "@media(max-width:768px)",
            "var(--aw-xs)",
            "var(--aw-sm)",
            "var(--aw-md)",
            "min-height:48px",
        },
    },
}
FORBIDDEN = {
    "@media(max-width:760px)",
    "@media(max-width:420px)",
    "Source Sans 3",
}
RETIRED = [
    "agent-control-mobile-final.css",
    "agent-control-mobile-audit.css",
    "agent-control-readability.css",
    "agent-control-2027.css",
]
RAW_FONT_PX = re.compile(r"font-size\s*:\s*(\d+(?:\.\d+)?)px", re.IGNORECASE)
FONT_SHORTHAND_PX = re.compile(r"font\s*:[^;{}]*?\s(\d+(?:\.\d+)?)px", re.IGNORECASE)


def main() -> int:
    failures: list[str] = []
    for path, contract in TARGETS.items():
        rel = path.relative_to(ROOT)
        if not path.exists():
            failures.append(f"{rel}: required Agent Control stylesheet is missing")
            continue
        text = path.read_text(encoding="utf-8")
        for token in sorted(contract["required"]):
            if token not in text:
                failures.append(f"{rel}: missing {token!r}")
        for token in sorted(FORBIDDEN):
            if token.lower() in text.lower():
                failures.append(f"{rel}: forbids {token!r}")
        tiny = [v for v in RAW_FONT_PX.findall(text) + FONT_SHORTHAND_PX.findall(text) if float(v) < 12]
        if tiny:
            failures.append(f"{rel}: text below the 12px readability floor: {', '.join(sorted(set(tiny)))}px")
    for name in RETIRED:
        if (ROOT / "property" / "css" / name).exists():
            failures.append(f"property/css/{name}: retired Agent Control overlay must not return")

    if failures:
        print("Agent Control token contract failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1
    print("Agent Control token contract passed: shared workspace chrome and Opportunity Desk use the canonical 768px breakpoint, shared rem type scale and 12px text floor; retired overlays are gone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
