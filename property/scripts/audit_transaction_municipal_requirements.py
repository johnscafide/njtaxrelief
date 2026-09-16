#!/usr/bin/env python3
"""Certify statewide municipal CO + smoke/fire requirement extraction coverage."""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict

FAMILIES = ("resale_cco", "smoke_fire_cert")
BASELINE_SMOKE_PREFIX = "NJ fire-safety change-of-occupancy compliance"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    with open(args.input, encoding="utf-8") as f:
        doc = json.load(f)
    rows = doc.get("rows") or []
    by_code: dict[str, dict[str, dict]] = defaultdict(dict)
    duplicates: list[str] = []

    for row in rows:
        code = str(row.get("municipality_code") or "")
        family = str(row.get("requirement_key") or "")
        if family not in FAMILIES:
            continue
        if family in by_code[code]:
            duplicates.append(f"{code}:{family}")
        by_code[code][family] = row

    errors: list[str] = []
    if len(by_code) != 564:
        errors.append(f"Expected 564 municipality codes, got {len(by_code)}")
    if len(rows) != 1128:
        errors.append(f"Expected 1128 rows, got {len(rows)}")
    if duplicates:
        errors.append("Duplicate municipality/family rows: " + ", ".join(duplicates[:20]))

    matrix = []
    state_counts = Counter()
    local_detail_counts = Counter()
    source_counts = Counter()
    application_counts = Counter()

    for code in sorted(by_code):
        families = by_code[code]
        missing = [family for family in FAMILIES if family not in families]
        if missing:
            errors.append(f"{code} missing {','.join(missing)}")
            continue
        sample = families[FAMILIES[0]]
        entry = {
            "municipality_code": code,
            "municipality_name": sample.get("municipality_name"),
            "county": sample.get("county"),
            "requirements": {},
        }
        for family in FAMILIES:
            row = families[family]
            requirements = list(row.get("requirements") or [])
            local = [x for x in requirements if not str(x).startswith(BASELINE_SMOKE_PREFIX)]
            sources = list(row.get("source_urls") or [])
            state = str(row.get("requirement_state") or "verify")
            state_counts[f"{family}:{state}"] += 1
            if local:
                local_detail_counts[family] += 1
            if sources:
                source_counts[family] += 1
            if row.get("application_url"):
                application_counts[family] += 1
            entry["requirements"][family] = {
                "state": state,
                "local_requirement_count": len(local),
                "fee_count": len(row.get("fees") or []),
                "source_count": len(sources),
                "has_application": bool(row.get("application_url")),
                "has_department": bool(row.get("department_url")),
                "has_ordinance": bool(row.get("ordinance_url")),
                "extractor_version": (row.get("metadata") or {}).get("extractor_version"),
            }
        matrix.append(entry)

    audit = {
        "generated_at": doc.get("generated_at"),
        "municipalities_checked": len(by_code),
        "rows_checked": len(rows),
        "required_families": list(FAMILIES),
        "state_counts": dict(sorted(state_counts.items())),
        "municipalities_with_local_detail": dict(local_detail_counts),
        "municipalities_with_sources": dict(source_counts),
        "municipalities_with_application": dict(application_counts),
        "errors": errors,
        "municipalities": matrix,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(audit, f, indent=2, ensure_ascii=False)

    print(json.dumps({k: audit[k] for k in (
        "municipalities_checked", "rows_checked", "state_counts",
        "municipalities_with_local_detail", "municipalities_with_sources",
        "municipalities_with_application", "errors"
    )}, sort_keys=True))
    if errors:
        raise SystemExit("Statewide municipal requirement audit failed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
