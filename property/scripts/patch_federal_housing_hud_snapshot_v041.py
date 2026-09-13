#!/usr/bin/env python3
"""Patch the materialized v0.41 builder to use the pinned FY2025 HUD NJ snapshot.

The source builder was initially authored against HUD's live PROJECT_EXTRACT XLSX.
That endpoint currently returns a non-workbook response in GitHub Actions. The
exact NJ project extract used for this source release is therefore pinned in the
repository as a gzipped CSV. This patch changes only the source-loading lines;
all dedupe, municipality assignment, ambiguity checks and fail-closed semantics
remain in the governed builder unchanged.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / "property" / "scripts" / "build_federal_housing_context_v041.py"
SNAPSHOT = ROOT / "property" / "data" / "source-snapshots" / "hud-picture-2025-nj-projects.csv.gz"

if not SNAPSHOT.exists():
    raise RuntimeError(f"Pinned HUD project snapshot is missing: {SNAPSHOT}")

text = BUILDER.read_text(encoding="utf-8")
old = '''    response = requests.get(HUD_PROJECT_URL, timeout=120)\n    response.raise_for_status()\n    frame = pd.read_excel(io.BytesIO(response.content), sheet_name="PROJECT_EXTRACT")\n'''
new = '''    snapshot = ROOT / "property" / "data" / "source-snapshots" / "hud-picture-2025-nj-projects.csv.gz"\n    frame = pd.read_csv(snapshot, compression="gzip")\n'''

if old not in text:
    if new in text:
        print("HUD snapshot loader already patched.")
        raise SystemExit(0)
    raise RuntimeError("Expected HUD live-workbook loader block was not found; refusing a broad source rewrite")

BUILDER.write_text(text.replace(old, new, 1), encoding="utf-8")
print(f"Patched {BUILDER.relative_to(ROOT)} to use pinned FY2025 HUD NJ project snapshot")
