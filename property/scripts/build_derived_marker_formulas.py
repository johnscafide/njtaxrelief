#!/usr/bin/env python3
"""Merge formula-backed institutional signals into the public methodology contract."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'data'/'derived-marker-formulas.json'
doc=json.loads(path.read_text())
for file in ('institutional-marker-pack.json','professional-marker-pack-v030.json','nj-proplus-source-pack-v031.json','statewide-intelligence-marker-pack.json'):
    pack=json.loads((ROOT/'data'/file).read_text())
    for marker in pack['markers']:
        if marker.get('origin')!='watchdog-derived': continue
        doc['markers'][marker['id']]={
            'range': marker.get('unit','score / 100'),
            'formula': marker['formula'],
            'professional_reason': marker['professional_reason']
        }
doc['version']='0.35.0'
doc['principle']='Every proprietary score exposes its component inputs/formula. Scores support prioritization; they are not legal, appraisal, credit, investment, insurance or transaction outcomes.'
path.write_text(json.dumps(doc,indent=2)+'\n')
print({'formula_markers':len(doc['markers'])})
