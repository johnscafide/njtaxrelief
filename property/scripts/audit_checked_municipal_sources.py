#!/usr/bin/env python3
"""Weekly check that published CO and fire certificate data still matches its sources.

Every checked town (property/data/municipal-requirements/checked/*.json) cites a source page
and an exact quote for each fee and each piece of evidence. This re-opens those pages and
looks for the same quote. A town is flagged when a quote that was verified at publish time
is no longer on its page, or a cited page is gone (404/410).

Pages built by JavaScript (town code libraries, online forms), search snippets and state
directory rows can't be read by a script, so they are counted as unchecked, not flagged.
The full re-research rotation covers those.

Usage:
  audit_checked_municipal_sources.py [--codes 1352 1413] [--out report.json] [--summary report.md]
  audit_checked_municipal_sources.py --self-test
"""
from __future__ import annotations

import argparse
import html
import io
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[2]
CHECKED = ROOT / "property/data/municipal-requirements/checked"
JS_HOSTS = re.compile(r"municode\.com|ecode360\.com|govpilot\.com|cloudpermit|sdlportal|spatialest|opengov|viewpointcloud", re.I)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", html.unescape(s or ""))
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"[‐-―]", "-", s)
    s = re.sub(r"[^0-9a-z$%.]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def page_text(body: bytes, content_type: str) -> str | None:
    """Normalized text of a fetched page, or None when it has no readable text (scanned PDF)."""
    if body[:5] == b"%PDF-" or "pdf" in content_type:
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(body)
            f.flush()
            runs = [subprocess.run(["pdftotext", *flags, f.name, "-"], capture_output=True, timeout=90).stdout.decode("utf8", "ignore")
                    for flags in (["-layout"], [])]
        text = " ".join(runs)
        return norm(text) if text.strip() else None
    if body[:2] == b"PK":  # Word file: read its document text; other zip files can't be checked
        try:
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                xml = z.read("word/document.xml").decode("utf8", "ignore")
        except (KeyError, zipfile.BadZipFile):
            return None
        return norm(re.sub(r"<[^>]+>", " ", re.sub(r"</w:p>", " ", xml)))
    if b"\x00" in body[:2048]:  # other binary files (images, old .doc)
        return None
    t = body.decode("utf8", "ignore")
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    return norm(t)


def fetch(url: str) -> dict:
    """{"state": "ok" | "gone" | "unreachable", "text": normalized text or None}"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=45) as r:
            return {"state": "ok", "text": page_text(r.read(), r.headers.get("content-type", ""))}
    except urllib.error.HTTPError as e:
        return {"state": "gone" if e.code in (404, 410) else "unreachable", "text": None, "http": e.code}
    except Exception as e:  # DNS, timeouts, TLS, bot walls
        return {"state": "unreachable", "text": None, "error": type(e).__name__}


def quote_on_page(quote: str, page: str) -> bool:
    if norm(quote) in page:
        return True
    parts = [norm(p) for p in re.split(r"\.\.\.|…", quote) if norm(p)]
    if len(parts) > 1 and all(p in page for p in parts):
        return True
    # PDF text often splits words ("re ce ive d") or drops spaces: compare without spaces
    flat = page.replace(" ", "")
    if all(p.replace(" ", "") in flat for p in parts or [norm(quote)]):
        return True
    # table rows come out of PDFs in a different order: accept when every dollar amount in the
    # quote is on the page and nearly all of its words are too
    words = norm(quote).split()
    have = set(page.split())
    money = [w for w in words if "$" in w]
    return bool(money) and all(m in have for m in money) and sum(w in have for w in words) >= 0.9 * len(words)


def items_of(r: dict) -> list[dict]:
    """Every quoted fee and evidence line in a checked town file."""
    out = []
    groups = [("town certificate", r.get("resale_co") or {})]
    groups += [(a.get("name") or "fire certificate", a) for a in (r.get("fire_cert") or {}).get("authorities") or []]
    for label, g in groups:
        for f in g.get("fees") or []:
            out.append({"kind": "fee", "where": label, "item": f.get("item") or "", "amount": f.get("amount") or "",
                        "quote": f.get("quote") or "", "url": f.get("source_url") or "", "via": "", "was_ok": f.get("verified") is True})
        for e in g.get("evidence") or []:
            out.append({"kind": "evidence", "where": label, "item": "", "amount": "", "quote": e.get("quote") or "",
                        "url": e.get("url") or "", "via": e.get("via") or "", "was_ok": e.get("verified") is True})
    return out


def judge(it: dict, page: dict | None) -> str:
    """ok | changed | gone | unchecked"""
    if not it["quote"] or not it["url"] or it["via"] in ("search_snippet", "state_directory"):
        return "unchecked"
    if page is None or page["state"] == "unreachable":
        return "unchecked"
    if page["state"] == "gone":
        return "gone" if it["was_ok"] else "unchecked"
    text = page["text"]
    if text is None:
        return "unchecked"
    if quote_on_page(it["quote"], text):
        return "ok"
    if JS_HOSTS.search(it["url"]) or len(text) < 1500 or not it["was_ok"]:
        return "unchecked"
    return "changed"


def audit(codes: list[str] | None, fetcher=fetch, workers: int = 8) -> dict:
    towns = []
    for p in sorted(CHECKED.glob("*.json")):
        if codes and p.stem not in codes:
            continue
        r = json.loads(p.read_text())
        towns.append({"code": p.stem, "town": r.get("municipality") or "", "county": r.get("county") or "", "items": items_of(r)})
    urls = sorted({it["url"] for t in towns for it in t["items"]
                   if it["url"].startswith("http") and it["via"] not in ("search_snippet", "state_directory")})
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pages = dict(zip(urls, pool.map(fetcher, urls)))
    flagged, totals = [], {"ok": 0, "changed": 0, "gone": 0, "unchecked": 0}
    for t in towns:
        problems = []
        for it in t["items"]:
            v = judge(it, pages.get(it["url"]))
            totals[v] += 1
            if v in ("changed", "gone"):
                problems.append({"status": v, "kind": it["kind"], "where": it["where"], "item": it["item"],
                                 "amount": it["amount"], "quote": it["quote"], "url": it["url"]})
        if problems:
            flagged.append({"code": t["code"], "town": t["town"], "county": t["county"], "problems": problems})
    flagged.sort(key=lambda t: (-sum(p["kind"] == "fee" for p in t["problems"]), t["county"], t["town"]))
    return {"checked_on": date.today().isoformat(), "towns": len(towns), "pages": len(urls), "items": totals,
            "flagged": flagged}


def summary_md(rep: dict) -> str:
    it = rep["items"]
    lines = [f"# CO source check, {rep['checked_on']}", "",
             f"{rep['towns']} towns, {rep['pages']} source pages. Quotes still found: {it['ok']}. "
             f"Changed: {it['changed']}. Page gone: {it['gone']}. Can't be checked by script: {it['unchecked']}.", ""]
    if not rep["flagged"]:
        lines.append("No town needs a re-check this week.")
    else:
        lines += [f"## {len(rep['flagged'])} towns to re-check", ""]
        for t in rep["flagged"]:
            fees = sum(p["kind"] == "fee" for p in t["problems"])
            lines.append(f"- **{t['town']}** ({t['county'].title()}, {t['code']}): {fees} fee(s), {len(t['problems']) - fees} other quote(s)")
            for p in t["problems"][:4]:
                what = f"{p['item']} {p['amount']}".strip() or p["quote"][:80]
                lines.append(f"  - {'page gone' if p['status'] == 'gone' else 'not on page'}: {what} ({p['url']})")
    return "\n".join(lines) + "\n"


def self_test() -> int:
    page = norm("<p>Resale CCO fee: $150.00 per unit</p>" + " filler" * 400)
    fake = {"https://a.test/ok": {"state": "ok", "text": page}, "https://a.test/gone": {"state": "gone", "text": None},
            "https://ecode360.com/X": {"state": "ok", "text": page}}
    base = {"kind": "fee", "where": "town certificate", "item": "CCO", "amount": "$150.00", "via": "", "was_ok": True}
    assert judge({**base, "quote": "Resale CCO fee: $150.00", "url": "https://a.test/ok"}, fake["https://a.test/ok"]) == "ok"
    assert judge({**base, "quote": "Resale CCO fee: $125.00", "url": "https://a.test/ok"}, fake["https://a.test/ok"]) == "changed"
    assert judge({**base, "quote": "Resale CCO fee: $125.00", "url": "https://a.test/ok", "was_ok": False}, fake["https://a.test/ok"]) == "unchecked"
    assert judge({**base, "quote": "x", "url": "https://a.test/gone"}, fake["https://a.test/gone"]) == "gone"
    assert judge({**base, "quote": "Resale CCO fee: $125.00", "url": "https://ecode360.com/X"}, fake["https://ecode360.com/X"]) == "unchecked"
    assert judge({**base, "quote": "x", "url": "https://a.test/ok", "via": "search_snippet"}, None) == "unchecked"
    assert quote_on_page("Resale CCO ... $150.00 per unit", page)
    assert quote_on_page("$90.00 requests received", norm("fee $90.00 requests re ce ive d 11 or more days"))
    assert quote_on_page("1 family home $75 2 family home $150", norm("1 family home $75 $75 14 days 2 family home $150"))
    assert not quote_on_page("1 family home $75 2 family home $150", norm("1 family home $85 $85 14 days 2 family home $150"))
    sample = sorted(CHECKED.glob("*.json"))[:3]
    rep = audit([p.stem for p in sample], fetcher=lambda u: {"state": "unreachable", "text": None})
    assert rep["towns"] == len(sample) and not rep["flagged"], rep
    assert "No town needs a re-check" in summary_md(rep)
    print(f"source audit self-test ok ({len(sample)} sample towns)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", nargs="*")
    ap.add_argument("--out", type=pathlib.Path)
    ap.add_argument("--summary", type=pathlib.Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    rep = audit(args.codes)
    md = summary_md(rep)
    if args.out:
        args.out.write_text(json.dumps(rep, indent=1, ensure_ascii=False) + "\n")
    if args.summary:
        args.summary.write_text(md)
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
