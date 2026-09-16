#!/usr/bin/env python3
"""Statewide v3 municipal requirement extraction with bounded ordinance chapter traversal.

V2 reads each official ordinance landing URL. Many code publishers expose only a table
of contents at that URL, so v3 follows a small set of same-host chapter links whose
labels are directly relevant to CO/resale or smoke/fire. Requirement extraction is
performed per source page so context from one chapter cannot make unrelated text in
another chapter look applicable. Absence of matching text never means a waiver.
"""
from __future__ import annotations

import functools
import hashlib
import html
import importlib.util
import json
import pathlib
import re
import urllib.parse
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
V2_PATH = ROOT / "property/scripts/extract_transaction_municipal_requirements_v2.py"


def _load_v2():
    spec = importlib.util.spec_from_file_location("watchdog_municipal_requirements_v2", V2_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load v2 municipal requirement extractor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v2 = _load_v2()
base = v2.base
now = v2.now
ordinance_links = v2.ordinance_links

ANCHOR_RE = re.compile(r"<a\b[^>]*?href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)</a>", re.I)
CO_LINK_TERMS = re.compile(
    r"\b(certificate|occupancy|continued occupancy|cco|resale|real estate|transfer|housing|property maintenance|"
    r"construction codes?|rental property|change of ownership|fees? and costs?|zoning)\b", re.I
)
FIRE_LINK_TERMS = re.compile(
    r"\b(fire prevention|fire protection|smoke|carbon monoxide|occupancy|housing|property maintenance|"
    r"construction codes?|fees? and costs?)\b", re.I
)
SKIP_LINK = re.compile(r"\b(login|privacy|terms of use|help|about us|professional subscription|law ledger|new laws?)\b", re.I)


@functools.lru_cache(maxsize=2048)
def _fetch_raw(url: str) -> tuple[bytes, str, str]:
    try:
        return base.fetch_bytes(url, timeout=25, max_bytes=8_000_000)
    except Exception:
        return b"", "", url


def _text_from(raw: bytes, ctype: str, final: str) -> str:
    if not raw:
        return ""
    if "pdf" in ctype or urllib.parse.urlsplit(final).path.lower().endswith(".pdf"):
        return base.clean_text(base.pdf_to_text(raw), 150_000)
    return base.clean_text(base.html_to_text(raw), 150_000)


def _chapter_candidates(raw: bytes, final: str, family: str) -> list[tuple[int, str, str]]:
    if not raw:
        return []
    try:
        markup = raw.decode("utf-8", errors="replace")
    except Exception:
        return []
    root = urllib.parse.urlsplit(final)
    family_re = CO_LINK_TERMS if family == "resale_cco" else FIRE_LINK_TERMS
    out: list[tuple[int, str, str]] = []
    seen: set[str] = set()
    for href, label_html in ANCHOR_RE.findall(markup):
        label = base.clean_text(html.unescape(base.TAG_RE.sub(" ", label_html)), 220)
        absolute = urllib.parse.urljoin(final, html.unescape(href))
        parsed = urllib.parse.urlsplit(absolute)
        if parsed.scheme not in ("http", "https") or parsed.netloc.lower() != root.netloc.lower():
            continue
        if absolute == final or absolute in seen:
            continue
        hay = f"{label} {parsed.path}"
        if SKIP_LINK.search(hay) or not family_re.search(hay):
            continue
        seen.add(absolute)
        score = 0
        if family == "resale_cco":
            if re.search(r"\b(certificate|occupancy|cco|resale|transfer|real estate)\b", hay, re.I): score += 8
            if re.search(r"\b(housing|property maintenance|construction|rental|zoning)\b", hay, re.I): score += 4
            if re.search(r"\bfee", hay, re.I): score += 2
        else:
            if re.search(r"\b(fire prevention|fire protection|smoke|carbon monoxide)\b", hay, re.I): score += 8
            if re.search(r"\b(occupancy|housing|property maintenance|construction)\b", hay, re.I): score += 4
            if re.search(r"\bfee", hay, re.I): score += 2
        out.append((-score, label, absolute))
    out.sort(key=lambda x: (x[0], len(x[2])))
    return out[:5]


def ordinance_documents(url: str, family: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Return official landing/chapter documents, bounded to same-host relevant links."""
    raw, ctype, final = _fetch_raw(url)
    docs: list[dict[str, str]] = []
    root_text = _text_from(raw, ctype, final)
    if root_text:
        docs.append({"label": "Local code / ordinance source", "url": final, "text": root_text})
    chapter_sources: list[dict[str, str]] = []
    for _, label, chapter_url in _chapter_candidates(raw, final, family):
        craw, ctype2, cfinal = _fetch_raw(chapter_url)
        text = _text_from(craw, ctype2, cfinal)
        if not text:
            continue
        source = {"label": label or "Official code detail", "url": cfinal}
        chapter_sources.append(source)
        docs.append({**source, "text": text})
    return docs, chapter_sources


def build_row(muni: dict[str, Any], family: str, ordinance_map: dict[str, list[str]], generated: str) -> dict[str, Any]:
    row = v2.build_row(muni, family, ordinance_map, generated)
    ordinance_url = str(row.get("ordinance_url") or "")
    if not ordinance_url:
        metadata = dict(row.get("metadata") or {})
        metadata["extractor_version"] = "v3-ordinance-chapters-isolated"
        metadata["ordinance_chapter_count"] = 0
        row["metadata"] = metadata
        return row

    docs, chapter_sources = ordinance_documents(ordinance_url, family)
    extra_requirements: list[str] = []
    relevant_fee_texts: list[str] = []
    family_re = base.CO_TERMS if family == "resale_cco" else base.FIRE_TERMS
    explicit_hits: list[bool] = []
    for doc in docs:
        text = doc.get("text") or ""
        # Keep context isolated: this page must contain the requirement family before
        # its adjacent timing/fee/inspection statements can be considered.
        reqs = v2.requirement_candidates(text, family, 20)
        extra_requirements.extend(reqs)
        if family_re.search(text):
            relevant_fee_texts.append(text)
            explicit_hits.append(base.explicit_required(text, family))

    requirements = v2._merge_requirements(list(row.get("requirements") or []), extra_requirements, family)
    local_requirements = [x for x in requirements if x != v2.BASELINE_SMOKE]

    fees = list(row.get("fees") or [])
    fee_seen = {(str(f.get("amount") or ""), v2._normalize_key(str(f.get("label") or ""))) for f in fees if isinstance(f, dict)}
    for text in relevant_fee_texts:
        for fee in base.fees_from(text):
            key = (str(fee.get("amount") or ""), v2._normalize_key(str(fee.get("label") or "")))
            if key not in fee_seen:
                fee_seen.add(key)
                fees.append(fee)
            if len(fees) >= 10:
                break
        if len(fees) >= 10:
            break

    state = str(row.get("requirement_state") or "verify")
    chapter_explicit = any(explicit_hits)
    if chapter_explicit:
        state = "explicit_required"
    elif local_requirements and state in ("verify", "statewide_baseline"):
        state = "official_process_found"

    sources = list(row.get("source_urls") or [])
    seen_urls = {str(s.get("url") or "") for s in sources if isinstance(s, dict)}
    for src in chapter_sources:
        if src["url"] not in seen_urls:
            seen_urls.add(src["url"])
            sources.append(src)
        if len(sources) >= 14:
            break

    row["requirements"] = requirements[:20]
    row["fees"] = fees[:10]
    row["requirement_state"] = state
    row["source_urls"] = sources[:14]
    row["source_excerpt"] = " | ".join(requirements[:5])[:1600] or None
    metadata = dict(row.get("metadata") or {})
    metadata.update({
        "extractor_version": "v3-ordinance-chapters-isolated",
        "ordinance_chapter_count": len(chapter_sources),
        "ordinance_chapters_checked": [s["url"] for s in chapter_sources],
        "local_requirement_count": len(local_requirements),
        "chapter_context_isolated": True,
        "never_infer_not_required": True,
    })
    row["metadata"] = metadata

    facts = {
        "code": row.get("municipality_code"), "family": family, "state": state,
        "requirements": row["requirements"], "fees": row["fees"], "application": row.get("application_url"),
        "department": row.get("department_url"), "ordinance": ordinance_url, "sources": row["source_urls"],
    }
    row["source_hash"] = hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    row["updated_at"] = generated
    return row
