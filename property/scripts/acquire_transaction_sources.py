#!/usr/bin/env python3
"""Acquire public NJ transaction-evidence sources without bypassing access controls.

Downloads public statewide files, resolves publisher-maintained download links,
paginates public Socrata data, and records credentialed/paid sources as blocked
inputs instead of scraping around authentication, CAPTCHA, or premium access.

Raw downloads are intentionally written outside the repository by default.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html.parser
import json
import pathlib
import sys
import urllib.parse
import urllib.request
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "property/data/transaction-acquisition-sources.json"
DEFAULT_OUT = ROOT / ".cache/transaction-sources"
UA = "Watchdog-transaction-source-acquirer/1.0 (+https://www.watchdogindex.com/)"


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def request(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})


def read_url(url: str, timeout: int = 90) -> tuple[bytes, dict[str, str], int]:
    with urllib.request.urlopen(request(url), timeout=timeout) as r:
        return r.read(), dict(r.headers.items()), int(r.status)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class LinkParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        self._href = dict(attrs).get("href")
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href is not None:
            self.links.append((" ".join("".join(self._text).split()), self._href))
            self._href = None
            self._text = []


def save_bytes(out_dir: pathlib.Path, filename: str, data: bytes) -> pathlib.Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / filename
    path.write_bytes(data)
    return path


def direct(item: dict[str, Any], out_dir: pathlib.Path) -> dict[str, Any]:
    data, headers, status = read_url(item["url"])
    path = save_bytes(out_dir, item.get("filename") or pathlib.Path(urllib.parse.urlparse(item["url"]).path).name, data)
    return {
        "status": "downloaded", "http_status": status, "path": str(path),
        "bytes": len(data), "sha256": sha256(data),
        "etag": headers.get("ETag"), "last_modified": headers.get("Last-Modified"),
        "resolved_url": item["url"],
    }


def discover_link(item: dict[str, Any], out_dir: pathlib.Path) -> dict[str, Any]:
    page, _, status = read_url(item["index_url"])
    parser = LinkParser()
    parser.feed(page.decode("utf-8", errors="replace"))
    wanted = " ".join(str(item["link_text"]).lower().split())
    hit: tuple[str, str] | None = None
    for text, href in parser.links:
        normalized = " ".join(text.lower().split())
        if normalized == wanted or wanted in normalized:
            hit = (text, href)
            break
    if not hit:
        return {"status": "error", "http_status": status, "error": f"link text not found: {item['link_text']}"}
    target = urllib.parse.urljoin(item["index_url"], hit[1])
    data, headers, target_status = read_url(target)
    suffix = pathlib.Path(urllib.parse.urlparse(target).path).suffix
    filename = item.get("filename", item["id"]) + (suffix if suffix else ".dat")
    path = save_bytes(out_dir, filename, data)
    return {
        "status": "downloaded", "http_status": target_status, "path": str(path),
        "bytes": len(data), "sha256": sha256(data), "resolved_url": target,
        "etag": headers.get("ETag"), "last_modified": headers.get("Last-Modified"),
    }


def socrata(item: dict[str, Any], out_dir: pathlib.Path, max_rows: int | None) -> dict[str, Any]:
    page_size = int(item.get("page_size") or 50000)
    offset = 0
    count = 0
    path = out_dir / item.get("filename", f"{item['id']}.ndjson")
    out_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with path.open("w", encoding="utf-8") as f:
        while True:
            limit = page_size if max_rows is None else min(page_size, max_rows - count)
            if limit <= 0:
                break
            params = urllib.parse.urlencode({"$limit": limit, "$offset": offset})
            url = item["url"] + ("&" if "?" in item["url"] else "?") + params
            data, _, status = read_url(url, timeout=120)
            if status != 200:
                return {"status": "error", "http_status": status, "path": str(path), "rows": count}
            rows = json.loads(data.decode("utf-8"))
            if not isinstance(rows, list):
                return {"status": "error", "error": "Socrata response was not a list", "path": str(path), "rows": count}
            for row in rows:
                line = json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
                f.write(line)
                digest.update(line.encode("utf-8"))
                count += 1
            if len(rows) < limit:
                break
            offset += len(rows)
    return {"status": "downloaded", "http_status": 200, "path": str(path), "rows": count, "sha256": digest.hexdigest(), "resolved_url": item["url"]}


def directory(item: dict[str, Any], out_dir: pathlib.Path) -> dict[str, Any]:
    return direct({**item, "url": item["url"], "filename": item.get("filename", item["id"] + ".html")}, out_dir)


def acquire(item: dict[str, Any], out_dir: pathlib.Path, max_rows: int | None) -> dict[str, Any]:
    mode = item.get("mode")
    if mode == "direct":
        return direct(item, out_dir)
    if mode == "discover_link":
        return discover_link(item, out_dir)
    if mode == "socrata":
        return socrata(item, out_dir, max_rows)
    if mode == "directory":
        return directory(item, out_dir)
    if mode in {"credentialed_or_paid", "service"}:
        return {
            "status": "not_downloaded",
            "reason": "credentialed/paid/service source; use authorized connector or query at runtime",
            "resolved_url": item.get("bulk_url") or item.get("service_url") or item.get("url"),
        }
    return {"status": "not_downloaded", "reason": f"unsupported mode: {mode}"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    parser.add_argument("--source", action="append", help="Acquire only this source id; repeatable")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--max-socrata-rows", type=int, default=None, help="Testing cap; omit for full public dataset")
    parser.add_argument("--report", type=pathlib.Path, default=None)
    args = parser.parse_args()

    manifest = load_manifest()
    sources = manifest.get("sources", [])
    if args.source:
        wanted = set(args.source)
        sources = [s for s in sources if s.get("id") in wanted]
    if args.list:
        for s in sources:
            print(f"{s['id']}\t{s.get('mode')}\t{s.get('url') or s.get('index_url')}")
        return 0

    results: list[dict[str, Any]] = []
    for item in sources:
        started = utcnow()
        try:
            result = acquire(item, args.out / item["id"], args.max_socrata_rows)
        except Exception as exc:
            result = {"status": "error", "error": f"{type(exc).__name__}: {exc}"}
        results.append({"id": item["id"], "label": item.get("label"), "mode": item.get("mode"), "started_at": started, "finished_at": utcnow(), **result})
        print(json.dumps(results[-1], ensure_ascii=False))

    report = {
        "schema_version": 1,
        "generated_at": utcnow(),
        "manifest": str(MANIFEST),
        "output_dir": str(args.out),
        "results": results,
        "summary": {
            "downloaded": sum(r.get("status") == "downloaded" for r in results),
            "not_downloaded": sum(r.get("status") == "not_downloaded" for r in results),
            "errors": sum(r.get("status") == "error" for r in results),
        },
    }
    report_path = args.report or (args.out / "acquisition-report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 1 if report["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
