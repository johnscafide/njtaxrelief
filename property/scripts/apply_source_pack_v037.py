#!/usr/bin/env python3
"""Apply the governed v0.37 affordable-housing source pack to the canonical marker registry.

New markers enter as planned. Existing semantic-correction targets keep their current provider
status so backward-compatible IDs are not accidentally demoted while their labels/source semantics
are corrected.
"""
from __future__ import annotations
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REG=ROOT/'data'/'marker-registry.json'
PACK=ROOT/'data'/'nj-source-pack-v037.json'

def main():
    reg=json.loads(REG.read_text(encoding='utf-8'))
    pack=json.loads(PACK.read_text(encoding='utf-8'))
    markers=reg.setdefault('markers',[]);by_id={str(m.get('id')):m for m in markers}
    added=0
    for item in pack.get('markers',[]):
        mid=str(item['id'])
        if mid in by_id:
            prior=by_id[mid]
            keep={k:prior.get(k) for k in ('provider_status','provider_note','provider_contract','status','status_reason') if k in prior}
            prior.update(item);prior.update(keep)
        else:
            row={**item,'proprietary':False,'status':'cataloged','provider_status':'planned','status_reason':'Governed catalog definition added; live state is controlled by production data_center_provider_coverage.'}
            markers.append(row);by_id[mid]=row;added+=1
    corrected=[]
    for mid,patch in (pack.get('semantic_corrections') or {}).items():
        row=by_id.get(mid)
        if not row:raise RuntimeError(f'Missing semantic correction target: {mid}')
        row.update(patch);corrected.append(mid)
    summary=reg.setdefault('summary',{})
    summary['total']=len(markers);summary['public_source']=sum(m.get('origin')=='public' for m in markers);summary['proprietary_derived']=sum(bool(m.get('proprietary')) for m in markers)
    summary['by_tier']={t:sum(m.get('tier')==t for m in markers) for t in ('standard','pro','pro_plus')}
    professions=[p.get('id') for p in reg.get('professions',[]) if p.get('id')]
    summary['by_profession']={p:sum(p in (m.get('professions') or []) for m in markers) for p in professions}
    summary['percent_of_goal']=round(len(markers)/10,1)
    summary['provider_status']=dict(sorted(Counter(str(m.get('provider_status') or 'planned') for m in markers).items()))
    reg['schema_version']='1+provider-status+v037';reg['generated_at']=datetime.now(timezone.utc).isoformat();reg['catalog_extension']='nj-source-pack-v037.json; availability is resolved from production data_center_provider_coverage.'
    REG.write_text(json.dumps(reg,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'total':len(markers),'added':added,'semantic_corrections':corrected,'provider_status':summary['provider_status']},indent=2))

if __name__=='__main__':main()
