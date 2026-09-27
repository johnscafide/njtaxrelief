#!/usr/bin/env python3
"""Correct town pages that were joined on the state municipal code.

Town pages were generated from budget-pressure.json while it was keyed by the
state county/municipal code, then joined to uniformity.json, which is keyed by
the MOD-IV (PAMS PIN) district code. For the 99 municipalities where those codes
differ, a page showed a neighbouring town's assessment-consistency numbers and
linked Fairness/Town Compare to the wrong district.

This script edits only those parts of the committed pages (it does not regenerate
the template): the consistency stat, the consistency sentence, the district code
in links and the "Municipality code" line, plus the district in town-manifest.json.
It is idempotent: a page already carrying the PIN code is left alone.
"""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "towns/town-manifest.json"
CROSSWALK = ROOT / "property/data/nj-district-crosswalk.json"
UNIFORMITY = ROOT / "property/uniformity.json"


def consistency_stat(row: dict) -> str:
    score = row.get("score")
    if score is None:
        return "<b>—</b><span>not in current release</span>"
    return f"<b>{float(score):.1f}/100</b><span>assessment consistency</span>"


def assessment_note(row: dict) -> str:
    score, coefficient = row.get("score"), row.get("coefficient")
    note = (f"The reported assessment consistency score is {float(score):.1f} out of 100. " if score is not None
            else "An assessment consistency score is not available in the current statewide release. ")
    if coefficient is not None:
        note += (f"The reported coefficient is {float(coefficient):.2f}; this is a municipal consistency measure, "
                 "not an opinion of a specific property's value.")
    return html.escape(note, quote=False)


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    crosswalk = json.loads(CROSSWALK.read_text())["districts"]
    state_to_pin = {row["dca_code"]: code for code, row in crosswalk.items()}
    uniformity = json.loads(UNIFORMITY.read_text())["districts"]
    fixed, problems = 0, []
    for page in manifest["pages"]:
        old = str(page["district"]).zfill(4)
        new = state_to_pin[old]
        if old == new or crosswalk[new]["name"] != page["name"]:
            # Unaffected town, or this manifest row already carries the PIN code.
            continue
        path = ROOT / page["path"]
        text = path.read_text(encoding="utf-8")
        before = text
        page_problems = []
        for a, b in (
            (consistency_stat(uniformity.get(old, {})), consistency_stat(uniformity.get(new, {}))),
            (assessment_note(uniformity.get(old, {})), assessment_note(uniformity.get(new, {}))),
            (f"towns={old}\"", f"towns={new}\""),
            (f"district={old}\"", f"district={new}\""),
            (f"Municipality code {old} ", f"Municipality code {new} "),
        ):
            if a not in text:
                page_problems.append(f"{page['path']}: expected text not found: {a[:70]!r}")
            text = text.replace(a, b)
        if page_problems:
            problems += page_problems
            continue
        if text != before:
            path.write_text(text, encoding="utf-8")
        page["district"] = new
        fixed += 1
    if problems:
        raise SystemExit("Town page correction incomplete (clean pages were written, manifest was not):\n  " + "\n  ".join(problems[:20]))
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Corrected {fixed} town pages to PIN district codes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
