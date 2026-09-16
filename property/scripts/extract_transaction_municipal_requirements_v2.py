#!/usr/bin/env python3
"""Statewide v2 municipal CO / smoke-fire requirement enrichment.

This module wraps the conservative v1 extractor and fixes a coverage gap: v1 stored
DCA/local ordinance URLs but did not read them when building requirement bullets.
V2 reads those code sources, rejects auth/profile URLs as applications, and keeps a
larger action-focused requirement set while preserving the existing rule that
missing/unreadable material can never mean "not required".
"""
from __future__ import annotations

import importlib.util
import pathlib
import re
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE_PATH = ROOT / "property/scripts/extract_transaction_municipal_requirements.py"


def _load_base():
    spec = importlib.util.spec_from_file_location("watchdog_municipal_requirements_v1", BASE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load v1 municipal requirement extractor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = _load_base()
now = base.now
ordinance_links = base.ordinance_links

AUTH_URL = re.compile(r"(?:/myaccount|/account|/login|/sign-?in|/profile|profilecreate|authentication|authorize)", re.I)
ACTION_TERMS = re.compile(
    r"\b(application|apply|inspection|reinspection|re-inspection|schedule|appointment|fee|business days?|"
    r"prior to|before closing|settlement|certificate|issued|issuance|valid|expires?|permit|closed out|"
    r"smoke detector|carbon monoxide|fire extinguisher|correction|required|shall|must)\b",
    re.I,
)
BOILERPLATE = re.compile(r"\b(skip to (?:main )?content|website sign in|manage notification subscriptions|facebook|youtube|calendar|find it fast)\b", re.I)
BASELINE_SMOKE = (
    "NJ fire-safety change-of-occupancy compliance must be verified through the applicable local "
    "enforcing agency or municipal occupancy process; Watchdog does not treat missing local web material as a waiver."
)


def _normalize_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _score_line(line: str, family: str) -> int:
    family_re = base.CO_TERMS if family == "resale_cco" else base.FIRE_TERMS
    score = 0
    if family_re.search(line):
        score += 8
    if base.REQUIRED_TERMS.search(line):
        score += 5
    if base.SALE_TERMS.search(line):
        score += 4
    if ACTION_TERMS.search(line):
        score += 3
    if base.FEE_RE.search(line):
        score += 2
    if re.search(r"\b(?:\d+\s+business days?|reinspection|re-inspection|valid for|expires?|open permits?|closed out)\b", line, re.I):
        score += 3
    if BOILERPLATE.search(line):
        score -= 7
    return score


def requirement_candidates(text: str, family: str, limit: int = 20) -> list[str]:
    """Extract action-focused local requirement statements without inventing facts."""
    if not text:
        return []
    family_re = base.CO_TERMS if family == "resale_cco" else base.FIRE_TERMS
    has_family = bool(family_re.search(text))
    chunks = re.split(r"(?<=[.!?;])\s+|\n+|\r+", text)
    candidates: list[tuple[int, int, str]] = []
    seen: set[str] = set()

    for idx, raw in enumerate(chunks):
        line = base.clean_text(raw, 520)
        if len(line) < 18 or not ACTION_TERMS.search(line):
            continue
        # Primary statements mention the family directly. Secondary statements are kept
        # only when this targeted official source contains family language somewhere and
        # the statement itself is clearly transactional/actionable.
        primary = bool(family_re.search(line))
        secondary = has_family and bool(
            base.SALE_TERMS.search(line)
            or base.REQUIRED_TERMS.search(line)
            or re.search(r"\b(?:application|inspection|reinspection|re-inspection|business days?|fee|permit|issued|valid|expires?)\b", line, re.I)
        )
        if not (primary or secondary):
            continue
        key = _normalize_key(line)
        if not key or key in seen:
            continue
        seen.add(key)
        score = _score_line(line, family)
        if score < 3:
            continue
        candidates.append((-score, idx, line))

    # Some municipal pages flatten forms/code into long text with few sentence breaks.
    # Add bounded windows around family terms so actionable clauses are not lost.
    for n, match in enumerate(family_re.finditer(text)):
        start = max(0, match.start() - 220)
        end = min(len(text), match.end() + 380)
        line = base.clean_text(text[start:end], 520)
        if len(line) < 18 or not ACTION_TERMS.search(line):
            continue
        key = _normalize_key(line)
        if not key or key in seen:
            continue
        seen.add(key)
        score = _score_line(line, family)
        if score >= 5:
            candidates.append((-score, len(chunks) + n, line))
        if n >= 30:
            break

    candidates.sort(key=lambda x: (x[0], x[1]))
    return [line for _, _, line in candidates[:limit]]


def _valid_application(url: str) -> bool:
    if not url or not url.startswith(("http://", "https://")):
        return False
    return not bool(AUTH_URL.search(url))


def _best_application(items: list[dict[str, Any]], current: str | None) -> str | None:
    if current and _valid_application(current):
        return current
    ranked: list[tuple[int, str]] = []
    for item in items:
        url = str(item.get("url") or "")
        if not _valid_application(url):
            continue
        hay = (str(item.get("label") or "") + " " + url).lower()
        if not any(k in hay for k in ("application", "form", "resale", "cco", "certificate", "occupancy")):
            continue
        score = 0
        if url.lower().endswith(".pdf") or "documentcenter" in url.lower():
            score += 4
        if any(k in hay for k in ("application", "form")):
            score += 3
        if any(k in hay for k in ("resale", "cco", "occupancy")):
            score += 3
        ranked.append((-score, url))
    ranked.sort()
    return ranked[0][1] if ranked else None


def _merge_requirements(existing: list[str], extra: list[str], family: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    # Keep statewide smoke baseline first, then prioritize local/actionable detail.
    if family == "smoke_fire_cert" and BASELINE_SMOKE in existing:
        out.append(BASELINE_SMOKE)
        seen.add(_normalize_key(BASELINE_SMOKE))
    ranked = [x for x in extra if x != BASELINE_SMOKE] + [x for x in existing if x != BASELINE_SMOKE]
    ranked.sort(key=lambda line: -_score_line(line, family))
    for line in ranked:
        clean = base.clean_text(line, 520)
        key = _normalize_key(clean)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(clean)
        if len(out) >= 20:
            break
    return out


def build_row(muni: dict[str, Any], family: str, ordinance_map: dict[str, list[str]], generated: str) -> dict[str, Any]:
    row = base.build_row(muni, family, ordinance_map, generated)
    items = base.choose_urls(muni, family)
    application = _best_application(items, row.get("application_url"))
    ordinance_url = str(row.get("ordinance_url") or "")
    department_url = str(row.get("department_url") or "")

    extra_texts: list[str] = []
    checked_sources: list[str] = []
    # The critical v2 change: actually read the official code/ordinance URL that v1 only stored.
    if ordinance_url:
        text, final = base.source_text(ordinance_url)
        if text:
            extra_texts.append(text)
            checked_sources.append(final)

    # If local detail is still thin, inspect the official department/root page too. This
    # does not turn discovery into a requirement; promotion still requires source text.
    existing = list(row.get("requirements") or [])
    existing_local = [x for x in existing if x != BASELINE_SMOKE]
    if len(existing_local) < 2 and department_url and department_url != ordinance_url:
        text, final = base.source_text(department_url)
        if text:
            extra_texts.append(text)
            checked_sources.append(final)

    extra_text = " ".join(extra_texts)
    extra_requirements = requirement_candidates(extra_text, family, 20)
    requirements = _merge_requirements(existing, extra_requirements, family)
    local_requirements = [x for x in requirements if x != BASELINE_SMOKE]

    extra_fees = base.fees_from(extra_text)
    fees = list(row.get("fees") or [])
    fee_seen = {(str(f.get("amount") or ""), _normalize_key(str(f.get("label") or ""))) for f in fees if isinstance(f, dict)}
    for fee in extra_fees:
        key = (str(fee.get("amount") or ""), _normalize_key(str(fee.get("label") or "")))
        if key not in fee_seen:
            fee_seen.add(key)
            fees.append(fee)
        if len(fees) >= 10:
            break

    combined_text = " ".join([extra_text] + local_requirements)
    extra_explicit = base.explicit_required(combined_text, family) if combined_text else False
    state = str(row.get("requirement_state") or "verify")
    if extra_explicit:
        state = "explicit_required"
    elif local_requirements and state in ("verify", "statewide_baseline"):
        state = "official_process_found"

    row["application_url"] = application
    row["requirements"] = requirements[:20]
    row["fees"] = fees[:10]
    row["requirement_state"] = state
    row["source_excerpt"] = " | ".join(requirements[:5])[:1600] or None
    metadata = dict(row.get("metadata") or {})
    metadata.update({
        "extractor_version": "v2-ordinance-aware",
        "ordinance_text_checked": bool(ordinance_url),
        "additional_source_text_retrieved": bool(extra_texts),
        "checked_requirement_sources": checked_sources[:4],
        "local_requirement_count": len(local_requirements),
        "application_auth_page_rejected": bool(row.get("application_url") and not application),
        "never_infer_not_required": True,
    })
    row["metadata"] = metadata

    facts = {
        "code": row.get("municipality_code"),
        "family": family,
        "state": state,
        "requirements": row["requirements"],
        "fees": row["fees"],
        "application": application,
        "department": row.get("department_url"),
        "ordinance": row.get("ordinance_url"),
        "sources": row.get("source_urls"),
    }
    import hashlib, json
    row["source_hash"] = hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    row["updated_at"] = generated
    return row
