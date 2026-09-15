#!/usr/bin/env python3
"""Discover NJ municipal closing-evidence source pages from public government directories.

This crawler is deliberately conservative. It inventories candidate official pages
for transaction evidence and never converts a keyword match into a legal/clearance
claim. Results are intended for Watchdog source review and registry ingestion.
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
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / ".cache/transaction-sources/municipal-discovery.json"
LOCAL_GOV = "https://www.nj.gov/nj/gov/county/localgov.shtml"
LEGAL_NOTICES = "https://www.nj.gov/state/statewide-legal-notices-list.shtml"
UA = "Watchdog-municipal-source-discovery/1.0 (+https://www.watchdogindex.com/)"

EXCLUDE_LABEL = re.compile(r"\b(county|police|fire department|emergency|sheriff|school|library|authority|commission|college|university)\b", re.I)
FAMILIES: dict[str, tuple[str, ...]] = {
    "certificate_of_occupancy": ("certificate of occupancy", "continued certificate", "cco", "resale inspection", "resale certificate", "occupancy inspection"),
    "smoke_co_fire": ("smoke", "carbon monoxide", "fire certificate", "fire inspection", "resale fire"),
    "tax_collector": ("tax collector", "tax office", "property tax", "tax bill", "tax payment"),
    "tax_sale_delinquency": ("tax sale", "delinquent tax", "delinquency", "tax lien sale"),
    "water_sewer": ("water sewer", "water / sewer", "sewer", "utility billing", "water billing", "final reading"),
    "construction_permits": ("construction office", "construction department", "building permits", "construction permits", "ucc permits"),
    "code_violations": ("code enforcement", "property maintenance", "housing inspection", "violations"),
    "legal_notices": ("legal notices", "public notices", "notices"),
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def req(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"})


def fetch(url: str, timeout: int = 20, max_bytes: int = 2_000_000) -> tuple[str, str | None, int]:
    with urllib.request.urlopen(req(url), timeout=timeout) as r:
        ctype = (r.headers.get("Content-Type") or "").lower()
        if "html" not in ctype and "xml" not in ctype and not url.lower().endswith((".html", ".htm", ".xml", "/")):
            return "", ctype, int(r.status)
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
    p = Links(); p.feed(text)
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for label, href in p.links:
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        url = urllib.parse.urljoin(base, href)
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url); out.append((label, url))
    return out


def normalize_host(url: str) -> str:
    h = urllib.parse.urlparse(url).hostname or ""
    return h.lower().removeprefix("www.")


def likely_municipal_roots() -> list[dict[str, str]]:
    page, _, _ = fetch(LOCAL_GOV, timeout=30)
    rows = []
    seen = set()
    for label, url in links_from(LOCAL_GOV, page):
        label = label.strip()
        if not label or EXCLUDE_LABEL.search(label):
            continue
        host = normalize_host(url)
        if not host or host.endswith("nj.gov") or host in seen:
            continue
        seen.add(host)
        rows.append({"municipality_label": label, "root_url": url, "host": host, "directory_source": LOCAL_GOV})
    return rows


def legal_notice_links() -> list[tuple[str, str]]:
    try:
        page, _, _ = fetch(LEGAL_NOTICES, timeout=30)
        return links_from(LEGAL_NOTICES, page)
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


def same_site(seed: str, url: str) -> bool:
    a, b = normalize_host(seed), normalize_host(url)
    return bool(a and b and (a == b or a.endswith("." + b) or b.endswith("." + a)))


def crawl_one(row: dict[str, str], legal_index: list[tuple[str, str]], max_pages: int) -> dict[str, Any]:
    root = row["root_url"]
    result: dict[str, Any] = {**row, "checked_at": now(), "status": "ok", "candidates": {}, "errors": []}
    candidates: dict[str, list[dict[str, Any]]] = defaultdict(list)
    queue: list[tuple[str, int]] = [(root, 0)]
    visited: set[str] = set()

    # Strong independent source: public-entity submitted legal-notice link.
    name_tokens = [x for x in re.split(r"\W+", row["municipality_label"].lower()) if len(x) > 3 and x not in {"township", "borough", "city", "town", "village"}]
    for label, url in legal_index:
        hay = (label + " " + url).lower()
        if name_tokens and all(t in hay for t in name_tokens[:2]):
            candidates["legal_notices"].append({"label": label or "Legal notices", "url": url, "score": 10, "found_by": "NJ Department of State statewide legal-notice directory"})

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
            if not same_site(root, href):
                continue
            scores = score_candidate(label, href)
            for family, score in scores.items():
                candidates[family].append({"label": label or href, "url": href, "score": score + (1 if depth == 0 else 0), "found_by": f"same-site link depth {depth}"})
            if depth < 1 and (scores or any(k in (label + " " + href).lower() for k in ("department", "services", "forms", "documents", "government"))):
                queue.append((href, depth + 1))

    # Sitemap is useful for CivicPlus and other municipal CMS sites where forms are not linked from home.
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
                    candidates[family].append({"label": href.rsplit("/", 1)[-1] or family, "url": href, "score": score, "found_by": "sitemap"})
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
    result["pages_checked"] = len(visited)
    result["coverage"] = {family: bool(compact.get(family)) for family in FAMILIES}
    result["fingerprint"] = hashlib.sha256(json.dumps(compact, sort_keys=True).encode()).hexdigest()
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=pathlib.Path, default=OUT)
    ap.add_argument("--limit", type=int, default=None, help="Only first N roots; useful for tests")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-pages-per-site", type=int, default=12)
    args = ap.parse_args()
    started = now()
    roots = likely_municipal_roots()
    if args.limit:
        roots = roots[: max(0, args.limit)]
    legal = legal_notice_links()
    results: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as pool:
        futures = [pool.submit(crawl_one, r, legal, max(2, args.max_pages_per_site)) for r in roots]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda x: x["municipality_label"].lower())
    report = {
        "schema_version": 1,
        "generated_at": now(),
        "started_at": started,
        "policy": "Discovery only. Candidate URL != verified requirement or clearance result.",
        "directory_sources": [LOCAL_GOV, LEGAL_NOTICES],
        "root_count": len(roots),
        "results": results,
        "coverage_summary": {family: sum(bool(r.get("candidates", {}).get(family)) for r in results) for family in FAMILIES},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"roots": len(roots), "output": str(args.out), "coverage": report["coverage_summary"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
