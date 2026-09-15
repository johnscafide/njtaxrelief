#!/usr/bin/env python3
"""Summarize NJ transaction-source discovery without logging parcel/account PII.

Consumes municipal and county discovery JSON and prints aggregate provider/domain
coverage only. Intended for CI/provider-adapter planning.
"""
from __future__ import annotations
import argparse, json, pathlib, urllib.parse
from collections import Counter, defaultdict


def host(url: str) -> str:
    return (urllib.parse.urlparse(url or '').hostname or '').lower().removeprefix('www.')


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--municipal',type=pathlib.Path,required=True)
    ap.add_argument('--county',type=pathlib.Path,required=True)
    args=ap.parse_args()
    municipal=json.loads(args.municipal.read_text(encoding='utf-8'))
    county=json.loads(args.county.read_text(encoding='utf-8'))

    providers=Counter(); external_hosts=Counter(); family_provider=defaultdict(Counter)
    rows=municipal.get('municipalities') or municipal.get('results') or []
    for row in rows:
        for p in row.get('external_providers') or []:
            key=p.get('provider_key') or 'unclassified_external'
            providers[key]+=1
            h=host(p.get('url',''))
            if h: external_hosts[h]+=1
            for fam in p.get('families') or []: family_provider[fam][key]+=1
        for fam,cands in (row.get('candidates') or {}).items():
            for c in cands or []:
                p=c.get('provider') or {}
                key=p.get('provider_key')
                if key: family_provider[fam][key]+=1

    county_hosts=Counter(); county_families=defaultdict(Counter)
    for row in county.get('counties') or []:
        for fam,cands in (row.get('candidates') or {}).items():
            for c in cands or []:
                h=host(c.get('url',''))
                if h:
                    county_hosts[h]+=1
                    county_families[fam][h]+=1

    print(json.dumps({
        'municipality_count': len(rows),
        'known_provider_counts': providers.most_common(),
        'external_host_counts': external_hosts.most_common(60),
        'family_provider_counts': {k:v.most_common() for k,v in sorted(family_provider.items())},
        'county_count': len(county.get('counties') or []),
        'county_host_counts': county_hosts.most_common(80),
        'county_family_hosts': {k:v.most_common(40) for k,v in sorted(county_families.items())},
    }, indent=2))
    return 0

if __name__=='__main__': raise SystemExit(main())
