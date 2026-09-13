#!/usr/bin/env python3
"""Patch the materialized v0.41 HUD loader for reliable official XLSX access.

HUD's FY2025 PROJECT_EXTRACT URL is the canonical source, but a bare Python
requests client receives a non-workbook response in GitHub Actions. This patch
keeps the same official URL and source semantics while adding ordinary browser
request headers plus an explicit XLSX/ZIP signature check before pandas reads it.
The rest of the governed builder remains unchanged.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / "property" / "scripts" / "build_federal_housing_context_v041.py"

text = BUILDER.read_text(encoding="utf-8")
old = '''    response = requests.get(HUD_PROJECT_URL, timeout=120)\n    response.raise_for_status()\n    frame = pd.read_excel(io.BytesIO(response.content), sheet_name="PROJECT_EXTRACT")\n'''
new = '''    response = requests.get(\n        HUD_PROJECT_URL,\n        timeout=120,\n        headers={\n            "User-Agent": "Mozilla/5.0 (compatible; WatchdogSourceBuild/0.41; +https://www.watchdogindex.com)",\n            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.8",\n            "Referer": "https://www.huduser.gov/portal/datasets/assthsg.html",\n        },\n    )\n    response.raise_for_status()\n    if not response.content.startswith(b"PK"):\n        sample = response.text[:240].replace("\\n", " ")\n        fail(f"HUD FY2025 PROJECT_EXTRACT did not return an XLSX workbook: {sample!r}")\n    frame = pd.read_excel(io.BytesIO(response.content), sheet_name="PROJECT_EXTRACT")\n'''

if old not in text:
    if new in text:
        print("HUD official-source loader already patched.")
        raise SystemExit(0)
    raise RuntimeError("Expected HUD workbook loader block was not found; refusing a broad source rewrite")

BUILDER.write_text(text.replace(old, new, 1), encoding="utf-8")
print(f"Patched {BUILDER.relative_to(ROOT)} for validated official HUD FY2025 workbook access")
