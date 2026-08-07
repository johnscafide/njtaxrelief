#!/usr/bin/env python3
"""Sync idea-roadmap status against the governed marker registry."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
road=ROOT/'data'/'next-100-marker-roadmap.json'
doc=json.loads(road.read_text())
live={m['id'] for m in json.loads((ROOT/'data'/'marker-registry.json').read_text())['markers']}
for category in doc.get('categories',[]):
    for marker in category.get('markers',[]):
        if marker[0] in live:
            marker[4]='live'
doc['version']='0.25.0'
doc['strategy']='Professional marker pipeline synchronized against the governed registry. A planned marker becomes live only after source/provenance, plan tier and methodology are implemented.'
doc['live_count']=sum(m[4]=='live' for c in doc.get('categories',[]) for m in c.get('markers',[]))
doc['planned_count']=sum(m[4]!='live' for c in doc.get('categories',[]) for m in c.get('markers',[]))
road.write_text(json.dumps(doc,indent=2)+'\n')
print({'live':doc['live_count'],'planned':doc['planned_count']})
