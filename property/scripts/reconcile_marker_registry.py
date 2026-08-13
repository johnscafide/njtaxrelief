#!/usr/bin/env python3
"""Reconcile marker catalog status against actual provider capability."""
from __future__ import annotations
import argparse, json, re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; DATA=ROOT/'property'/'data'
REGISTRY=DATA/'marker-registry.json'; SOURCE_REGISTRY=DATA/'source-registry.json'; REPORT=DATA/'marker-reconciliation.json'
HYDRATE=ROOT/'supabase'/'functions'/'workbench-hydrate'/'index.ts'; SCORE=ROOT/'supabase'/'functions'/'workbench-score'/'index.ts'
DIRECT={'nj-parcels-modiv','nj-sr1a','nj-cod','nj-dca-budget','nj-tax-court-appeals'}; RUNTIME={'njdep-dca-live'}
COMPUTED={'watchdog-models','watchdog-professional','watchdog-professional-v030','watchdog-institutional','watchdog-statewide-intelligence','watchdog-models-v035'}
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def providers():
    out=set(DIRECT)
    if HYDRATE.exists(): out.update(re.findall(r"src\s*===\s*['\"]([^'\"]+)['\"]",HYDRATE.read_text(encoding='utf-8')))
    return out
def implemented_scores():
    out=set()
    for p in (HYDRATE,SCORE):
        if p.exists(): out.update(re.findall(r"['\"]((?:watchdog|uniformity)\.[A-Za-z0-9_.-]+)['\"]",p.read_text(encoding='utf-8')))
    return out
def classify(m,direct,scores):
    mid=str(m.get('id') or ''); src=str(m.get('source_id') or ''); origin=str(m.get('origin') or '')
    if mid in scores: return 'computed','server score/provider implementation detected'
    if src in direct: return 'live','direct server provider family detected'
    if src in RUNTIME: return 'live','dedicated runtime provider family'
    if mid.startswith('njplus.'): return 'cataloged','activation-gated source pack; catalog inclusion is not live coverage'
    if origin=='watchdog-derived' or src in COMPUTED: return 'cataloged','derived definition exists but no verified live provider was detected'
    return 'cataloged','cataloged marker with no verified live provider'
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); args=ap.parse_args()
    reg=load(REGISTRY); src_reg=load(SOURCE_REGISTRY); markers=reg.get('markers',[]); ids=[str(m.get('id') or '') for m in markers]
    duplicates=sorted(k for k,v in Counter(ids).items() if k and v>1); direct=providers(); scores=implemented_scores(); governed={str(x.get('id')) for x in src_reg.get('datasets',[]) if x.get('id')}
    counts=Counter(); rows=[]; ungoverned=set()
    for m in markers:
        status,reason=classify(m,direct,scores); source=str(m.get('source_id') or ''); counts[status]+=1
        if source and source not in governed and source not in direct and source not in RUNTIME and source not in COMPUTED: ungoverned.add(source)
        rows.append({'id':m.get('id'),'source_id':source,'previous_status':m.get('status'),'reconciled_status':status,'reason':reason})
        if args.write: m['status']=status; m['status_reason']=reason
    now=datetime.now(timezone.utc).isoformat(); summary={'markers':len(markers),'duplicates':len(duplicates),'by_status':dict(sorted(counts.items())),'direct_provider_families':sorted(direct),'score_marker_implementations_detected':len(scores),'ungoverned_source_aliases':len(ungoverned)}
    REPORT.write_text(json.dumps({'schema_version':1,'generated_at':now,'summary':summary,'duplicates':duplicates,'ungoverned_source_aliases':sorted(ungoverned),'markers':rows},indent=2)+'\n',encoding='utf-8')
    if args.write:
        reg.setdefault('summary',{})['by_status']=dict(sorted(counts.items())); reg['reconciled_at']=now; reg['status_contract']='live = verified provider family; computed = verified implementation; cataloged = definition/source metadata without verified live provider'; REGISTRY.write_text(json.dumps(reg,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,indent=2)); return 1 if duplicates else 0
if __name__=='__main__': raise SystemExit(main())
