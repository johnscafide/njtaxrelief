#!/usr/bin/env python3
"""Append governed v0.36 source markers to the public Data Center catalog.

This is intentionally idempotent. New fields enter the catalog as planned; production
`data_center_provider_coverage` is the authoritative availability contract used by the
signed-in Data Center UI.
"""
from __future__ import annotations
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REG=ROOT/'data'/'marker-registry.json'
PACK=ROOT/'data'/'nj-source-pack-v036.json'

def main():
    reg=json.loads(REG.read_text(encoding='utf-8'))
    pack=json.loads(PACK.read_text(encoding='utf-8'))
    markers=reg.setdefault('markers',[])
    by_id={str(m.get('id')):m for m in markers}
    for item in pack.get('markers',[]):
        mid=str(item['id'])
        row={**item,'proprietary':item.get('origin')=='watchdog-derived','status':'cataloged','provider_status':'planned','status_reason':'Governed catalog definition added; live state is controlled by production data_center_provider_coverage.'}
        if mid in by_id:
            by_id[mid].update(row)
        else:
            markers.append(row);by_id[mid]=row
    summary=reg.setdefault('summary',{})
    summary['total']=len(markers)
    summary['public_source']=sum(m.get('origin')=='public' for m in markers)
    summary['proprietary_derived']=sum(bool(m.get('proprietary')) for m in markers)
    summary['by_tier']={t:sum(m.get('tier')==t for m in markers) for t in ('standard','pro','pro_plus')}
    professions=[p.get('id') for p in reg.get('professions',[]) if p.get('id')]
    summary['by_profession']={p:sum(p in (m.get('professions') or []) for m in markers) for p in professions}
    summary['percent_of_goal']=round(len(markers)/10,1)
    summary['provider_status']=dict(sorted(Counter(str(m.get('provider_status') or 'planned') for m in markers).items()))
    reg['schema_version']='1+provider-status+v036'
    reg['generated_at']=datetime.now(timezone.utc).isoformat()
    reg['catalog_extension']='nj-source-pack-v036.json; availability for entitled users is resolved from production data_center_provider_coverage.'
    REG.write_text(json.dumps(reg,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'markers':len(markers),'v036':len(pack.get('markers',[])),'provider_status':summary['provider_status']},indent=2))

if __name__=='__main__':main()
