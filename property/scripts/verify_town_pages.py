#!/usr/bin/env python3
"""Fast integrity checks for generated municipality report pages."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

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

# Guard the generated SEO surface against site-wide dead internal links.
# Query strings and fragments do not affect whether a static target exists.
checked = set()
for page in manifest["pages"]:
    source = ROOT / page["path"]
    text = source.read_text(errors="ignore")
    for href in re.findall(r'href=["\']([^"\']+)["\']', text, flags=re.I):
        if not href.startswith("/") or href.startswith("//"):
            continue
        parsed = urlparse(href)
        path = parsed.path
        if path in checked:
            continue
        checked.add(path)
        if path.endswith("/"):
            target = ROOT / path.lstrip("/") / "index.html"
        else:
            target = ROOT / path.lstrip("/")
        assert target.exists(), f"broken internal town-page link: {path} (first seen in {page['path']})"

print(f"Verified {manifest['total_towns']} town pages, {manifest['counties']} county hubs, sitemap coverage, and {len(checked)} unique internal link targets.")
