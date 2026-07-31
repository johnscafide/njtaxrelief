#!/usr/bin/env python3
"""
SR1A -> JSON for njpropertytaxrelief.com

The SR1A file is the NJ Division of Taxation's own record of every recorded
deed, and crucially it carries the assessor's judgment on whether each sale was
a genuine arm's length transaction. That single flag is what we have been
trying, and failing, to reconstruct from the parcel layer's raw SALE_PRICE.

Two fields make this file worth the trouble:

    U-N-TYPE      byte 34      'U' = usable. The state's own verification that
                               this was an arm's length sale. Everything else
                               is a family transfer, an estate, a foreclosure,
                               a sheriff's sale, or a correction deed.
    LIVING-SPACE  bytes 657-663 Square footage. The statewide parcel layer does
                               not publish it. With this we can finally do
                               price per square foot.

PRIVACY, NOT OPTIONAL:
    The raw file contains GRANTOR-NAME, GRANTEE-NAME and both parties' street
    addresses. Those are people's names tied to home addresses, which is the
    exact pattern Daniel's Law exists to stop and the exact pattern that got
    Zillow, CoreLogic and ATTOM sued. This parser never reads those byte ranges
    into the output. Not redacted, not hashed. Never extracted.

Usage:
    python3 parse_sr1a.py Sales2025.zip [YTDSR1A2026.zip ...] --out ./out
"""

import argparse, io, json, os, re, sys, zipfile
from collections import defaultdict, Counter

RECORD_LEN = 663

# (start, end) are 1-indexed inclusive, exactly as the state's layout prints them.
F = {
    'county':        (1, 2),
    'district':      (3, 4),
    'un_type':       (34, 34),     # 'U' usable, 'N' non-usable
    'nu_code':       (35, 37),     # why it was rejected
    'price_reported':(38, 46),
    'price_verified':(47, 55),
    'av_land':       (56, 64),
    'av_bldg':       (65, 73),
    'av_total':      (74, 82),
    'sales_ratio':   (83, 87),     # S999V99
    'rtf':           (88, 96),     # 9(7)V99
    'rtf_exempt':    (98, 98),
    'location':      (298, 322),
    'deed_book':     (329, 333),
    'deed_page':     (334, 338),
    'deed_date':     (339, 344),   # YYMMDD
    'recorded':      (345, 350),
    'block':         (351, 355),
    'block_suffix':  (356, 359),
    'lot':           (360, 364),
    'lot_suffix':    (365, 368),
    'qualifier':     (388, 392),
    'assess_year':   (625, 626),
    'prop_class':    (627, 629),
    'class4_type':   (630, 632),
    'year_built':    (653, 656),
    'living_space':  (657, 663),
}

# Deliberately absent from F, and this list is the reason why.
FORBIDDEN = {
    'GRANTOR-NAME': (110, 144), 'GRANTOR-STREET': (145, 169),
    'GRANTOR-CITY-STATE': (170, 194), 'GRANTOR-ZIP': (195, 203),
    'GRANTEE-NAME': (204, 238), 'GRANTEE-STREET': (239, 263),
    'GRANTEE-CITY-STATE': (264, 288), 'GRANTEE-ZIP': (289, 297),
}

# All 21 NJ counties. The state numbers them alphabetically, which is why
# Atlantic is 01 and Warren is 21.
COUNTIES = {
    '01': 'ATLANTIC',  '02': 'BERGEN',    '03': 'BURLINGTON', '04': 'CAMDEN',
    '05': 'CAPE MAY',  '06': 'CUMBERLAND','07': 'ESSEX',      '08': 'GLOUCESTER',
    '09': 'HUDSON',    '10': 'HUNTERDON', '11': 'MERCER',     '12': 'MIDDLESEX',
    '13': 'MONMOUTH',  '14': 'MORRIS',    '15': 'OCEAN',      '16': 'PASSAIC',
    '17': 'SALEM',     '18': 'SOMERSET',  '19': 'SUSSEX',     '20': 'UNION',
    '21': 'WARREN',
}
SOUTH_JERSEY = {k: COUNTIES[k] for k in
                ('01', '03', '04', '05', '06', '08', '17')}

# Common non-usable reasons, so we can report WHY sales were dropped rather
# than silently discarding a third of the file.
NU_MEANING = {
    '1': 'family or related party', '2': 'love and affection',
    '3': 'sheriff or foreclosure', '4': 'estate or trust',
    '5': 'government or charity', '6': 'partial interest',
    '7': 'trade or exchange', '8': 'doubtful title',
    '10': 'sale of convenience', '12': 'assemblage',
    '26': 'other, see assessor',
}


def fld(line, key):
    a, b = F[key]
    return line[a - 1:b].strip()


def num(s, default=None):
    s = re.sub(r'[^0-9\-]', '', s or '')
    if s in ('', '-'):
        return default
    try:
        return int(s)
    except ValueError:
        return default


def deed_year_month(s):
    """SR1A dates are YYMMDD, same convention as MOD-IV's DEED_DATE."""
    s = re.sub(r'\D', '', s or '')
    if len(s) != 6:
        return None, None
    yy, mm = int(s[0:2]), int(s[2:4])
    if not (1 <= mm <= 12):
        return None, None
    yr = 1900 + yy if yy > 40 else 2000 + yy
    if not (1950 <= yr <= 2100):
        return None, None
    return yr, mm


def read_records(path):
    """Yield fixed width lines from a zip or a plain file."""
    def split_stream(raw):
        text = raw.decode('latin-1', errors='replace')
        if '\n' in text:                       # newline delimited
            for ln in text.splitlines():
                if len(ln) >= 400:
                    yield ln.ljust(RECORD_LEN)
        else:                                   # one long blob
            for i in range(0, len(text) - RECORD_LEN + 1, RECORD_LEN):
                yield text[i:i + RECORD_LEN]

    if path.lower().endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if name.endswith('/'):
                    continue
                with z.open(name) as fh:
                    for ln in split_stream(fh.read()):
                        yield ln
    else:
        with open(path, 'rb') as fh:
            for ln in split_stream(fh.read()):
                yield ln


def parse(paths, counties, min_price, keep_nonusable):
    out = defaultdict(list)
    stats = Counter()
    nu_reasons = Counter()

    for path in paths:
        for line in read_records(path):
            stats['read'] += 1
            cc = fld(line, 'county')
            if cc not in counties:
                stats['other_county'] += 1
                continue

            usable = fld(line, 'un_type').upper() == 'U'
            if not usable:
                stats['non_usable'] += 1
                code = fld(line, 'nu_code').lstrip('0') or '?'
                nu_reasons[NU_MEANING.get(code, 'code ' + code)] += 1
                if not keep_nonusable:
                    continue

            price = num(fld(line, 'price_verified')) or num(fld(line, 'price_reported'))
            if not price or price < min_price:
                stats['price_too_low'] += 1
                continue

            yr, mo = deed_year_month(fld(line, 'deed_date'))
            if yr is None:
                yr, mo = deed_year_month(fld(line, 'recorded'))
            if yr is None:
                stats['no_date'] += 1
                continue

            av_total = num(fld(line, 'av_total'), 0) or 0
            sqft = num(fld(line, 'living_space'), 0) or 0
            built = num(fld(line, 'year_built'), 0) or 0
            cls = fld(line, 'prop_class')

            rec = {
                'd': cc + fld(line, 'district'),          # 4 digit district code
                'a': fld(line, 'location'),
                'b': (fld(line, 'block') + fld(line, 'block_suffix')).strip(),
                'l': (fld(line, 'lot') + fld(line, 'lot_suffix')).strip(),
                'q': fld(line, 'qualifier') or None,
                'c': cls,
                'p': price,
                'y': yr, 'm': mo,
                'av': av_total or None,
                'sf': sqft or None,
                'yb': built if 1700 < built <= 2100 else None,
            }
            if not usable:
                rec['nu'] = fld(line, 'nu_code')

            # Two derived figures worth precomputing, because every tool wants them.
            if av_total:
                rec['r'] = round(av_total / price, 4)      # assessment to sale ratio
            if sqft and sqft > 100:
                rec['ppsf'] = round(price / sqft)

            out[cc].append(rec)
            stats['kept'] += 1

    return out, stats, nu_reasons


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+', help='Sales20XX.zip or extracted file')
    ap.add_argument('--out', default='./out')
    ap.add_argument('--counties', default=','.join(sorted(SOUTH_JERSEY)),
                    help='2 digit county codes, comma separated')
    ap.add_argument('--all', action='store_true', help='all 21 counties')
    ap.add_argument('--min-price', type=int, default=1000)
    ap.add_argument('--keep-nonusable', action='store_true',
                    help='also keep non arm\'s length sales, flagged with nu')
    a = ap.parse_args()

    counties = set(COUNTIES) if a.all else set(c.strip() for c in a.counties.split(',') if c.strip())
    os.makedirs(a.out, exist_ok=True)

    data, stats, nu = parse(a.files, counties, a.min_price, a.keep_nonusable)

    total = 0
    for cc, recs in sorted(data.items()):
        recs.sort(key=lambda r: (-r['y'], -r['m']))
        name = COUNTIES.get(cc, cc)
        path = os.path.join(a.out, 'sales-%s.json' % name.lower().replace(' ', '-'))
        payload = {
            '_readme': [
                'Verified arm\'s length sales from the NJ Division of Taxation SR1A file.',
                'Only records the state itself flagged usable are included, so family',
                'transfers, estates, sheriff sales and correction deeds are already gone.',
                'No buyer or seller names or addresses are present. They exist in the',
                'source file and are deliberately never extracted.',
                'Keys: d district code, a address, b block, l lot, q qualifier,',
                'c property class, p sale price, y year, m month, av assessed total,',
                'sf living space sq ft, yb year built, r assessed/price, ppsf price per sq ft.',
            ],
            'county': name, 'county_code': cc, 'count': len(recs),
            'sales': recs,
        }
        with open(path, 'w') as fh:
            json.dump(payload, fh, separators=(',', ':'))
        total += len(recs)
        kb = os.path.getsize(path) // 1024
        print('  %-12s %6d sales  %6d KB  %s' % (name, len(recs), kb, os.path.basename(path)))

    print('\n  read %s records, kept %s' % (f"{stats['read']:,}", f"{total:,}"))
    print('  skipped: %s other county, %s non usable, %s price too low, %s no date'
          % (f"{stats['other_county']:,}", f"{stats['non_usable']:,}",
             f"{stats['price_too_low']:,}", f"{stats['no_date']:,}"))
    if nu:
        print('\n  why sales were rejected as non usable:')
        for reason, n in nu.most_common(8):
            print('    %-28s %s' % (reason, f"{n:,}"))

    # Loud check that no personal data slipped through.
    bad = []
    for cc, recs in data.items():
        for r in recs[:2000]:
            blob = json.dumps(r).upper()
            for token in ('GRANTOR', 'GRANTEE'):
                if token in blob:
                    bad.append(token)
    print('\n  privacy check: %s' % ('FAILED, names present' if bad else 'no owner names or party addresses in output'))


if __name__ == '__main__':
    main()
