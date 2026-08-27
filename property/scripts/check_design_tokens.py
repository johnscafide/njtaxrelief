#!/usr/bin/env python3
"""Enforce Watchdog's canonical design-token contract.

NJW-74 identified subtle brand drift plus parallel per-page token namespaces.
The canonical gold is fixed at #b8972a. The remaining page-local alias families
(--ad- / --fb-) are explicitly baselined legacy debt; --do-* has been fully
retired and is now forbidden everywhere. This check prevents legacy namespaces
from spreading while named files migrate onto shared semantic --wd-* tokens.
It also locks the canonical token foundation itself so container, breakpoint,
typography, and brand primitives cannot silently drift.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CSS_ROOT = ROOT / "property" / "css"
TOKEN_FILE = CSS_ROOT / "shared" / "00-design-tokens.css"
CANONICAL_GOLD = "#b8972a"
CANONICAL_GOLD_ALIAS = "var(--wd-gold-500)"
HISTORICAL_DRIFT = {"#b8972e", "#b9952f", "#e7c46a"}
GOLD_DECLARATION = re.compile(r"--gold\s*:\s*([^;\n}]+)", re.IGNORECASE)
HEX = re.compile(r"#[0-9a-fA-F]{6}")
LEGACY_PAGE_TOKEN = re.compile(r"--(?:ad|fb|do)-[a-z0-9-]+", re.IGNORECASE)
LEGACY_PAGE_TOKEN_ALLOWLIST = {
    pathlib.Path("property/css/agent-control-2027.css"),
    pathlib.Path("property/css/agent-control-readability.css"),
    pathlib.Path("property/css/agent-control-mobile-audit.css"),
    pathlib.Path("property/css/agent-desk.css"),
    pathlib.Path("property/css/farm-builder.css"),
}
MIGRATED_CANONICAL_FILES = {
    pathlib.Path("property/css/watchdog-footer.css"): {
        "required": {
            '@import url("/property/css/shared/00-design-tokens.css");',
            "max-width:var(--container-wide)",
            "font-family:var(--font-ui)",
            "@media(max-width:1024px)",
            "@media(max-width:768px)",
            "@media(max-width:480px)",
        },
        "forbidden": {
            "Source Sans 3",
            "--wdf-",
            "max-width:1680px",
            "max-width:1120px",
            "max-width:760px",
            "max-width:540px",
            "font-size:10px",
            "font-size:11.5px",
            "font-size:9px",
        },
    },
    pathlib.Path("property/css/agent-hardening.css"): {
        "required": {
            "var(--type-xs)",
            "var(--type-xl)",
            "var(--font-ui)",
            "var(--radius-sm)",
            "var(--radius-md)",
            "var(--radius-lg)",
            "var(--radius-pill)",
            "var(--wd-navy-950)",
            "@media(max-width:768px)",
        },
        "forbidden": {
            "Source Sans 3",
            "--fs-",
            "var(--navy-dark)",
            "border-radius:9px",
            "border-radius:12px",
            "border-radius:13px",
            "border-radius:18px",
            "border-radius:20px",
        },
    },
    pathlib.Path("property/css/account-pricing.css"): {
        "required": {
            "var(--type-xs)",
            "var(--type-sm)",
            "var(--type-md)",
            "var(--font-ui)",
            "var(--radius-sm)",
            "var(--radius-md)",
            "var(--radius-lg)",
            "var(--radius-xl)",
            "var(--radius-pill)",
            "var(--wd-navy-950)",
            "var(--wd-teal-600)",
            "@media (max-width: 1536px)",
            "@media (max-width: 1024px)",
            "@media (max-width: 768px)",
        },
        "forbidden": {
            "Source Sans 3",
            "var(--sans",
            "font-size: 9px",
            "font-size: 10px",
            "font-size: 11px",
            "@media (max-width: 1500px)",
            "@media (max-width: 1000px)",
            "@media (max-width: 720px)",
            "border-radius: 10px",
            "border-radius: 11px",
            "border-radius: 12px",
            "border-radius: 14px",
            "border-radius: 16px",
            "border-radius: 18px",
            "border-radius: 20px",
            "border-radius: 22px",
            "border-radius: 99px",
        },
    },
    pathlib.Path("property/css/lookup/03-neighborhood-results.css"): {
        "required": {
            "var(--type-xs)",
            "var(--type-sm)",
            "var(--type-md)",
            "var(--type-xl)",
            "var(--font-ui)",
            "var(--radius-sm)",
            "var(--radius-md)",
            "var(--radius-lg)",
            "var(--radius-pill)",
            "var(--shadow-md)",
            "var(--wd-navy-950)",
            "@media (max-width: 1024px)",
            "@media (max-width: 768px)",
            "@media (max-width: 480px)",
        },
        "forbidden": {
            "font-size: 9px",
            "font-size: 10px",
            "font-size: 11.5px",
            "font-size: 12.5px",
            "font-size: 13.5px",
            "font-size: 14.5px",
            "@media (max-width: 1100px)",
            "@media (max-width: 900px)",
            "@media (max-width: 820px)",
            "@media (max-width: 560px)",
            "font-family: 'Plus Jakarta Sans'",
            "border: 2px solid #b8972a",
        },
    },
    pathlib.Path("property/css/farm-showcase.css"): {
        "required": {
            "var(--font-ui)",
            "var(--text-muted)",
            "var(--surface-soft)",
            "var(--border)",
            "var(--shadow-md)",
            "var(--radius-lg)",
            "var(--radius-xl)",
            "@media(max-width:1024px)",
            "@media(max-width:768px)",
        },
        "forbidden": {
            "Source Sans 3",
            "@media(max-width:1100px)",
            "@media(max-width:760px)",
            "border-radius:22px",
            "border-radius:20px",
            "box-shadow:0 18px 42px",
        },
    },
}
MIGRATED_CANONICAL_JS = {
    pathlib.Path("property/js/landing-compare-table.js"): {
        "required": {
            "var(--type-xs)",
            "var(--type-sm)",
            "var(--type-md)",
            "var(--font-ui)",
            "var(--font-display)",
            "var(--radius-pill)",
            "@media(max-width:1024px)",
            "@media(max-width:768px)",
        },
        "forbidden": {
            "font-size:7px",
            "font-size:8px",
            "font-size:9px",
            "font-size:10px",
            "font:800 11px",
            "font-size:13.5px",
            "@media(max-width:900px)",
            "@media(max-width:640px)",
        },
    },
}
REQUIRED_TOKEN_LINES = {
    '--wd-gold-500: #b8972a;',
    '--font-ui: "Plus Jakarta Sans", Arial, sans-serif;',
    '--font-display: "Playfair Display", Georgia, serif;',
    '--container-narrow: 720px;',
    '--container-reading: 1080px;',
    '--container-app: 1280px;',
    '--container-wide: 1500px;',
    '--breakpoint-xs: 480px;',
    '--breakpoint-sm: 768px;',
    '--breakpoint-md: 1024px;',
    '--breakpoint-lg: 1280px;',
    '--breakpoint-xl: 1536px;',
}


def check_token_foundation(failures: list[str]) -> None:
    rel = TOKEN_FILE.relative_to(ROOT)
    if not TOKEN_FILE.exists():
        failures.append(f"{rel}: canonical design-token file is required")
        return

    text = TOKEN_FILE.read_text(encoding="utf-8")
    for required in sorted(REQUIRED_TOKEN_LINES):
        if required not in text:
            failures.append(f"{rel}: required canonical token missing or changed: {required}")

    container_names = set(re.findall(r"--container-[a-z0-9-]+\s*:", text, re.IGNORECASE))
    if len(container_names) != 4:
        failures.append(
            f"{rel}: container contract requires exactly 4 canonical widths; found {len(container_names)}"
        )

    breakpoint_names = set(re.findall(r"--breakpoint-[a-z0-9-]+\s*:", text, re.IGNORECASE))
    if len(breakpoint_names) != 5:
        failures.append(
            f"{rel}: breakpoint contract requires exactly 5 canonical values; found {len(breakpoint_names)}"
        )

    font_names = set(re.findall(r"--font-(?:ui|display)\s*:", text, re.IGNORECASE))
    if len(font_names) != 2:
        failures.append(
            f"{rel}: typography contract requires exactly the UI and display font tokens"
        )


def check_contract_files(
    failures: list[str],
    contracts: dict[pathlib.Path, dict[str, set[str]]],
    kind: str,
) -> None:
    for rel, contract in contracts.items():
        path = ROOT / rel
        if not path.exists():
            failures.append(f"{rel}: migrated canonical {kind} is required")
            continue
        text = path.read_text(encoding="utf-8")
        for required in sorted(contract["required"]):
            if required not in text:
                failures.append(f"{rel}: migrated design contract missing {required!r}")
        for forbidden in sorted(contract["forbidden"]):
            if forbidden.lower() in text.lower():
                failures.append(f"{rel}: migrated design contract forbids {forbidden!r}")


def main() -> int:
    failures: list[str] = []
    checked = 0
    legacy_files: set[pathlib.Path] = set()

    check_token_foundation(failures)
    check_contract_files(failures, MIGRATED_CANONICAL_FILES, "stylesheet")
    check_contract_files(failures, MIGRATED_CANONICAL_JS, "script")

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

    stale_allowlist = sorted(LEGACY_PAGE_TOKEN_ALLOWLIST - legacy_files)
    if stale_allowlist:
        failures.extend(
            f"{rel}: remove stale legacy-token allowlist entry after migration"
            for rel in stale_allowlist
        )

    if failures:
        print("Watchdog design-token contract failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    legacy_display = ", ".join(str(path) for path in sorted(legacy_files)) or "none"
    print(
        f"Watchdog design-token contract passed: {checked} CSS files checked; "
        f"canonical gold is {CANONICAL_GOLD}; token foundation is locked to 4 containers, "
        f"5 breakpoints, and 2 font roles; migrated surfaces are regression-guarded; "
        f"legacy page-token debt is confined to: {legacy_display}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
