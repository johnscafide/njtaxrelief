#!/usr/bin/env python3
"""Enforce Watchdog's canonical design-token contract.

NJW-74 identified subtle brand drift plus parallel per-page token namespaces.
The canonical gold is fixed at #b8972a. The remaining page-local alias families
(--ad- / --fb- / --do-) are explicitly baselined legacy debt, so this check
prevents them from spreading while the named files are migrated onto shared
semantic --wd-* tokens. Legacy variable consumption is held to an even tighter
baseline so migrated files cannot start depending on page-local aliases again.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CSS_ROOT = ROOT / "property" / "css"
CANONICAL_GOLD = "#b8972a"
CANONICAL_GOLD_ALIAS = "var(--wd-gold-500)"
HISTORICAL_DRIFT = {"#b8972e", "#b9952f", "#e7c46a"}
GOLD_DECLARATION = re.compile(r"--gold\s*:\s*([^;\n}]+)", re.IGNORECASE)
HEX = re.compile(r"#[0-9a-fA-F]{6}")
LEGACY_PAGE_TOKEN = re.compile(r"--(?:ad|fb|do)-[a-z0-9-]+", re.IGNORECASE)
LEGACY_PAGE_TOKEN_REFERENCE = re.compile(
    r"var\(\s*--(?:ad|fb|do)-[a-z0-9-]+", re.IGNORECASE
)
LEGACY_PAGE_TOKEN_ALLOWLIST = {
    pathlib.Path("property/css/agent-control-2027.css"),
    pathlib.Path("property/css/agent-control-readability.css"),
    pathlib.Path("property/css/agent-control-mobile-audit.css"),
    pathlib.Path("property/css/agent-desk.css"),
    pathlib.Path("property/css/agent-discover.css"),
    pathlib.Path("property/css/agent-hardening.css"),
    pathlib.Path("property/css/farm-builder.css"),
    pathlib.Path("property/css/developer-data.css"),
}
LEGACY_PAGE_TOKEN_REFERENCE_ALLOWLIST = {
    pathlib.Path("property/css/agent-control-mobile-audit.css"),
    pathlib.Path("property/css/developer-data.css"),
}


def main() -> int:
    failures: list[str] = []
    checked = 0
    legacy_files: set[pathlib.Path] = set()
    legacy_reference_files: set[pathlib.Path] = set()

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
            if value.lower() == CANONICAL_GOLD_ALIAS:
                continue
            hexes = [item.lower() for item in HEX.findall(value)]
            if not hexes:
                failures.append(
                    f"{rel}: --gold must use {CANONICAL_GOLD} or {CANONICAL_GOLD_ALIAS}; "
                    f"found {value!r}"
                )
                continue
            if CANONICAL_GOLD not in hexes:
                failures.append(
                    f"{rel}: --gold must use {CANONICAL_GOLD}; found {value!r}"
                )

        legacy_matches = sorted(set(LEGACY_PAGE_TOKEN.findall(text)))
        if legacy_matches:
            legacy_files.add(rel)
            if rel not in LEGACY_PAGE_TOKEN_ALLOWLIST:
                preview = ", ".join(legacy_matches[:5])
                failures.append(
                    f"{rel}: legacy page token namespace is forbidden outside the migration allowlist; "
                    f"found {preview}"
                )

        legacy_reference_matches = sorted(set(LEGACY_PAGE_TOKEN_REFERENCE.findall(text)))
        if legacy_reference_matches:
            legacy_reference_files.add(rel)
            if rel not in LEGACY_PAGE_TOKEN_REFERENCE_ALLOWLIST:
                preview = ", ".join(legacy_reference_matches[:5])
                failures.append(
                    f"{rel}: legacy page token consumption is forbidden outside the migration allowlist; "
                    f"found {preview}"
                )

    stale_allowlist = sorted(LEGACY_PAGE_TOKEN_ALLOWLIST - legacy_files)
    if stale_allowlist:
        failures.extend(
            f"{rel}: remove stale legacy-token allowlist entry after migration"
            for rel in stale_allowlist
        )

    stale_reference_allowlist = sorted(
        LEGACY_PAGE_TOKEN_REFERENCE_ALLOWLIST - legacy_reference_files
    )
    if stale_reference_allowlist:
        failures.extend(
            f"{rel}: remove stale legacy-token reference allowlist entry after migration"
            for rel in stale_reference_allowlist
        )

    if failures:
        print("Watchdog design-token contract failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    legacy_display = ", ".join(str(path) for path in sorted(legacy_files)) or "none"
    reference_display = (
        ", ".join(str(path) for path in sorted(legacy_reference_files)) or "none"
    )
    print(
        f"Watchdog design-token contract passed: {checked} CSS files checked; "
        f"canonical gold is {CANONICAL_GOLD}; legacy page-token debt is confined to: "
        f"{legacy_display}; legacy variable consumption is confined to: {reference_display}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
