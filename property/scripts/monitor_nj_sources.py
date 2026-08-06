#!/usr/bin/env python3
"""Fingerprint authoritative source endpoints and report publisher changes.

This watcher does not publish new tax data. It only alerts that an authoritative
source changed so the normal review/refresh pipeline can fetch, validate, and
approve the new edition.
"""
import argparse, datetime as dt, hashlib, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTRY = ROOT / 'property/data/source-registry.json'
STATE = ROOT / 'property/data/source-watch-state.json'
REPORT = ROOT / 'property/data/source-monitor-report.json'

def fingerprint(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Watchdog-source-monitor/1.0 (+https://njpropertytaxrelief.com/property/)','Accept':'text/html,application/json,application/octet-stream;q=0.8,*/*;q=0.5'})
    with urllib.request.urlopen(req, timeout=45) as response:
        body = response.read(2_000_000)
        return {'status': response.status, 'etag': response.headers.get('ETag'), 'last_modified': response.headers.get('Last-Modified'), 'content_length': response.headers.get('Content-Length'), 'sha256_prefix_2mb': hashlib.sha256(body).hexdigest()}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--accept', action='store_true'); ap.add_argument('--list', action='store_true'); args = ap.parse_args()
    sources = [x for x in json.loads(REGISTRY.read_text())['datasets'] if x.get('source_url')]
    if args.list:
        print('\n'.join(f"{x['id']}\t{x['cadence']}\t{x['source_url']}" for x in sources)); return 0
    prior = json.loads(STATE.read_text()) if STATE.exists() else {'sources': {}}
    current, changed, errors = {}, [], []
    for item in sources:
        try:
            fp = fingerprint(item['source_url']); current[item['id']] = {'url': item['source_url'], 'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(), **fp}
            old = prior.get('sources', {}).get(item['id'])
            if old and any(old.get(k) != fp.get(k) for k in ('etag','last_modified','content_length','sha256_prefix_2mb')):
                changed.append({'id': item['id'], 'label': item['label'], 'agency': item['agency'], 'url': item['source_url'], 'before': old, 'after': fp})
        except Exception as error:
            errors.append({'id': item['id'], 'url': item['source_url'], 'error': str(error)})
    report = {'schema_version': 1, 'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'checked': len(current), 'changed': changed, 'errors': errors, 'baseline_missing': not bool(prior.get('sources'))}
    REPORT.write_text(json.dumps(report, indent=2) + '\n')
    if args.accept or not prior.get('sources'):
        STATE.write_text(json.dumps({'schema_version': 1, 'accepted_at': report['checked_at'], 'sources': current}, indent=2) + '\n')
    print(json.dumps({'checked': len(current), 'changed': len(changed), 'errors': len(errors), 'baseline_missing': report['baseline_missing']}))
    return 0

if __name__ == '__main__': raise SystemExit(main())
