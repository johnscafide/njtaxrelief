#!/usr/bin/env python3
"""Fast integrity checks for generated municipality report pages."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "towns/town-manifest.json").read_text())
assert manifest["total_towns"] == 564, f"expected 564 towns, got {manifest['total_towns']}"
assert manifest["counties"] == 21, f"expected 21 counties, got {manifest['counties']}"
for page in manifest["pages"]:
    target = ROOT / page["path"]
    assert target.exists(), f"missing {page['path']}"
sample = ROOT / manifest["pages"][0]["path"]
html = sample.read_text()
for required in ("rel=\"canonical\"", "FAQPage", "BreadcrumbList", "Check tax-relief options", "Property Watchdog"):
    assert required in html, f"{sample.name} is missing {required}"
sitemap = (ROOT / "sitemap.xml").read_text()
assert "<!-- TOWN_REPORTS_START -->" in sitemap and sitemap.count("/towns/") >= 586, "town URLs missing from sitemap"
print(f"Verified {manifest['total_towns']} town pages, {manifest['counties']} county hubs, and sitemap coverage.")
