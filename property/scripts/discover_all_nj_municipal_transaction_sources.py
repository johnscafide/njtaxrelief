#!/usr/bin/env python3
"""Run municipal transaction-source discovery against all 564 NJ municipalities.

The canonical identity is NJ municipality code + county + municipality name. This
avoids collapsing same-named municipalities across counties (Franklin, Washington,
Greenwich, etc.) and prevents the wrong municipal website/provider from being used.

NJW-374 also broadens the resale/occupancy vocabulary because municipalities use
many names for the same transfer workflow (CO, CCO, resale certificate, certificate
of compliance, transfer inspection, change-of-occupancy certificate, and more).
It additionally probes the public WIPP metadata endpoint for every canonical
municipality code, so WIPP coverage does not depend on whether a town website
happens to expose a crawlable outbound link.
"""
from __future__ import annotations

import html
import importlib.util
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DISCOVERY_PATH = ROOT / "property/scripts/discover_municipal_transaction_sources.py"
MUNICIPAL_QUERY = (
    "https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/"
    "MapServer/2/query?where=1%3D1&outFields=NAME%2CCOUNTY%2CMUN_CODE&"
    "returnGeometry=false&orderByFields=MUN_CODE&f=json"
)
WIPP_METADATA = "https://api.edmundsgovtech.cloud/wipp-core/v1/metadata/{code}"
WIPP_PORTAL = "https://wipp.edmundsgovtech.cloud/"
UA = "Watchdog-municipal-source-discovery/2.4 (+https://www.watchdogindex.com/)"
ANCHOR_RE = re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>([^<]{0,120})', re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
COUNTY_HINT_RE = re.compile(r"\(([^)]+?)\s+County\)", re.I)
EXPANDED_OCCUPANCY_TERMS = (
    "certificate of occupancy", "continued certificate", "continued certificate of occupancy",
    "continuing certificate of occupancy", "certificate of continued occupancy", "continued occupancy",
    "continued occupancy certificate", "cco", "resale inspection", "resale certificate",
    "resale occupancy certificate", "resale cco", "residential resale inspection",
    "dwelling resale inspection", "sale inspection", "occupancy inspection", "occupancy certification",
    "change of occupancy", "change in occupancy", "change-in-occupancy", "change of ownership inspection",
    "certificate of compliance", "property transfer inspection", "transfer of title inspection",
    "transfer inspection", "transfer certificate", "property transfer certificate",
)


def load_discovery():
    spec = importlib.util.spec_from_file_location("watchdog_municipal_discovery", DISCOVERY_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load municipal discovery module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fetch_text(url: str, accept: str = "text/html,*/*;q=0.5", max_bytes: int = 8_000_000) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=40) as response:
        if int(response.status) != 200:
            raise RuntimeError(f"Source returned HTTP {response.status}: {url}")
        return response.read(max_bytes).decode("utf-8", errors="replace")


def canonical_entities() -> list[dict[str, str]]:
    payload = json.loads(fetch_text(MUNICIPAL_QUERY, "application/json,*/*;q=0.5"))
    by_code: dict[str, dict[str, str]] = {}
    for feature in payload.get("features", []):
        attrs = feature.get("attributes") or {}
        code = str(attrs.get("MUN_CODE") or "").strip()
        name = str(attrs.get("NAME") or "").strip()
        county = str(attrs.get("COUNTY") or "").strip()
        if not (re.fullmatch(r"\d{4}", code) and name and county):
            continue
        by_code[code] = {"municipality_code": code, "municipality_label": name, "county": county}
    rows = [by_code[k] for k in sorted(by_code)]
    if len(rows) != 564:
        raise RuntimeError(f"Expected 564 unique NJ municipality codes; statewide layer returned {len(rows)}")
    return rows


def clean_label(raw: str) -> str:
    return " ".join(html.unescape(TAG_RE.sub(" ", raw)).split())


def directory_candidates(module) -> list[dict[str, str]]:
    page = fetch_text(module.LOCAL_GOV)
    out: list[dict[str, str]] = []
    for href, raw_label, tail in ANCHOR_RE.findall(page):
        label = clean_label(raw_label)
        if not label or module.EXCLUDE_LABEL.search(label):
            continue
        url = urllib.parse.urljoin(module.LOCAL_GOV, html.unescape(href))
        host = module.normalize_host(url)
        if not host or host.endswith("nj.gov"):
            continue
        hint = COUNTY_HINT_RE.search(html.unescape(tail or ""))
        out.append({"municipality_label":label,"municipality_key":module.normalize_municipality(label),"county_hint":(hint.group(1).strip() if hint else ""),"root_url":url,"host":host})
    return out


def canonical_rows(module) -> list[dict[str, str]]:
    candidates = directory_candidates(module)
    by_key: dict[str, list[dict[str, str]]] = {}
    for row in candidates: by_key.setdefault(row["municipality_key"], []).append(row)
    rows: list[dict[str, str]] = []
    for entity in canonical_entities():
        key = module.normalize_municipality(entity["municipality_label"])
        options = by_key.get(key, [])
        county = entity["county"].lower()
        county_matches = [x for x in options if x.get("county_hint", "").lower() == county]
        pool = county_matches or (options if len(options) == 1 else [])
        pool = sorted(pool, key=lambda r: (0 if r["root_url"].startswith("https://") else 1, len(r["root_url"])))
        chosen = pool[0] if pool else None
        rows.append({**entity,"municipality_key":key,"root_url":chosen["root_url"] if chosen else "","host":chosen["host"] if chosen else "","directory_source":module.LOCAL_GOV,"canonical_source":MUNICIPAL_QUERY})
    return rows


def wipp_supported(code: str) -> tuple[bool, str]:
    if not re.fullmatch(r"\d{4}", code or ""):
        return False, ""
    req = urllib.request.Request(
        WIPP_METADATA.format(code=urllib.parse.quote(code)),
        headers={"User-Agent": UA, "Accept": "application/json", "X-Wipp-Id": code},
    )
    try:
        with urllib.request.urlopen(req, timeout=7) as response:
            if int(response.status) != 200:
                return False, ""
            payload = json.loads(response.read(500_000).decode("utf-8", errors="replace"))
            label = str(payload.get("cityName") or payload.get("municipality") or "").strip()
            return bool(payload), label
    except Exception:
        return False, ""


def install_wipp_probe(module) -> None:
    original = module.crawl_one
    def crawl_with_wipp(row, legal_index, max_pages):
        result = original(row, legal_index, max_pages)
        code = str(row.get("municipality_code") or "").strip()
        supported, provider_city = wipp_supported(code)
        if not supported:
            return result
        providers = list(result.get("external_providers") or [])
        if not any(str(p.get("provider_key") or "") == "edmunds_wipp" for p in providers):
            providers.append({
                "provider_key":"edmunds_wipp",
                "provider_label":"Edmunds GovTech / WIPP",
                "families":["tax_collector","water_sewer"],
                "public_search_modes":["address","block_lot","account","owner_name"],
                "adapter_status":"live",
                "url":WIPP_PORTAL,
                "label":"Public property tax / utility account lookup",
                "discovered_from":WIPP_METADATA.format(code=code),
                "metadata_probe":True,
                "provider_municipality":provider_city or None,
            })
        result["external_providers"] = sorted(providers, key=lambda x:(str(x.get("provider_key") or ""),str(x.get("url") or "")))
        result["wipp_metadata_supported"] = True
        result["wipp_provider_municipality"] = provider_city or None
        return result
    module.crawl_one = crawl_with_wipp


def main() -> int:
    module = load_discovery()
    module.MUNICIPAL_LAYER = MUNICIPAL_QUERY
    module.canonical_rows = lambda: canonical_rows(module)
    # Precise synonyms only: discovering a source is still not proof of a requirement.
    module.FAMILIES["certificate_of_occupancy"] = tuple(dict.fromkeys(EXPANDED_OCCUPANCY_TERMS))
    install_wipp_probe(module)
    return int(module.main())


if __name__ == "__main__":
    raise SystemExit(main())
