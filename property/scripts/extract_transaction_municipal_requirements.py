#!/usr/bin/env python3
"""Build conservative resale/CO + smoke/fire requirement rows for all NJ municipalities.

Inputs are Watchdog's governed municipal discovery snapshot plus NJ DCA's free Local
Code of Ordinances Directory. The parser only promotes a municipality to
`explicit_required` when official-source text contains affirmative requirement
language tied to sale/resale/change of occupancy. Missing or unreadable material is
always `verify`; it is never treated as `not required`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import io
import json
import re
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

DCA_ORDINANCE_XLSX = "https://nj.gov/dca/library/home/Local_Code_of_Ordinances_Directory.xlsx"
DCA_FIRE_HOME = "https://firesolutions.dca.nj.gov/"
DCA_SMOKE_APP = "https://firesolutions.dca.nj.gov/ultra-fire-home/smoke-application-create/"
UA = "Watchdog-municipal-requirements/1.0 (+https://www.watchdogindex.com/)"

CO_TERMS = re.compile(r"\b(certificate of occupancy|continued certificate|continued occupancy|cco|resale inspection|resale certificate|change of occupancy|occupancy inspection)\b", re.I)
SALE_TERMS = re.compile(r"\b(sale|resale|sell|transfer|change of ownership|change in ownership|prior to closing|before closing|settlement|change of occupancy|new tenant|lease)\b", re.I)
REQUIRED_TERMS = re.compile(r"\b(required|shall|must|prior to|before|no transfer|cannot close|may not be occupied|inspection is required)\b", re.I)
FIRE_TERMS = re.compile(r"\b(smoke|carbon monoxide|co alarm|fire extinguisher|fire inspection|smoke certificate|fire certificate)\b", re.I)
USEFUL_LINE = re.compile(r"\b(application|apply|fee|inspection|certificate|occupancy|resale|sale|closing|smoke|carbon monoxide|fire extinguisher|permit|reinspection|business days|days before)\b", re.I)
FEE_RE = re.compile(r"\$\s?\d{1,5}(?:,\d{3})*(?:\.\d{2})?")
TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_RE = re.compile(r"<(script|style)\b[\s\S]*?</\1>", re.I)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def clean_text(v: Any, n: int = 1000) -> str:
    return " ".join(str(v or "").replace("\x00", " ").split())[:n]


def norm_name(v: str) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", v.lower())
    s = re.sub(r"\b(township|twp|borough|boro|city|town|village)\b", " ", s)
    return " ".join(s.split())


def fetch_bytes(url: str, timeout: int = 25, max_bytes: int = 8_000_000) -> tuple[bytes, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.5"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read(max_bytes)
        return body, (r.headers.get("Content-Type") or "").lower(), r.geturl()


def html_to_text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = SCRIPT_RE.sub(" ", text)
    text = html.unescape(TAG_RE.sub(" ", text))
    return " ".join(text.split())


def pdf_to_text(raw: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        return " ".join((page.extract_text() or "") for page in reader.pages[:30])
    except Exception:
        return ""


def source_text(url: str) -> tuple[str, str]:
    try:
        raw, ctype, final = fetch_bytes(url)
        if "pdf" in ctype or urllib.parse.urlsplit(final).path.lower().endswith(".pdf"):
            return clean_text(pdf_to_text(raw), 150_000), final
        return clean_text(html_to_text(raw), 150_000), final
    except Exception:
        return "", url


def sentence_candidates(text: str, family: str) -> list[str]:
    if not text:
        return []
    chunks = re.split(r"(?<=[.!?])\s+|\s{2,}|\n+", text)
    out: list[str] = []
    seen: set[str] = set()
    family_re = CO_TERMS if family == "resale_cco" else FIRE_TERMS
    for raw in chunks:
        line = clean_text(raw, 360)
        if len(line) < 12 or not USEFUL_LINE.search(line) or not family_re.search(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(line)
        if len(out) >= 12:
            break
    return out


def fees_from(text: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in FEE_RE.finditer(text or ""):
        amount = match.group(0).replace(" ", "")
        start = max(0, match.start() - 110)
        end = min(len(text), match.end() + 110)
        context = clean_text(text[start:end], 240)
        if amount in seen:
            continue
        seen.add(amount)
        out.append({"amount": amount, "label": context})
        if len(out) >= 8:
            break
    return out


def explicit_required(text: str, family: str) -> bool:
    fam = CO_TERMS if family == "resale_cco" else FIRE_TERMS
    if not (fam.search(text or "") and SALE_TERMS.search(text or "") and REQUIRED_TERMS.search(text or "")):
        return False
    # Require the concepts reasonably close to each other, not merely somewhere on a long department page.
    lower = text.lower()
    for m in fam.finditer(lower):
        window = lower[max(0, m.start() - 500):m.end() + 500]
        if SALE_TERMS.search(window) and REQUIRED_TERMS.search(window):
            return True
    return False


def choose_urls(row: dict[str, Any], family: str) -> list[dict[str, Any]]:
    candidates = list((row.get("candidates") or {}).get("certificate_of_occupancy" if family == "resale_cco" else "smoke_co_fire", []) or [])
    candidates.sort(key=lambda x: (-int(x.get("score") or 0), len(str(x.get("url") or ""))))
    out, seen = [], set()
    for item in candidates:
        url = str(item.get("url") or "")
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        out.append(item)
        if len(out) >= 4:
            break
    return out


def classify_urls(items: list[dict[str, Any]], root_url: str) -> tuple[str | None, str | None]:
    application = None
    department = root_url or None
    for item in items:
        url = str(item.get("url") or "")
        hay = (str(item.get("label") or "") + " " + url).lower()
        if not application and any(k in hay for k in ("application", "form", "resale", "cco", "certificate")):
            application = url
        if any(k in hay for k in ("code enforcement", "construction", "fire prevention", "fire department", "housing")):
            department = url
    return application, department


def ordinance_links() -> dict[str, list[str]]:
    """Best-effort read of DCA's XLSX; flexible because column names have changed."""
    try:
        raw, _, _ = fetch_bytes(DCA_ORDINANCE_XLSX, timeout=40, max_bytes=20_000_000)
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=False, data_only=True)
    except Exception:
        return {}
    result: dict[str, list[str]] = defaultdict(list)
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            vals = [clean_text(c.value, 300) for c in row]
            urls: list[str] = []
            for c in row:
                target = getattr(getattr(c, "hyperlink", None), "target", None)
                if target and str(target).startswith(("http://", "https://")):
                    urls.append(str(target))
                val = str(c.value or "")
                urls += re.findall(r"https?://[^\s<>\"]+", val)
            if not urls:
                continue
            name = next((v for v in vals[:6] if v and not re.fullmatch(r"\d{1,4}", v) and len(v) > 2), "")
            if not name:
                continue
            key = norm_name(name)
            for url in urls:
                if url not in result[key]:
                    result[key].append(url)
    return dict(result)


def build_row(muni: dict[str, Any], family: str, ordinance_map: dict[str, list[str]], generated: str) -> dict[str, Any]:
    code = str(muni.get("municipality_code") or "").strip()
    name = str(muni.get("municipality_label") or code)
    county = str(muni.get("county") or "")
    root = str(muni.get("root_url") or "")
    items = choose_urls(muni, family)
    source_docs: list[dict[str, str]] = []
    combined: list[str] = []
    for item in items:
        url = str(item.get("url") or "")
        text, final = source_text(url)
        if text:
            combined.append(text)
            source_docs.append({"label": clean_text(item.get("label") or final, 180), "url": final})
        else:
            source_docs.append({"label": clean_text(item.get("label") or url, 180), "url": url})
    all_text = " ".join(combined)
    requirements = sentence_candidates(all_text, family)
    fees = fees_from(all_text)
    application, department = classify_urls(items, root)
    ordinances = ordinance_map.get(norm_name(name), [])
    ordinance_url = ordinances[0] if ordinances else None

    if family == "smoke_fire_cert":
        baseline = "NJ fire-safety change-of-occupancy compliance must be verified through the applicable local enforcing agency or municipal occupancy process; Watchdog does not treat missing local web material as a waiver."
        if baseline not in requirements:
            requirements.insert(0, baseline)
        source_docs.extend([
            {"label": "NJ DCA Fire Solutions", "url": DCA_FIRE_HOME},
            {"label": "NJ DCA Smoke/CO certification application", "url": DCA_SMOKE_APP},
        ])

    is_explicit = explicit_required(all_text, family)
    if is_explicit:
        state = "explicit_required"
    elif items and (requirements or application):
        state = "official_process_found"
    elif family == "smoke_fire_cert":
        state = "statewide_baseline"
    else:
        state = "verify"

    # Deduplicate source links and keep source payload bounded.
    seen, sources = set(), []
    for src in source_docs:
        u = src.get("url") or ""
        if u and u not in seen:
            seen.add(u); sources.append(src)
    if root and root not in seen:
        sources.append({"label": f"{name} official website", "url": root}); seen.add(root)
    if ordinance_url and ordinance_url not in seen:
        sources.append({"label": "Local code / ordinance source", "url": ordinance_url}); seen.add(ordinance_url)
    sources = sources[:10]

    excerpt = " | ".join(requirements[:4])[:1200]
    facts = {
        "code": code, "family": family, "state": state, "requirements": requirements[:12],
        "fees": fees, "application": application, "department": department,
        "ordinance": ordinance_url, "sources": sources,
    }
    return {
        "municipality_code": code,
        "municipality_name": name,
        "county": county,
        "requirement_key": family,
        "requirement_state": state,
        "title": "Certificate of Occupancy (CO)" if family == "resale_cco" else "Smoke / CO / fire certification",
        "requirements": requirements[:12],
        "fees": fees,
        "application_url": application,
        "department_url": department,
        "ordinance_url": ordinance_url,
        "source_urls": sources,
        "source_excerpt": excerpt or None,
        "source_hash": hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
        "last_verified_at": generated,
        "metadata": {
            "explicit_requirement_language_observed": is_explicit,
            "candidate_count": len(items),
            "never_infer_not_required": True,
            "statewide_smoke_source_applied": family == "smoke_fire_cert",
            "dca_ordinance_directory": DCA_ORDINANCE_XLSX,
        },
        "updated_at": generated,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipal", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    with open(args.municipal, encoding="utf-8") as f:
        doc = json.load(f)
    rows = doc.get("results") or []
    codes = {str(r.get("municipality_code") or "") for r in rows}
    if len(codes) != 564:
        raise SystemExit(f"Expected 564 municipality codes, got {len(codes)}")
    generated = now()
    ordinance_map = ordinance_links()
    out = [build_row(row, family, ordinance_map, generated) for row in rows for family in ("resale_cco", "smoke_fire_cert")]
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"generated_at": generated, "municipalities": len(codes), "rows": out}, f, indent=2, ensure_ascii=False)
    counts = defaultdict(int)
    for row in out:
        counts[(row["requirement_key"], row["requirement_state"])] += 1
    print(json.dumps({"municipalities": len(codes), "rows": len(out), "states": {f"{k[0]}:{k[1]}": v for k,v in counts.items()}}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
