#!/usr/bin/env python3
"""Fail CI if Watchdog's canonical gold token drifts.

NJW-74 identified several near-identical gold values that made the product feel
visually inconsistent. The active property CSS has converged on #b8972a. This
check keeps that decision enforceable while the wider token migration continues.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CSS_ROOT = ROOT / "property" / "css"
CANONICAL_GOLD = "#b8972a"
HISTORICAL_DRIFT = {"#b8972e", "#b9952f", "#e7c46a"}
GOLD_DECLARATION = re.compile(r"--gold\s*:\s*([^;\n}]+)", re.IGNORECASE)
HEX = re.compile(r"#[0-9a-fA-F]{6}")


def main() -> int:
    failures: list[str] = []
    checked = 0

    for path in sorted(CSS_ROOT.rglob("*.css")):
        text = path.read_text(encoding="utf-8")
        checked += 1
        rel = path.relative_to(ROOT)
        lowered = text.lower()

        for bad in sorted(HISTORICAL_DRIFT):
            if bad in lowered:
                failures.append(f"{rel}: historical gold drift {bad} is forbidden")

        for match in GOLD_DECLARATION.finditer(text):
            value = match.group(1).strip()
            hexes = [item.lower() for item in HEX.findall(value)]
            if not hexes:
                failures.append(
                    f"{rel}: --gold must resolve explicitly to {CANONICAL_GOLD}; found {value!r}"
                )
                continue
            if CANONICAL_GOLD not in hexes:
                failures.append(
                    f"{rel}: --gold must use {CANONICAL_GOLD}; found {value!r}"
                )

    if failures:
        print("Watchdog design-token contract failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print(
        f"Watchdog design-token contract passed: {checked} CSS files checked; "
        f"canonical gold is {CANONICAL_GOLD}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
