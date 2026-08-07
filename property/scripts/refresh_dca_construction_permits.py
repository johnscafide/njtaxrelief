#!/usr/bin/env python3
"""Incrementally pull NJ DCA's statewide raw construction-permit feed.

The official feed supplies Treasury municipality code, block, lot, permit and
certificate fields.  Watchdog aggregates only to parcel research keys; it does
not infer a property's condition, compliance, completion, or value.
"""
import argparse, datetime as dt, json, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = 'https://data.nj.gov/resource/w9se-dmra.json'
OUT = ROOT / 'data' / 'dca-construction-permits.json'
STATE = ROOT / 'data' / 'dca-construction-permits-state.json'

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Watchdog-DCA-refresh/1.0 (+https://njpropertytaxrelief.com/property/)','Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())

def parcel_key(row):
    code, block, lot = row.get('treasurycode','').strip(), row.get('block','').strip(), row.get('lot','').strip()
    return '|'.join((code, block, lot)) if code and block and lot else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', help='Permit date lower bound (YYYY-MM-DD). Defaults to last accepted watermark or 2021-07-01.')
    ap.add_argument('--max-records', type=int, default=100000, help='Safety ceiling; rerun incrementally for larger backfills.')
    ap.add_argument('--page-size', type=int, default=50000)
    ap.add_argument('--municipality', help='Optional 4-digit Treasury municipality code.')
    ap.add_argument('--accept', action='store_true', help='Accept this edition as the next incremental watermark.')
    args = ap.parse_args()
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    since = args.since or state.get('watermark') or '2021-07-01'
    where = f"permitdate >= '{since}T00:00:00.000'"
    if args.municipality:
        where += f" AND treasurycode='{args.municipality}'"
    rows, offset = [], 0
    while len(rows) < args.max_records:
        params = {'$where':where, '$order':'permitdate ASC, pk ASC', '$limit':min(args.page_size, args.max_records-len(rows)), '$offset':offset}
        page = get(API + '?' + urllib.parse.urlencode(params))
        rows.extend(page)
        if len(page) < params['$limit']: break
        offset += len(page)
    parcels = defaultdict(lambda: {'permit_issued_count':0,'certificate_count':0,'authorized_construction_cost':0.0,'authorized_square_feet':0.0,'rental_units_gained':0.0,'sale_units_gained':0.0,'latest_permit_date':None,'latest_certificate_date':None,'permit_types':{},'use_groups':{}})
    for row in rows:
        key = parcel_key(row)
        if not key: continue
        rec = parcels[key]
        if row.get('status') == 'P': rec['permit_issued_count'] += 1
        if row.get('status') == 'C': rec['certificate_count'] += 1
        for field in ('constcost','squarefeet','rentgained','salegained'):
            try: value = float(row.get(field) or 0)
            except ValueError: value = 0
            rec[{'constcost':'authorized_construction_cost','squarefeet':'authorized_square_feet','rentgained':'rental_units_gained','salegained':'sale_units_gained'}[field]] += value
        for src, dest in (('permitdate','latest_permit_date'),('certdate','latest_certificate_date')):
            if row.get(src) and (not rec[dest] or row[src] > rec[dest]): rec[dest] = row[src]
        for src, dest in (('permittypedesc','permit_types'),('usegroupdesc','use_groups')):
            if row.get(src): rec[dest][row[src]] = rec[dest].get(row[src],0) + 1
    generated = dt.datetime.now(dt.timezone.utc).isoformat()
    doc = {'schema_version':1,'source':'NJ DCA raw construction permits (w9se-dmra)','source_url':API,'retrieved_at':generated,'query':{'since':since,'municipality':args.municipality,'max_records':args.max_records},'coverage_notice':'Raw statewide feed; DCA states it is unaudited, may be incomplete, and recent two months are not reviewed. This output is public-record research context only.','source_records':len(rows),'parcel_records':len(parcels),'truncated_at_safety_ceiling':len(rows) >= args.max_records,'parcels':parcels}
    OUT.write_text(json.dumps(doc,indent=2)+'\n')
    if args.accept and rows:
        latest = max((x.get('permitdate','')[:10] for x in rows if x.get('permitdate')), default=since)
        STATE.write_text(json.dumps({'schema_version':1,'accepted_at':generated,'watermark':latest,'last_source_records':len(rows),'last_parcel_records':len(parcels)},indent=2)+'\n')
    print(json.dumps({'source_records':len(rows),'parcel_records':len(parcels),'truncated':doc['truncated_at_safety_ceiling'],'since':since},indent=2))

if __name__ == '__main__': main()
