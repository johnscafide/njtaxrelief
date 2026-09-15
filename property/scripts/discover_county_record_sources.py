#!/usr/bin/env python3
"""Discover official/vendor NJ county land-record endpoints without bypassing access controls.

The output inventories candidate pages for deeds, mortgages, liens, lis pendens,
recording search, clerk records and bulk/API access. It does not perform premium
searches or convert a discovered portal into a clearance result.
"""
from __future__ import annotations

import argparse, concurrent.futures, datetime as dt, html.parser, json, pathlib, re
import urllib.parse, urllib.request
from collections import defaultdict
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / '.cache/transaction-sources/county-record-discovery.json'
STATE_LOCAL_GOV = 'https://www.nj.gov/nj/gov/county/localgov.shtml'
UA = 'Watchdog-county-record-source-discovery/1.0 (+https://www.watchdogindex.com/)'
COUNTIES = ['Atlantic','Bergen','Burlington','Camden','Cape May','Cumberland','Essex','Gloucester','Hudson','Hunterdon','Mercer','Middlesex','Monmouth','Morris','Ocean','Passaic','Salem','Somerset','Sussex','Union','Warren']
TERMS = {
  'clerk_land_records': ('county clerk','land records','property records','recording','recorded documents'),
  'deeds_mortgages': ('deed','deeds','mortgage','mortgages','discharge','cancellation'),
  'liens': ('lien','liens','construction lien','municipal lien','federal lien'),
  'lis_pendens': ('lis pendens','lis-pendens','notice of pendency'),
  'search_portal': ('search records','online records','property search','record search','search anywhere'),
  'bulk_api': ('bulk data','api','data download','subscription','premium access','commercial access'),
}

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def req(url): return urllib.request.Request(url, headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'})
def fetch(url, timeout=20, max_bytes=2_000_000):
    with urllib.request.urlopen(req(url), timeout=timeout) as r:
        return r.read(max_bytes).decode('utf-8', errors='replace'), int(r.status)

class Links(html.parser.HTMLParser):
    def __init__(self): super().__init__(); self.links=[]; self.href=None; self.txt=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower()=='a': self.href=dict(attrs).get('href'); self.txt=[]
    def handle_data(self, data):
        if self.href is not None: self.txt.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=='a' and self.href is not None:
            self.links.append((' '.join(''.join(self.txt).split()), self.href)); self.href=None; self.txt=[]

def links_from(base, text):
    p=Links(); p.feed(text); out=[]; seen=set()
    for label,href in p.links:
        if not href or href.startswith(('mailto:','tel:','javascript:','#')): continue
        url=urllib.parse.urljoin(base,href)
        if url.startswith(('http://','https://')) and url not in seen: seen.add(url); out.append((label,url))
    return out

def host(url): return (urllib.parse.urlparse(url).hostname or '').lower().removeprefix('www.')
def same_site(a,b):
    x,y=host(a),host(b); return bool(x and y and (x==y or x.endswith('.'+y) or y.endswith('.'+x)))

def county_roots():
    page,_=fetch(STATE_LOCAL_GOV,30)
    candidates=[]
    for label,url in links_from(STATE_LOCAL_GOV,page):
        hay=(label+' '+url).lower()
        for county in COUNTIES:
            c=county.lower()
            if c in hay and ('county' in hay or 'co.' in hay):
                candidates.append({'county':county,'root_url':url,'directory_label':label,'directory_source':STATE_LOCAL_GOV}); break
    # Prefer one root per county; manual fallback roots are discovery seeds only.
    by={}
    for row in candidates:
        by.setdefault(row['county'],row)
    return [by.get(c,{'county':c,'root_url':f'https://www.google.com/search?q={urllib.parse.quote(c+" County NJ Clerk land records")}', 'directory_label':'unresolved','directory_source':STATE_LOCAL_GOV}) for c in COUNTIES]

def score(label,url):
    hay=(label+' '+urllib.parse.unquote(url)).lower().replace('-',' ').replace('_',' ')
    out={}
    for family,terms in TERMS.items():
        best=0
        for term in terms:
            if term in hay: best=max(best,6 if term in label.lower() else 4)
        if best: out[family]=best
    return out

def crawl(row,max_pages):
    root=row['root_url']; result={**row,'checked_at':now(),'candidates':{},'errors':[],'pages_checked':0}
    if host(root)=='www.google.com' or host(root)=='google.com':
        result['status']='root_unresolved'; return result
    q=[(root,0)]; visited=set(); found=defaultdict(list)
    while q and len(visited)<max_pages:
        url,depth=q.pop(0)
        if url in visited or not same_site(root,url): continue
        visited.add(url)
        try: text,status=fetch(url)
        except Exception as exc: result['errors'].append({'url':url,'error':str(exc)[:180]}); continue
        if status!=200: continue
        for label,href in links_from(url,text):
            s=score(label,href)
            for family,n in s.items(): found[family].append({'label':label or href,'url':href,'score':n+(1 if depth==0 else 0),'found_by':f'same-site depth {depth}'})
            hay=(label+' '+href).lower()
            if depth<2 and same_site(root,href) and (s or any(k in hay for k in ('clerk','records','recording','services','departments','forms'))): q.append((href,depth+1))
    compact={}
    for family,rows in found.items():
        uniq={}
        for r in rows:
            if r['url'] not in uniq or r['score']>uniq[r['url']]['score']: uniq[r['url']]=r
        compact[family]=sorted(uniq.values(), key=lambda x:(-x['score'],len(x['url'])))[:10]
    result['candidates']=compact; result['pages_checked']=len(visited); result['status']='ok'; result['coverage']={k:bool(compact.get(k)) for k in TERMS}
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__); ap.add_argument('--out',type=pathlib.Path,default=DEFAULT_OUT); ap.add_argument('--workers',type=int,default=8); ap.add_argument('--max-pages-per-site',type=int,default=18); ap.add_argument('--limit',type=int)
    args=ap.parse_args(); roots=county_roots(); roots=roots[:args.limit] if args.limit else roots
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.workers,12))) as pool: results=list(pool.map(lambda r:crawl(r,args.max_pages_per_site),roots))
    report={'schema_version':1,'generated_at':now(),'policy':'Discovery only. Portal found != search completed; premium/auth/CAPTCHA boundaries must be honored.','counties':results,'coverage_summary':{k:sum(bool(r.get('candidates',{}).get(k)) for r in results) for k in TERMS}}
    args.out.parent.mkdir(parents=True,exist_ok=True); args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8'); print(json.dumps({'counties':len(results),'output':str(args.out),'coverage':report['coverage_summary']})); return 0

if __name__=='__main__': raise SystemExit(main())
