#!/usr/bin/env python3
"""Per municipality ratio table from parsed SR1A sales. Small enough to ship."""
import json, os, statistics, glob, sys
from collections import defaultdict

src = sys.argv[1] if len(sys.argv) > 1 else 'allnj'
dst = sys.argv[2] if len(sys.argv) > 2 else '/mnt/user-data/outputs/sr1a-ratios.json'

towns, county_of = defaultdict(list), {}
for f in glob.glob(os.path.join(src, 'sales-*.json')):
    d = json.load(open(f))
    for s in d['sales']:
        if s['c'].strip() != '2' or not s.get('r'):
            continue
        towns[s['d']].append(s)
        county_of[s['d']] = d['county']

def trimmed(vals):
    vals = sorted(vals)
    if len(vals) < 8:
        return statistics.median(vals)
    q1, q3 = vals[len(vals)//4], vals[3*len(vals)//4]
    iqr = q3 - q1
    keep = [v for v in vals if q1 - 1.5*iqr <= v <= q3 + 1.5*iqr]
    return statistics.median(keep or vals)

out = {}
thin = 0
for d, sales in sorted(towns.items()):
    if len(sales) < 10:
        thin += 1
        continue
    ratios = sorted(s['r'] for s in sales)
    prices = [s['p'] for s in sales]
    sf = [s['ppsf'] for s in sales if s.get('ppsf')]
    by_year = defaultdict(list)
    for s in sales:
        by_year[s['y']].append(s['p'])
    ys = sorted(y for y in by_year if len(by_year[y]) >= 6)
    drift = None
    if len(ys) >= 2:
        a, b = statistics.median(by_year[ys[0]]), statistics.median(by_year[ys[-1]])
        gap = ys[-1] - ys[0]
        if a > 0 and gap > 0:
            drift = round((b/a) ** (1/gap) - 1, 4)
    out[d] = {
        'county': county_of[d], 'n': len(sales),
        'ratio': round(trimmed(ratios), 4),
        'p25': round(ratios[len(ratios)//4], 4),
        'p75': round(ratios[3*len(ratios)//4], 4),
        'medPrice': int(statistics.median(prices)),
        'ppsf': int(statistics.median(sf)) if sf else None,
        'drift': drift,
        'years': [ys[0], ys[-1]] if ys else None,
    }

json.dump({
    '_readme': [
        'Assessment to sale ratio per municipality, measured from the NJ Division of',
        'Taxation SR1A file using ONLY sales the state itself verified as usable',
        "arm's length transactions. Class 2 residential only.",
        '',
        "This is NOT the published Director's Ratio. That figure is certified each",
        'October for the following tax year, so it is priced roughly eighteen months',
        'behind the market. This is measured from the newest verified sales, which is',
        'why it runs lower in a rising market and lands far closer to what homes',
        'actually sell for.',
        '',
        'Keyed by 4 digit district code: 2 digit county plus 2 digit municipality.',
        'ratio is an IQR trimmed median. drift is annual price movement from the same',
        'verified sales. ppsf is median price per square foot of living space.',
        'Towns with fewer than 10 verified sales are omitted rather than guessed at.',
    ],
    'source': 'NJ Division of Taxation SR1A, 2025 file plus 2026 year to date',
    'built': '2026-07-31',
    'districts': out,
}, open(dst, 'w'), indent=1)

print('municipalities with a measured ratio: %d' % len(out))
print('omitted for thin data:                %d' % thin)
print('file size:                            %d KB' % (os.path.getsize(dst)//1024))
