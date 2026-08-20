#!/usr/bin/env python3
"""Audit Watchdog /property surfaces against the authoritative brand system.

This is intentionally a reporting tool first. Existing legacy debt is surfaced as
warnings so CI can establish a baseline without making unrelated pages undeployable.
Use --strict to make critical contract violations fail the process.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
PROPERTY = ROOT / "property"
BRAND_JSON = PROPERTY / "branding" / "brand-system.json"

APP_PAGE_NAMES = {
    "dashboard",
    "home",
    "town-compare",
    "fairness",
    "pulse",
    "scan",
    "account",
    "data-workbench",
    "data-center",
    "agent-desk",
    "pro",
}

CANONICAL_NAV = [
    "Dashboard",
    "Property Home",
    "Town Compare",
    "Assessment Fairness",
    "Change Intelligence",
    "Agent Control",
    "Appeal Scanner",
    "Data Workbench",
    "Data Center",
    "Professional Hub",
    "Account",
]

TEXT_EXTENSIONS = {".html", ".css", ".js", ".mjs", ".md"}
SKIP_PARTS = {
    "node_modules",
    "vendor",
    "dist",
    "coverage",
    ".git",
}

FONT_RE = re.compile(r"font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px", re.I)
DATA_PAGE_RE = re.compile(r"data-sidebar-page=[\"']([^\"']+)[\"']", re.I)
LEGACY_PARTIAL = "/property/partials/sidemenu.html"
LEGACY_CLASS_RE = re.compile(r"(?:class=[\"'][^\"']*\bdb-sidebar\b|\.db-sidebar\b)", re.I)
BAD_BRAND_RE = re.compile(r"\b(?:WatchDog|Watch Dog)\b")


@dataclass
class Finding:
    level: str
    path: str
    detail: str


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def files_with(exts: Iterable[str]) -> list[Path]:
    wanted = set(exts)
    out: list[Path] = []
    for p in PROPERTY.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in wanted:
            continue
        if any(part in SKIP_PARTS for part in p.parts):
            continue
        out.append(p)
    return sorted(out)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def page_name(path: Path, text: str) -> str:
    match = DATA_PAGE_RE.search(text)
    if match:
        return match.group(1).strip()
    if path.name.lower() == "index.html":
        return path.parent.name
    return path.stem


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="brand-consistency-report.md")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    findings: list[Finding] = []
    if not BRAND_JSON.exists():
        findings.append(Finding("critical", relative(BRAND_JSON), "Authoritative brand-system.json is missing."))
        brand = {}
    else:
        brand = json.loads(read_text(BRAND_JSON))

    html_files = files_with({".html"})
    css_files = files_with({".css"})
    js_files = files_with({".js", ".mjs"})
    text_files = files_with(TEXT_EXTENSIONS)

    font_counts: Counter[float] = Counter()
    font_files: defaultdict[str, Counter[float]] = defaultdict(Counter)
    below_12 = 0
    below_10 = 0
    tiny_by_file: Counter[str] = Counter()
    source_sans_files: set[str] = set()
    playfair_app_files: set[str] = set()
    app_shell_pages: dict[str, str] = {}
    legacy_partial_refs: list[str] = []
    legacy_sidebar_refs: list[str] = []
    bad_brand_files: list[str] = []

    for path in css_files:
        rel = relative(path)
        text = read_text(path)
        for raw in FONT_RE.findall(text):
            size = float(raw)
            font_counts[size] += 1
            font_files[rel][size] += 1
            if size < 12:
                below_12 += 1
                tiny_by_file[rel] += 1
            if size < 10:
                below_10 += 1
        if "Source Sans 3" in text:
            source_sans_files.add(rel)
        if "Playfair Display" in text and any(part in rel for part in ("dashboard", "home", "agent-desk", "data-workbench", "data-center", "scan")):
            playfair_app_files.add(rel)

    for path in html_files:
        rel = relative(path)
        text = read_text(path)
        page = page_name(path, text)
        if page in APP_PAGE_NAMES or "data-sidebar-page" in text:
            app_shell_pages[rel] = page
        if LEGACY_PARTIAL in text:
            legacy_partial_refs.append(rel)
        if LEGACY_CLASS_RE.search(text):
            legacy_sidebar_refs.append(rel)
        if BAD_BRAND_RE.search(text):
            bad_brand_files.append(rel)

    for path in js_files:
        rel = relative(path)
        text = read_text(path)
        if LEGACY_PARTIAL in text:
            legacy_partial_refs.append(rel)
        if BAD_BRAND_RE.search(text):
            bad_brand_files.append(rel)

    # Current shell contracts that must stay synchronized.
    dashboard = PROPERTY / "dashboard" / "index.html"
    home = PROPERTY / "home" / "index.html"
    sidemenu = PROPERTY / "js" / "sidemenu.js"
    runtime = PROPERTY / "js" / "brand-consistency-runtime.js"
    consistency_css = PROPERTY / "css" / "brand-consistency.css"

    for required in (dashboard, home, sidemenu, runtime, consistency_css):
        if not required.exists():
            findings.append(Finding("critical", relative(required), "Required current-shell consistency asset is missing."))

    if dashboard.exists() and "/property/js/brand-consistency-runtime.js" not in read_text(dashboard):
        findings.append(Finding("critical", relative(dashboard), "Dashboard does not load the canonical brand consistency runtime."))
    if home.exists() and "/property/js/brand-consistency-runtime.js" not in read_text(home):
        findings.append(Finding("critical", relative(home), "Property Home does not load the canonical brand consistency runtime."))
    if sidemenu.exists():
        sidemenu_text = read_text(sidemenu)
        if LEGACY_PARTIAL in sidemenu_text:
            findings.append(Finding("critical", relative(sidemenu), "Legacy vertical sidenav fetch was reintroduced."))
        if "/property/js/brand-consistency-runtime.js" not in sidemenu_text:
            findings.append(Finding("critical", relative(sidemenu), "Secondary-shell loader is not connected to canonical brand consistency runtime."))

    if runtime.exists():
        runtime_text = read_text(runtime)
        for label in CANONICAL_NAV:
            if label not in runtime_text:
                findings.append(Finding("critical", relative(runtime), f"Canonical navigation label missing: {label}"))

    # Legacy references outside the deliberately retired partial are actionable warnings.
    for rel in sorted(set(legacy_partial_refs)):
        if rel != "property/partials/sidemenu.html":
            findings.append(Finding("warning", rel, "References the retired /property/partials/sidemenu.html navigation."))
    for rel in sorted(set(legacy_sidebar_refs)):
        if rel != "property/partials/sidemenu.html":
            findings.append(Finding("warning", rel, "Contains legacy .db-sidebar markup or CSS; confirm it is not rendered."))

    for rel in sorted(playfair_app_files):
        findings.append(Finding("warning", rel, "Playfair Display appears in an app/data surface; product UI should use Plus Jakarta Sans + Inter."))

    for rel in sorted(set(bad_brand_files)):
        findings.append(Finding("warning", rel, "Non-canonical Watchdog casing found (WatchDog/Watch Dog)."))

    # Machine-readable authority sanity checks.
    try:
        typography = brand.get("typography", {}).get("canonical_product", {})
        if typography.get("display", {}).get("family") != "Plus Jakarta Sans":
            findings.append(Finding("critical", relative(BRAND_JSON), "Canonical display font is not Plus Jakarta Sans."))
        if typography.get("body_ui", {}).get("family") != "Inter":
            findings.append(Finding("critical", relative(BRAND_JSON), "Canonical body/UI font is not Inter."))
    except AttributeError:
        findings.append(Finding("critical", relative(BRAND_JSON), "Typography contract is malformed."))

    top_tiny = tiny_by_file.most_common(25)
    distinct_sizes = sorted(font_counts)
    critical = [f for f in findings if f.level == "critical"]
    warnings = [f for f in findings if f.level == "warning"]

    report = Path(args.report)
    if not report.is_absolute():
        report = ROOT / report
    report.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "# Watchdog Property Brand Consistency Audit",
        "",
        "Generated from the repository tree. Authority: `property/branding/brand-system.json`.",
        "",
        "## Coverage",
        "",
        f"- HTML pages scanned: **{len(html_files)}**",
        f"- CSS files scanned: **{len(css_files)}**",
        f"- JavaScript files scanned: **{len(js_files)}**",
        f"- App/current-shell pages identified: **{len(app_shell_pages)}**",
        f"- Distinct raw px font sizes: **{len(distinct_sizes)}**",
        f"- Raw `font-size` declarations below 12px: **{below_12}**",
        f"- Raw `font-size` declarations below 10px: **{below_10}**",
        f"- Files containing Source Sans 3: **{len(source_sans_files)}**",
        "",
        "## Current-shell contract",
        "",
        "Dashboard, Property Home, and supported secondary app pages must converge on the canonical Watchdog navigation, brand mark, typography, colors, focus treatment, and sizing layer. The legacy fixed/collapsible vertical sidenav remains prohibited.",
        "",
        "Canonical app navigation:",
        "",
    ]
    lines.extend(f"1. {label}" for label in CANONICAL_NAV)

    lines.extend(["", "## Findings", ""])
    if not findings:
        lines.append("No critical or structural warning findings.")
    else:
        for finding in findings:
            badge = "CRITICAL" if finding.level == "critical" else "WARN"
            lines.append(f"- **{badge}** `{finding.path}`: {finding.detail}")

    lines.extend(["", "## Highest concentrations of sub-12px CSS", ""])
    if top_tiny:
        lines.append("| File | Declarations <12px |")
        lines.append("| --- | ---: |")
        for rel, count in top_tiny:
            lines.append(f"| `{rel}` | {count} |")
    else:
        lines.append("No raw pixel font sizes below 12px found.")

    lines.extend(["", "## Raw pixel type scale", ""])
    if distinct_sizes:
        lines.append(", ".join(f"{size:g}px ({font_counts[size]})" for size in distinct_sizes))
    else:
        lines.append("No raw pixel font-size declarations found.")

    lines.extend(["", "## App/current-shell pages detected", ""])
    for rel, page in sorted(app_shell_pages.items()):
        lines.append(f"- `{rel}` → `{page}`")

    lines.extend(["", "## Interpretation", ""])
    lines.append("The font-size totals are debt metrics, not automatic defects. Existing editorial exceptions and compact brand descriptors may legitimately be smaller. Product/app surfaces should treat 12px as the normal readability floor and use the authoritative brand system for new work.")
    lines.append("")
    lines.append(f"Critical findings: **{len(critical)}**. Structural warnings: **{len(warnings)}**.")
    lines.append("")

    report.write_text("\n".join(lines), encoding="utf-8")

    print(f"Scanned {len(html_files)} HTML, {len(css_files)} CSS, {len(js_files)} JS files under property/")
    print(f"font-size <12px: {below_12}; <10px: {below_10}; distinct px sizes: {len(distinct_sizes)}")
    print(f"critical: {len(critical)}; warnings: {len(warnings)}")
    print(f"report: {report.relative_to(ROOT) if report.is_relative_to(ROOT) else report}")

    if args.strict and critical:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
