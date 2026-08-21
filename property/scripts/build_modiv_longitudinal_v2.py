#!/usr/bin/env python3
"""Build one governed 2021-2026 MOD-IV longitudinal release.

Uses 7-Zip for the NJ Treasury archives because 2021-2023 use a ZIP
compression method unsupported by Python's stdlib zipfile. Raw State archives
and extracted raw records remain ephemeral. Only parcel identity plus the
assessment-history allowlist are written to private district partitions.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import quote

import requests

YEARS=tuple(range(2021,2027))
SOURCE='https://www.nj.gov/treasury/taxation/pdf/lpt/modiv-{year}.zip'
SOURCE_INDEX='https://www.nj.gov/treasury/taxation/lpt/statdata.shtml'
LAYOUT='https://www.nj.gov/treasury/taxation/pdf/lpt/modivlayout.pdf'
SOURCE_ID='nj-dca-modiv-longitudinal'
BUCKET='modiv-longitudinal'
SLICES={'district':(0,4),'block':(4,13),'lot':(13,22),'qualifier':(22,33),'class':(55,58),'land':(420,429),'improvement':(429,438),'total':(438,447)}
EXEMPT=(459,468,477,486)


def norm(v:str)->str:
    s=v.strip().upper()
    if not s:return ''
    if re.fullmatch(r'\d+(?:\.\d+)?',s):
        try:
            out=format(Decimal(s).normalize(),'f')
            return out.rstrip('0').rstrip('.') if '.' in out else out
        except InvalidOperation: pass
    return re.sub(r'\s+',' ',s)


def num(v:str):
    s=v.strip()
    return int(s) if s.isdigit() else None


def parse(line:str,year:int):
    if len(line)<700 or not re.fullmatch(r'\d{4}',line[:4]):return None
    g=lambda k:line[slice(*SLICES[k])]
    d,b,l,q=g('district').strip(),norm(g('block')),norm(g('lot')),norm(g('qualifier'))
    if not d or not b or not l:return None
    return {'y':year,'d':d,'b':b,'l':l,'q':q,'c':g('class').strip() or None,'lv':num(g('land')),'iv':num(g('improvement')),'nv':num(g('total')),'ex':[line[i:i+1].strip() for i in EXEMPT if line[i:i+1].strip()]}


class Spool:
    def __init__(self,root:Path,max_open=32):self.root=root;self.max=max_open;self.handles=OrderedDict()
    def write(self,row):
        d=row['d'];h=self.handles.pop(d,None)
        if h is None:
            if len(self.handles)>=self.max:
                _,old=self.handles.popitem(last=False);old.close()
            h=(self.root/f'{d}.jsonl').open('a',encoding='utf-8')
        self.handles[d]=h;h.write(json.dumps(row,separators=(',',':'))+'\n')
    def close(self):
        for h in self.handles.values():h.close()
        self.handles.clear()


def download(url:str,path:Path,timeout:int):
    with requests.get(url,stream=True,timeout=timeout,headers={'User-Agent':'Watchdog-DataCenter/1.0'}) as r:
        r.raise_for_status()
        with path.open('wb') as f:
            for chunk in r.iter_content(1024*1024):
                if chunk:f.write(chunk)


def extract_7z(archive:Path,out:Path):
    exe=shutil.which('7z') or shutil.which('7zz')
    if not exe:raise RuntimeError('7z/7zz is required for Treasury legacy ZIP compression')
    out.mkdir(parents=True,exist_ok=True)
    p=subprocess.run([exe,'x','-y',f'-o{out}',str(archive)],capture_output=True,text=True)
    if p.returncode!=0:raise RuntimeError('7z extraction failed: '+(p.stderr or p.stdout)[-1000:])


def gzip_json(path:Path,payload:dict):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(payload,separators=(',',':'),sort_keys=True).encode()
    with path.open('wb') as f:
        with gzip.GzipFile(filename='',mode='wb',fileobj=f,compresslevel=6,mtime=0) as z:z.write(raw)


def build_partition(src:Path,district:str,years:list[int],dest:Path):
    parcels=defaultdict(dict);dups=conflicts=0
    with src.open(encoding='utf-8') as f:
        for line in f:
            r=json.loads(line);k=f"{r['b']}|{r['l']}|{r['q']}";y=int(r['y'])
            prior=parcels[k].get(y)
            if prior is not None:
                dups+=1
                if any(prior.get(x)!=r.get(x) for x in ('c','lv','iv','nv','ex')):conflicts+=1
                continue
            parcels[k][y]=r
    if conflicts:raise RuntimeError(f'{district}: {conflicts} conflicting duplicate parcel-year rows')
    records={}
    for k in sorted(parcels):
        rows=parcels[k];ys=sorted(rows)
        records[k]={'years':ys,'land':{str(y):rows[y]['lv'] for y in ys if rows[y]['lv'] is not None},'improvement':{str(y):rows[y]['iv'] for y in ys if rows[y]['iv'] is not None},'total':{str(y):rows[y]['nv'] for y in ys if rows[y]['nv'] is not None},'class':{str(y):rows[y]['c'] for y in ys if rows[y]['c'] is not None},'exemptions':{str(y):rows[y]['ex'] for y in ys}}
    payload={'schema_version':2,'source_id':SOURCE_ID,'district_code':district,'source_years':years,'record_count':len(records),'records':records}
    gzip_json(dest,payload)
    return {'district_code':district,'parcel_count':len(records),'duplicate_rows':dups,'conflicting_duplicates':conflicts,'bytes_gzip':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'filename':dest.name}


def upload(project,key,obj:Path,remote:str,content_type:str):
    url=project.rstrip('/')+'/storage/v1/object/'+quote(BUCKET,safe='')+'/'+quote(remote,safe='/')
    headers={'Authorization':f'Bearer {key}','apikey':key,'Content-Type':content_type,'x-upsert':'true'}
    with obj.open('rb') as f:r=requests.post(url,headers=headers,data=f,timeout=180)
    if r.status_code not in (200,201):raise RuntimeError(f'upload {remote} failed {r.status_code}: {r.text[:300]}')


def upsert_release(project,key,row):
    url=project.rstrip('/')+'/rest/v1/modiv_longitudinal_releases?on_conflict=release_id'
    headers={'Authorization':f'Bearer {key}','apikey':key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'}
    r=requests.post(url,headers=headers,json=row,timeout=60)
    if r.status_code not in (200,201,204):raise RuntimeError(f'release upsert failed {r.status_code}: {r.text[:300]}')


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--release-id',default='treasury-modiv-2021-2026-v2');ap.add_argument('--diagnostic',default='property/data/modiv-longitudinal-build-summary.json');ap.add_argument('--publish',action='store_true');ap.add_argument('--timeout',type=int,default=240);a=ap.parse_args()
    years=list(YEARS);release=a.release_id
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,79}',release):raise SystemExit('invalid release id')
    diagnostics={'schema_version':2,'source_id':SOURCE_ID,'release_id':release,'source_years':years,'source_rows':{},'districts_by_year':{},'archives':{},'privacy_contract':{'raw_archives_persisted':False,'owner_names_retained':False,'mailing_addresses_retained':False,'social_security_numbers_retained':False,'mortgage_account_numbers_retained':False,'safe_fields_only':True}}
    with tempfile.TemporaryDirectory(prefix='modiv-v2-') as td:
        root=Path(td);spool=Spool(root/'spool');(root/'spool').mkdir()
        for year in years:
            archive=root/f'{year}.zip';extract=root/f'extract-{year}';url=SOURCE.format(year=year);download(url,archive,a.timeout);extract_7z(archive,extract)
            count=0;districts=set();members=[]
            for file in sorted(p for p in extract.rglob('*') if p.is_file()):
                members.append({'name':file.name,'bytes':file.stat().st_size})
                with file.open('rb') as f:
                    for raw in f:
                        line=raw.rstrip(b'\r\n').decode('latin-1',errors='replace');r=parse(line[:700],year)
                        if r:spool.write(r);count+=1;districts.add(r['d'])
            diagnostics['source_rows'][str(year)]=count;diagnostics['districts_by_year'][str(year)]=len(districts);diagnostics['archives'][str(year)]={'url':url,'bytes':archive.stat().st_size,'member_count':len(members),'members':members}
            if count<1_000_000 or len(districts)<560:raise RuntimeError(f'{year}: source contract failed rows={count} districts={len(districts)}')
            print(year,count,len(districts))
        spool.close()
        out=root/'release';parts=[]
        for src in sorted((root/'spool').glob('*.jsonl')):parts.append(build_partition(src,src.stem,years,out/'district'/f'{src.stem}.json.gz'))
        if len(parts)<560:raise RuntimeError(f'only {len(parts)} district partitions')
        manifest={'schema_version':2,'source_id':SOURCE_ID,'release_id':release,'source_index':SOURCE_INDEX,'file_layout':LAYOUT,'source_years':years,'source_urls':[SOURCE.format(year=y) for y in years],'source_row_counts':diagnostics['source_rows'],'source_rows_total':sum(diagnostics['source_rows'].values()),'district_count':len(parts),'parcel_records_across_partitions':sum(x['parcel_count'] for x in parts),'privacy_contract':diagnostics['privacy_contract'],'partitions':parts}
        manifest_path=out/'manifest.json';manifest_path.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
        diagnostics.update({'source_rows_total':manifest['source_rows_total'],'district_count':len(parts),'parcel_records_across_partitions':manifest['parcel_records_across_partitions'],'partition_bytes_total':sum(x['bytes_gzip'] for x in parts),'duplicate_rows_total':sum(x['duplicate_rows'] for x in parts),'conflicting_duplicates_total':sum(x['conflicting_duplicates'] for x in parts)})
        Path(a.diagnostic).write_text(json.dumps(diagnostics,indent=2,sort_keys=True)+'\n')
        if a.publish:
            project=os.environ.get('SUPABASE_URL','').strip();key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','').strip()
            if not project or not key:raise RuntimeError('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY required')
            prefix=f'releases/{release}'
            for i,p in enumerate(parts,1):upload(project,key,out/'district'/p['filename'],f"{prefix}/district/{p['filename']}",'application/gzip');print('uploaded',i,'/',len(parts)) if i%50==0 else None
            upload(project,key,manifest_path,f'{prefix}/manifest.json','application/json')
            upsert_release(project,key,{'release_id':release,'storage_prefix':prefix,'source_years':years,'source_urls':manifest['source_urls'],'record_count':manifest['source_rows_total'],'district_count':len(parts),'manifest':{'schema_version':2,'source_id':SOURCE_ID,'source_row_counts':diagnostics['source_rows'],'parcel_records_across_partitions':manifest['parcel_records_across_partitions'],'manifest_sha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),'privacy_contract':diagnostics['privacy_contract']},'status':'candidate','built_at':datetime.now(timezone.utc).isoformat()})
            print('published candidate',release)
    print(json.dumps({k:diagnostics[k] for k in ('release_id','source_rows','districts_by_year','district_count','source_rows_total','parcel_records_across_partitions','conflicting_duplicates_total')},indent=2))

if __name__=='__main__':main()
