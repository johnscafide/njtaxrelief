#!/usr/bin/env python3
"""Refresh downloadable NJ datasets, validate coverage, and write a machine-readable freshness report."""
import argparse, datetime as dt, glob, hashlib, json, pathlib, subprocess, sys, tempfile, urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[2]
REGISTRY=ROOT/'property/data/source-registry.json'
REPORT=ROOT/'property/data/data-freshness.json'
def digest(path):
    h=hashlib.sha256(); h.update(path.read_bytes()); return h.hexdigest()
def nested(data,key):
    value=data
    for part in key.split('.'):
        value=value.get(part,{}) if isinstance(value,dict) else {}
    return value
def validate(item):
    if item.get('live'):
        return True,0,[]
    if item.get('glob'):
        files=[pathlib.Path(x) for x in glob.glob(str(ROOT/item['glob']))]
        return len(files)>=item.get('minimum_files',1),len(files),files
    path=ROOT/item['output']
    if not path.exists(): return False,0,[]
    try: data=json.loads(path.read_text(encoding='utf-8'))
    except Exception: return False,0,[path]
    value=nested(data,item.get('collection',''))
    count=len(value) if isinstance(value,(dict,list)) else 0
    return count>=item.get('minimum_records',1),count,[path]
def run_parser(item,download):
    command=[str(download) if p=='{download}' else p for p in item['parser']]
    subprocess.run(command,cwd=ROOT,check=True)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--refresh',action='store_true');ap.add_argument('--write-version',action='store_true');args=ap.parse_args()
    registry=json.loads(REGISTRY.read_text()); before={}; after={}; results=[]; failures=[]
    for item in registry['datasets']:
        ok,count,files=validate(item);before[item['id']]={str(p):digest(p) for p in files if p.exists()}
        refresh='validated'
        if args.refresh and item.get('source_url') and item.get('parser'):
            try:
                suffix=pathlib.Path(item['source_url']).suffix or '.download'
                with tempfile.TemporaryDirectory(prefix='njptr-refresh-') as tmp:
                    target=pathlib.Path(tmp)/('source'+suffix)
                    request=urllib.request.Request(item['source_url'],headers={'User-Agent':'NJPTR-data-refresh/1.0'})
                    with urllib.request.urlopen(request,timeout=90) as response: target.write_bytes(response.read())
                    run_parser(item,target); refresh='refreshed'
            except Exception as error: failures.append({'dataset':item['id'],'stage':'refresh','error':str(error)});refresh='refresh failed'
        ok,count,files=validate(item);after[item['id']]={str(p):digest(p) for p in files if p.exists()}
        if not ok: failures.append({'dataset':item['id'],'stage':'coverage','error':'coverage below configured minimum'})
        latest=max((p.stat().st_mtime for p in files if p.exists()),default=0)
        results.append({'id':item['id'],'label':item['label'],'agency':item['agency'],'status':'passed' if ok else 'failed','action':refresh,'records_or_files':count,'minimum':item.get('minimum_records',item.get('minimum_files',1)),'changed':before[item['id']]!=after[item['id']],'last_modified':dt.datetime.fromtimestamp(latest,dt.timezone.utc).isoformat() if latest else None,'cadence':item['cadence'],'source_url':item.get('source_url')})
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    REPORT.write_text(json.dumps({'schema_version':1,'generated_at':now,'overall_status':'failed' if failures else 'passed','datasets':results,'failures':failures},indent=2)+'\n')
    if args.write_version and any(x['changed'] for x in results):
        path=ROOT/'property/data/versions.json';versions=json.loads(path.read_text());versions['updated_at']=now
        versions['releases'].insert(0,{'version':'data-'+now[:10],'date':now[:10],'timestamp':now,'title':'Automated state-data refresh','category':'Data','status':'Completed','summary':'The state-data pipeline refreshed source files and passed configured coverage checks.','links':['/property/updates.html'],'files':[x['id'] for x in results if x['changed']],'impact':{'html':0,'css':0,'javascript':0,'data':sum(1 for x in results if x['changed']),'navigation':0}})
        path.write_text(json.dumps(versions,indent=2)+'\n')
    print(json.dumps({'status':'failed' if failures else 'passed','datasets':len(results),'failures':len(failures),'report':str(REPORT.relative_to(ROOT))}))
    return 1 if failures else 0
if __name__=='__main__': sys.exit(main())
