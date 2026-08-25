#!/usr/bin/env python3
"""Map signed-in/current Watchdog property pages to the canonical brand layer.

This complements audit_brand_consistency.py: that audit checks effective design
contracts, while this one answers a simpler governance question for every app
HTML route: how does the page receive the canonical Watchdog brand system?
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPERTY = ROOT / "property"

DATA_PAGE_RE = re.compile(r"data-sidebar-page=[\"']([^\"']+)[\"']", re.I)
ACCESS_RE = re.compile(r"data-access-require=[\"']([^\"']+)[\"']", re.I)

DIRECT_RUNTIME = "/property/js/brand-consistency-runtime.js"
DIRECT_CSS = "/property/css/brand-consistency.css"
SHARED_LOADER = "/property/js/sidemenu.js"
MODERN_SHELL_JS = "/property/js/app-shell-2027.js"
MODERN_SHELL_CSS = "/property/css/app-shell-2027.css"
LEGACY_PARTIAL = "/property/partials/sidemenu.html"

# Pages with explicit data-sidebar-page values are app surfaces by declaration.
# These route names also cover known current app pages if the attribute is missing.
APP_PAGE_NAMES = {
    "dashboard", "home", "town-compare", "fairness", "pulse", "scan",
    "account", "data-workbench", "data-center", "agent-desk", "pro",
    "branding", "compliance", "developer-data", "growth", "integrations",
    "marker", "reports", "updates", "verification-diagnostics", "workbench",
}


@dataclass
class PageCoverage:
    path: str
    page: str
    access: str
    status: str
    mechanism: str
    legacy_ref: bool


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def page_name(path: Path, text: str) -> str:
    match = DATA_PAGE_RE.search(text)
    if match:
        return match.group(1).strip()
    return path.parent.name if path.name.lower() == "index.html" else path.stem


def access_level(text: str) -> str:
    match = ACCESS_RE.search(text)
    return match.group(1).strip() if match else "unspecified"


def classify(text: str) -> tuple[str, str]:
    has_runtime = DIRECT_RUNTIME in text
    has_css = DIRECT_CSS in text
    has_loader = SHARED_LOADER in text
    has_modern_shell = MODERN_SHELL_JS in text or MODERN_SHELL_CSS in text

    if has_runtime:
        return "canonical", "direct brand runtime"
    if has_loader:
        return "canonical", "shared sidemenu.js loader"
    if has_css:
        return "canonical", "direct brand consistency CSS"
    if has_modern_shell:
        return "needs-review", "modern app shell without canonical brand runtime/loader"
    return "uncovered", "no canonical brand layer detected"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="brand-page-coverage-report.md")
    parser.add_argument("--strict", action="store_true", help="Fail if an app page is uncovered or only partially covered.")
    args = parser.parse_args()

    pages: list[PageCoverage] = []
    for path in sorted(PROPERTY.rglob("*.html")):
        if any(part in {"node_modules", "vendor", "dist", "coverage"} for part in path.parts):
            continue
        text = read(path)
        page = page_name(path, text)
        is_app = "data-sidebar-page" in text or page in APP_PAGE_NAMES
        if not is_app:
            continue
        status, mechanism = classify(text)
        pages.append(PageCoverage(
            path=rel(path),
            page=page,
            access=access_level(text),
            status=status,
            mechanism=mechanism,
            legacy_ref=LEGACY_PARTIAL in text,
        ))

    counts = Counter(p.status for p in pages)
    problems = [p for p in pages if p.status != "canonical"]

    report = Path(args.report)
    if not report.is_absolute():
        report = ROOT / report
    report.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "# Watchdog App Brand Page Coverage",
        "",
        "Every signed-in/current app page should inherit the canonical Watchdog brand layer directly or through the shared navigation loader.",
        "",
        "## Summary",
        "",
        f"- App/current pages: **{len(pages)}**",
        f"- Canonical coverage: **{counts['canonical']}**",
        f"- Needs review: **{counts['needs-review']}**",
        f"- Uncovered: **{counts['uncovered']}**",
        "",
        "## Coverage matrix",
        "",
        "| Page | Route ID | Access | Coverage | Mechanism | Retired sidebar text present |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for p in pages:
        lines.append(
            f"| `{p.path}` | `{p.page}` | `{p.access}` | **{p.status}** | {p.mechanism} | {'yes' if p.legacy_ref else 'no'} |"
        )

    lines.extend(["", "## Migration queue", ""])
    if problems:
        for p in problems:
            lines.append(f"- `{p.path}`: **{p.status}** — {p.mechanism}.")
    else:
        lines.append("No current app pages require brand-layer migration.")

    lines.extend([
        "",
        "## Interpretation",
        "",
        "This matrix tests delivery of the canonical brand layer, not whether every raw legacy CSS declaration has already been deleted. A canonical page may still carry measurable historical CSS debt that is overridden or isolated by the current shell.",
        "",
    ])
    report.write_text("\n".join(lines), encoding="utf-8")

    print(f"App/current pages: {len(pages)}; canonical: {counts['canonical']}; needs-review: {counts['needs-review']}; uncovered: {counts['uncovered']}")
    print(f"report: {report.relative_to(ROOT) if report.is_relative_to(ROOT) else report}")

    if args.strict and problems:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
