#!/usr/bin/env python3
"""Statewide municipal resale/CO census v3.

Runs the existing 564-municipality source discovery, then deepens only the resale/CO
family by reading official page body text and following construction/housing/forms
paths up to depth 3. This catches municipal naming variants such as Resale Certificate,
Continued Certificate of Occupancy, Certificate of Compliance and transfer inspection.
Missing or ambiguous evidence remains VERIFY; the script never infers not-required.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, html, importlib.util, json, pathlib, re, urllib.parse
from collections import deque
from typing import Any
ROOT=pathlib.Path(__file__).resolve().parents[2]
V2=ROOT/'property/scripts/enrich_transaction_municipal_requirements_v2.py'
BASE=ROOT/'property/scripts/extract_transaction_municipal_requirements.py'
ALIASES=(
 'certificate of occupancy','continued certificate','continued certificate of occupancy',
 'certificate of continued occupancy','continued occupancy','cco','resale inspection',
 'resale certificate','resale cco','resale occupancy','resale permit','occupancy inspection',
 'change of occupancy','change of occupancy certificate','certificate of compliance',
 'transfer certificate','property transfer inspection','sale inspection','housing resale'
)
NAV=('construction','building','housing','code enforcement','property maintenance','community services','permits','forms','documents','applications','resale','occupancy','certificate','inspection')
ANCHOR=re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',re.I|re.S)
TAG=re.compile(r'<[^>]+>')

def load(path,name):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
v2=load(V2,'v2');base=load(BASE,'base')

def text(v):return ' '.join(html.unescape(TAG.sub(' ',str(v or ''))).split())
def hit(v):
 h=text(v).lower();return any(a in h for a in ALIASES)
def same(seed,url):
 a=(urllib.parse.urlparse(seed).hostname or '').lower().removeprefix('www.');b=(urllib.parse.urlparse(url).hostname or '').lower().removeprefix('www.');return bool(a and b and (a==b or a.endswith('.'+b) or b.endswith('.'+a)))
def fetch_html(url):
 try:
  raw,ctype,final=base.fetch_bytes(url,timeout=18,max_bytes=3_000_000)
  if 'pdf' in ctype or urllib.parse.urlsplit(final).path.lower().endswith('.pdf'):return '',final
  return raw.decode('utf-8',errors='replace'),final
 except Exception:return '',url

def deep_candidates(row:dict[str,Any],max_pages=55):
 root=str(row.get('root_url') or '')
 if not root:return []
 q=deque([(root,0)]);seen=set();found=[];found_urls=set()
 while q and len(seen)<max_pages:
  url,depth=q.popleft()
  if url in seen or not same(root,url):continue
  seen.add(url);raw,final=fetch_html(url)
  if not raw:continue
  body=text(raw)
  if hit(body+' '+final) and final not in found_urls:
   found_urls.add(final);found.append({'label':'Official resale / occupancy page','url':final,'score':20,'found_by':'v3 official page body'})
  for href,labelraw in ANCHOR.findall(raw):
   href=html.unescape(href);label=text(labelraw);target=urllib.parse.urljoin(final,href)
   if not target.startswith(('http://','https://')) or not same(root,target):continue
   hay=(label+' '+urllib.parse.unquote(target)).lower()
   if hit(hay) and target not in found_urls:
    found_urls.add(target);found.append({'label':label or 'Resale / occupancy form','url':target,'score':24,'found_by':'v3 official link alias'})
   if depth<3 and (any(k in hay for k in NAV) or (depth==0 and len(q)<30)):
    q.append((target,depth+1))
 return sorted(found,key=lambda x:(-int(x.get('score') or 0),len(x.get('url') or '')))[:14]

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--municipal',required=True);ap.add_argument('--out',required=True);args=ap.parse_args()
 doc=json.load(open(args.municipal,encoding='utf-8'));rows=doc.get('results') or [];codes={str(r.get('municipality_code') or '') for r in rows}
 if len(codes)!=564:raise SystemExit(f'Expected 564 municipality codes, got {len(codes)}')
 generated=dt.datetime.now(dt.timezone.utc).isoformat();obk,oun=v2.ordinance_links_county_aware(base);out=[];deep_hits=0
 for muni in rows:
  clone=dict(muni);candidates={k:list(v or []) for k,v in (clone.get('candidates') or {}).items()}
  existing=list(candidates.get('certificate_of_occupancy') or [])
  deep=deep_candidates(clone)
  if deep:deep_hits+=1
  by={str(x.get('url') or ''):x for x in existing+deep if x.get('url')}
  candidates['certificate_of_occupancy']=sorted(by.values(),key=lambda x:(-int(x.get('score') or 0),len(str(x.get('url') or ''))))[:16]
  clone['candidates']=candidates
  for family in ('resale_cco','smoke_fire_cert'):
   r=v2.build_row_v2(base,clone,family,obk,oun,generated);r['metadata']={**(r.get('metadata') or {}),'extractor_version':3,'deep_resale_candidate_count':len(deep),'resale_aliases_version':'v3','never_infer_not_required':True};out.append(r)
 summary={'municipalities':len(codes),'rows':len(out),'deep_resale_source_hits':deep_hits,'families':{}}
 for fam in ('resale_cco','smoke_fire_cert'):
  rr=[x for x in out if x['requirement_key']==fam];summary['families'][fam]={'states':{s:sum(x['requirement_state']==s for x in rr) for s in ('explicit_required','official_process_found','statewide_baseline','verify')},'with_application':sum(bool(x.get('application_url')) for x in rr),'with_municipality_specific_items':sum(int((x.get('metadata') or {}).get('municipality_specific_item_count') or 0)>0 for x in rr)}
 json.dump({'generated_at':generated,'summary':summary,'rows':out},open(args.out,'w',encoding='utf-8'),indent=2,ensure_ascii=False);print(json.dumps(summary,sort_keys=True));return 0
if __name__=='__main__':raise SystemExit(main())
