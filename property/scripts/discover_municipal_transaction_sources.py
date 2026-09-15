#!/usr/bin/env python3
"""Discover NJ municipal transaction-evidence sources for all 564 municipalities.

The registry is canonical against NJ's statewide municipality layer, then enriches
those municipalities with official/local-government web roots and provider links.
Candidate URLs are discovery evidence only. They are never treated as a balance,
clearance, requirement, or legal conclusion until a governed adapter/search runs.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html.parser
import json
import pathlib
import re
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / ".cache/transaction-sources/municipal-discovery.json"
LOCAL_GOV = "https://www.nj.gov/nj/gov/county/localgov.shtml"
LEGAL_NOTICES = "https://www.nj.gov/state/statewide-legal-notices-list.shtml"
MUNICIPAL_LAYER = (
    "https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/"
    "MapServer/2/query?where=1%3D1&outFields=NAME&returnGeometry=false&f=json"
)
UA = "Watchdog-municipal-source-discovery/2.0 (+https://www.watchdogindex.com/)"

EXCLUDE_LABEL = re.compile(
    r"\b(county|police|fire department|emergency|sheriff|school|library|authority|commission|college|university)\b",
    re.I,
)
FAMILIES: dict[str, tuple[str, ...]] = {
    "certificate_of_occupancy": (
        "certificate of occupancy", "continued certificate", "cco", "resale inspection",
        "resale certificate", "occupancy inspection",
    ),
    "smoke_co_fire": ("smoke", "carbon monoxide", "fire certificate", "fire inspection", "resale fire"),
    "tax_collector": ("tax collector", "tax office", "property tax", "tax bill", "tax payment"),
    "tax_sale_delinquency": ("tax sale", "delinquent tax", "delinquency", "tax lien sale"),
    "water_sewer": (
        "water sewer", "water / sewer", "water/sewer", "sewer", "utility billing",
        "water billing", "final reading", "utility payment",
    ),
    "construction_permits": ("construction office", "construction department", "building permits", "construction permits", "ucc permits"),
    "code_violations": ("code enforcement", "property maintenance", "housing inspection", "violations"),
    "legal_notices": ("legal notices", "public notices", "notices"),
}

# Provider identification is intentionally host/path based and does not imply that
# Watchdog is authorized to automate the provider. `adapter_status` is the contract.
KNOWN_PROVIDERS: tuple[dict[str, Any], ...] = (
    {
        "provider_key": "edmunds_wipp",
        "host_contains": ("wipp.edmundsassoc.com", "edmundsassoc.com", "edmundsgovtech.com"),
        "label": "Edmunds GovTech / WIPP",
        "families": ("tax_collector", "water_sewer"),
        "public_search_modes": ("address", "block_lot", "account", "owner_name"),
        "adapter_status": "discovered_not_yet_governed",
    },
    {
        "provider_key": "munidex",
        "host_contains": ("tax.munidex.info", "munidex.info", "munidex.com"),
        "label": "Munidex",
        "families": ("tax_collector", "water_sewer"),
        "public_search_modes": ("address", "block_lot", "account", "owner_name"),
        "adapter_status": "discovered_not_yet_governed",
    },
)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def req(url: str, accept: str = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5") -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})


def fetch(url: str, timeout: int = 20, max_bytes: int = 2_000_000) -> tuple[str, str | None, int]:
    with urllib.request.urlopen(req(url), timeout=timeout) as r:
        ctype = (r.headers.get("Content-Type") or "").lower()
        body = r.read(max_bytes)
        return body.decode("utf-8", errors="replace"), ctype, int(r.status)


class Links(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._txt: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "a":
            self._href = dict(attrs).get("href")
            self._txt = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._txt.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href is not None:
            text = " ".join("".join(self._txt).split())
            self.links.append((text, self._href))
            self._href = None
            self._txt = []


def links_from(base: str, text: str) -> list[tuple[str, str]]:
    p = Links()
    p.feed(text)
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for label, href in p.links:
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        url = urllib.parse.urljoin(base, href)
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        out.append((label, url))
    return out


def normalize_host(url: str) -> str:
    return (urllib.parse.urlparse(url).hostname or "").lower().removeprefix("www.")


def normalize_municipality(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", value.lower())
    replacements = {
        " township ": " ", " twp ": " ", " borough ": " ", " boro ": " ",
        " city ": " ", " town ": " ", " village ": " ",
    }
    text = f" {text.strip()} "
    for old, new in replacements.items():
        text = text.replace(old, new)
    return " ".join(text.split())


def canonical_municipalities() -> list[str]:
    raw, _, status = fetch(MUNICIPAL_LAYER, timeout=30, max_bytes=5_000_000)
    if status != 200:
        raise RuntimeError(f"NJ municipal layer returned HTTP {status}")
    payload = json.loads(raw)
    names = sorted(
        {
            str(feature.get("attributes", {}).get("NAME") or "").strip()
            for feature in payload.get("features", [])
            if str(feature.get("attributes", {}).get("NAME") or "").strip()
        },
        key=str.lower,
    )
    if len(names) != 564:
        raise RuntimeError(f"Expected 564 NJ municipalities; statewide layer returned {len(names)}")
    return names


def municipal_directory_roots() -> list[dict[str, str]]:
    page, _, status = fetch(LOCAL_GOV, timeout=30, max_bytes=5_000_000)
    if status != 200:
        raise RuntimeError(f"NJ local-government directory returned HTTP {status}")
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for label, url in links_from(LOCAL_GOV, page):
        label = label.strip()
        if not label or EXCLUDE_LABEL.search(label):
            continue
        host = normalize_host(url)
        if not host or host.endswith("nj.gov"):
            continue
        key = (normalize_municipality(label), url)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "municipality_label": label,
                "municipality_key": normalize_municipality(label),
                "root_url": url,
                "host": host,
                "directory_source": LOCAL_GOV,
            }
        )
    return rows


def canonical_rows() -> list[dict[str, str]]:
    roots = municipal_directory_roots()
    by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in roots:
        by_key[row["municipality_key"]].append(row)

    rows: list[dict[str, str]] = []
    for municipality in canonical_municipalities():
        key = normalize_municipality(municipality)
        candidates = by_key.get(key, [])
        # Prefer HTTPS and shortest URL for deterministic matching if NJ lists duplicates.
        candidates.sort(key=lambda r: (0 if r["root_url"].startswith("https://") else 1, len(r["root_url"])))
        chosen = candidates[0] if candidates else None
        rows.append(
            {
                "municipality_label": municipality,
                "municipality_key": key,
                "root_url": chosen["root_url"] if chosen else "",
                "host": chosen["host"] if chosen else "",
                "directory_source": LOCAL_GOV,
                "canonical_source": MUNICIPAL_LAYER,
            }
        )
    return rows


def legal_notice_links() -> list[tuple[str, str]]:
    try:
        page, _, status = fetch(LEGAL_NOTICES, timeout=30)
        return links_from(LEGAL_NOTICES, page) if status == 200 else []
    except Exception:
        return []


def score_candidate(label: str, url: str) -> dict[str, int]:
    hay = (label + " " + urllib.parse.unquote(url)).lower().replace("-", " ").replace("_", " ")
    scores: dict[str, int] = {}
    for family, words in FAMILIES.items():
        best = 0
        for word in words:
            if word in hay:
                best = max(best, 6 if word in label.lower() else 4)
        if best:
            scores[family] = best
    return scores


def provider_for(url: str) -> dict[str, Any] | None:
    host = normalize_host(url)
    for provider in KNOWN_PROVIDERS:
        if any(token in host for token in provider["host_contains"]):
            return {
                "provider_key": provider["provider_key"],
                "provider_label": provider["label"],
                "families": list(provider["families"]),
                "public_search_modes": list(provider["public_search_modes"]),
                "adapter_status": provider["adapter_status"],
            }
    return None


def same_site(seed: str, url: str) -> bool:
    a, b = normalize_host(seed), normalize_host(url)
    return bool(a and b and (a == b or a.endswith("." + b) or b.endswith("." + a)))


def candidate_record(label: str, url: str, score: int, found_by: str) -> dict[str, Any]:
    record: dict[str, Any] = {"label": label or url, "url": url, "score": score, "found_by": found_by}
    provider = provider_for(url)
    if provider:
        record["provider"] = provider
    return record


def crawl_one(row: dict[str, str], legal_index: list[tuple[str, str]], max_pages: int) -> dict[str, Any]:
    root = row["root_url"]
    result: dict[str, Any] = {
        **row,
        "checked_at": now(),
        "status": "ok" if root else "official_web_root_not_resolved",
        "candidates": {},
        "external_providers": [],
        "errors": [],
    }
    candidates: dict[str, list[dict[str, Any]]] = defaultdict(list)
    external_providers: dict[str, dict[str, Any]] = {}

    name_tokens = [
        x for x in re.split(r"\W+", row["municipality_label"].lower())
        if len(x) > 3 and x not in {"township", "borough", "city", "town", "village"}
    ]
    for label, url in legal_index:
        hay = (label + " " + url).lower()
        if name_tokens and all(t in hay for t in name_tokens[:2]):
            candidates["legal_notices"].append(
                candidate_record(label or "Legal notices", url, 10, "NJ Department of State statewide legal-notice directory")
            )

    if not root:
        result["candidates"] = dict(candidates)
        result["coverage"] = {family: bool(candidates.get(family)) for family in FAMILIES}
        result["pages_checked"] = 0
        result["fingerprint"] = hashlib.sha256(json.dumps(result["candidates"], sort_keys=True).encode()).hexdigest()
        return result

    queue: list[tuple[str, int]] = [(root, 0)]
    visited: set[str] = set()

    while queue and len(visited) < max_pages:
        url, depth = queue.pop(0)
        if url in visited or not same_site(root, url):
            continue
        visited.add(url)
        try:
            text, _, status = fetch(url)
            if status != 200 or not text:
                continue
        except Exception as exc:
            result["errors"].append({"url": url, "error": str(exc)[:240]})
            continue

        for label, href in links_from(url, text):
            scores = score_candidate(label, href)
            is_local = same_site(root, href)
            provider = provider_for(href)

            # Trusted provider links are allowed to leave the municipal host because that
            # is how many NJ towns expose tax/utility lookup (e.g. WIPP and Munidex).
            if provider and not is_local:
                provider_key = provider["provider_key"] + "|" + href
                external_providers[provider_key] = {
                    **provider,
                    "url": href,
                    "label": label or provider["provider_label"],
                    "discovered_from": url,
                }
                for family in provider["families"]:
                    candidates[family].append(
                        candidate_record(label or provider["provider_label"], href, 11, "official municipal link to known external provider")
                    )
                continue

            # Preserve unknown external payment/lookup links for review without treating
            # them as an automated provider.
            if not is_local:
                if any(family in scores for family in ("tax_collector", "water_sewer", "tax_sale_delinquency")):
                    key = "unclassified|" + href
                    external_providers[key] = {
                        "provider_key": "unclassified_external",
                        "provider_label": normalize_host(href) or "External municipal provider",
                        "families": sorted(scores),
                        "public_search_modes": [],
                        "adapter_status": "review_required",
                        "url": href,
                        "label": label or href,
                        "discovered_from": url,
                    }
                continue

            for family, score in scores.items():
                candidates[family].append(candidate_record(label or href, href, score + (1 if depth == 0 else 0), f"same-site link depth {depth}"))
            if depth < 1 and (
                scores or any(k in (label + " " + href).lower() for k in ("department", "services", "forms", "documents", "government"))
            ):
                queue.append((href, depth + 1))

    for sitemap in (urllib.parse.urljoin(root, "/sitemap.xml"), urllib.parse.urljoin(root, "/sitemap_index.xml")):
        try:
            text, _, status = fetch(sitemap, timeout=12)
            if status != 200 or not text:
                continue
            urls = re.findall(r"<loc>\s*([^<]+)\s*</loc>", text, flags=re.I)
            for href in urls[:5000]:
                if not same_site(root, href):
                    continue
                scores = score_candidate("", href)
                for family, score in scores.items():
                    candidates[family].append(candidate_record(href.rsplit("/", 1)[-1] or family, href, score, "sitemap"))
        except Exception:
            pass

    compact: dict[str, list[dict[str, Any]]] = {}
    for family, values in candidates.items():
        unique: dict[str, dict[str, Any]] = {}
        for value in values:
            u = value["url"]
            if u not in unique or value["score"] > unique[u]["score"]:
                unique[u] = value
        compact[family] = sorted(unique.values(), key=lambda x: (-x["score"], len(x["url"])))[:8]

    result["candidates"] = compact
    result["external_providers"] = sorted(external_providers.values(), key=lambda x: (x["provider_key"], x["url"]))
    result["pages_checked"] = len(visited)
    result["coverage"] = {family: bool(compact.get(family)) for family in FAMILIES}
    result["fingerprint"] = hashlib.sha256(
        json.dumps({"candidates": compact, "external_providers": result["external_providers"]}, sort_keys=True).encode()
    ).hexdigest()
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=pathlib.Path, default=OUT)
    ap.add_argument("--limit", type=int, default=None, help="Only first N canonical municipalities; useful for tests")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages-per-site", type=int, default=12)
    args = ap.parse_args()

    started = now()
    rows = canonical_rows()
    if args.limit:
        rows = rows[: max(0, args.limit)]
    legal = legal_notice_links()
    results: list[dict[str, Any]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as pool:
        futures = [pool.submit(crawl_one, row, legal, max(2, args.max_pages_per_site)) for row in rows]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda x: x["municipality_label"].lower())

    provider_counts = Counter(
        provider.get("provider_key", "unknown")
        for result in results
        for provider in result.get("external_providers", [])
    )
    report = {
        "schema_version": 2,
        "generated_at": now(),
        "started_at": started,
        "policy": (
            "Canonical statewide discovery only. Candidate/provider URL != verified balance, requirement, "
            "clearance, or no-record result. A governed provider adapter must complete the search first."
        ),
        "directory_sources": [MUNICIPAL_LAYER, LOCAL_GOV, LEGAL_NOTICES],
        "canonical_municipality_count": len(rows),
        "official_web_root_resolved": sum(bool(r.get("root_url")) for r in results),
        "official_web_root_missing": sum(not bool(r.get("root_url")) for r in results),
        "results": results,
        "coverage_summary": {family: sum(bool(r.get("candidates", {}).get(family)) for r in results) for family in FAMILIES},
        "provider_summary": dict(sorted(provider_counts.items())),
    }
    if args.limit is None and len(rows) != 564:
        raise RuntimeError(f"Statewide discovery must contain all 564 NJ municipalities; got {len(rows)}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "municipalities": len(rows),
                "official_roots": report["official_web_root_resolved"],
                "providers": report["provider_summary"],
                "output": str(args.out),
                "coverage": report["coverage_summary"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
