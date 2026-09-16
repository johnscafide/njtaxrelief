#!/usr/bin/env python3
"""Statewide v4 municipal requirement extraction with explicit-negation safety.

Official municipal text can contain scope exclusions such as "does not require a
Certificate of Occupancy for residential resale." Keyword-only classification must
never turn those sentences into an affirmative requirement. V4 preserves the source
text but downgrades mixed/negated applicability to `official_process_found` so the
transaction card tells the user to verify the property-specific scope.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import re
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
V3_PATH = ROOT / "property/scripts/extract_transaction_municipal_requirements_v3.py"


def _load_v3():
    spec = importlib.util.spec_from_file_location("watchdog_municipal_requirements_v3", V3_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load v3 municipal requirement extractor")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v3 = _load_v3()
now = v3.now
ordinance_links = v3.ordinance_links

NEGATED_REQUIREMENT = re.compile(
    r"(?:\bdoes\s+not\s+(?:require|issue|need)\b|"
    r"\bdo\s+not\s+(?:require|issue|need)\b|"
    r"\b(?:is|are)\s+not\s+required\b|"
    r"\bshall\s+not\s+be\s+required\b|"
    r"\bnot\s+subject\s+to\s+(?:re-?inspection|re-?certification|inspection|certification)\b|"
    r"\bno\s+(?:residential\s+|commercial\s+|resale\s+|rental\s+|continued\s+){0,4}"
    r"(?:certificate(?:\s+of\s+(?:continued\s+)?occupancy)?|cco|inspection)\s+(?:is\s+)?required\b)",
    re.I,
)


def negative_scope_lines(requirements: list[str]) -> list[str]:
    out: list[str] = []
    for line in requirements:
        text = str(line or "").strip()
        if text and NEGATED_REQUIREMENT.search(text):
            out.append(text)
    return out


def build_row(muni: dict[str, Any], family: str, ordinance_map: dict[str, list[str]], generated: str) -> dict[str, Any]:
    row = v3.build_row(muni, family, ordinance_map, generated)
    requirements = [str(x) for x in (row.get("requirements") or []) if str(x).strip()]
    negatives = negative_scope_lines(requirements)
    state = str(row.get("requirement_state") or "verify")

    # An official scope exclusion is useful evidence, but it cannot be represented as
    # an unconditional positive requirement. Keep the text and require applicability
    # review rather than inventing a new "not required" state.
    if negatives and state == "explicit_required":
        state = "official_process_found"
        row["requirement_state"] = state

    metadata = dict(row.get("metadata") or {})
    metadata.update({
        "extractor_version": "v4-negation-safe",
        "explicit_negative_scope_language_observed": bool(negatives),
        "negative_scope_examples": negatives[:3],
        "negative_scope_never_promoted_to_required": True,
        "never_infer_not_required": True,
    })
    row["metadata"] = metadata

    facts = {
        "code": row.get("municipality_code"), "family": family, "state": state,
        "requirements": row.get("requirements"), "fees": row.get("fees"),
        "application": row.get("application_url"), "department": row.get("department_url"),
        "ordinance": row.get("ordinance_url"), "sources": row.get("source_urls"),
        "negative_scope": negatives[:3],
    }
    row["source_hash"] = hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    row["updated_at"] = generated
    return row
