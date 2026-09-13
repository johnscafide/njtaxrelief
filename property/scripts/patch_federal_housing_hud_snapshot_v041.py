#!/usr/bin/env python3
"""Patch v0.41 source-access details without changing governed semantics.

HUD's FY2025 PROJECT_EXTRACT URL is canonical, but a bare Python requests
client receives a non-workbook response in GitHub Actions. Add normal browser
headers and verify the XLSX signature before parsing.

The ArcGIS Online Municipal_Boundaries layer originally pinned by the builder
currently exposes only 53 records despite its statewide description. Replace
that endpoint with NJOGIS's current Government Boundaries MapServer municipality
layer, which is explicitly published by NJOIT/NJOGIS and preserves the same
MUN_CODE municipality contract.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / "property" / "scripts" / "build_federal_housing_context_v041.py"

text = BUILDER.read_text(encoding="utf-8")

old_hud = '''    response = requests.get(HUD_PROJECT_URL, timeout=120)\n    response.raise_for_status()\n    frame = pd.read_excel(io.BytesIO(response.content), sheet_name="PROJECT_EXTRACT")\n'''
new_hud = '''    response = requests.get(\n        HUD_PROJECT_URL,\n        timeout=120,\n        headers={\n            "User-Agent": "Mozilla/5.0 (compatible; WatchdogSourceBuild/0.41; +https://www.watchdogindex.com)",\n            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.8",\n            "Referer": "https://www.huduser.gov/portal/datasets/assthsg.html",\n        },\n    )\n    response.raise_for_status()\n    if not response.content.startswith(b"PK"):\n        sample = response.text[:240].replace("\\n", " ")\n        fail(f"HUD FY2025 PROJECT_EXTRACT did not return an XLSX workbook: {sample!r}")\n    frame = pd.read_excel(io.BytesIO(response.content), sheet_name="PROJECT_EXTRACT")\n'''

if old_hud in text:
    text = text.replace(old_hud, new_hud, 1)
elif new_hud not in text:
    raise RuntimeError("Expected HUD workbook loader block was not found; refusing a broad source rewrite")

old_njogis = '''NJOGIS_URL = (\n    "https://services1.arcgis.com/PsDtSYIjNsyfjwcX/arcgis/rest/services/"\n    "Municipal_Boundaries/FeatureServer/0/query"\n)'''
new_njogis = '''NJOGIS_URL = (\n    "https://maps.nj.gov/arcgis/rest/services/Framework/"\n    "Government_Boundaries/MapServer/2/query"\n)'''
if old_njogis in text:
    text = text.replace(old_njogis, new_njogis, 1)
elif new_njogis not in text:
    raise RuntimeError("Expected NJOGIS municipality boundary assignment was not found; refusing an ungoverned endpoint substitution")

BUILDER.write_text(text, encoding="utf-8")
print(
    f"Patched {BUILDER.relative_to(ROOT)} for validated HUD FY2025 workbook access "
    "and the current authoritative NJOGIS Government Boundaries municipality layer"
)
