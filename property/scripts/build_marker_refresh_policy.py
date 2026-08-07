#!/usr/bin/env python3
"""Build the developer marker-refresh contract from the live marker registry."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = json.loads((ROOT / 'property/data/marker-registry.json').read_text())

SOURCE = {
    'nj-parcels-modiv': ('annual', 'parcel-roll', 'official_release'),
    'nj-division-taxation': ('annual', 'tax-rates', 'official_release'),
    'nj-sr1a': ('quarterly', 'sr1a-ratios', 'official_release'),
    'nj-tax-court-appeals': ('annual', 'appeals', 'official_release'),
    'nj-cod': ('annual', 'cod-history', 'official_release'),
    'nj-dca-budget': ('annual', 'budget-pressure', 'official_release'),
    'nj-abstract-pilot': ('annual', 'exempt-pilot', 'official_release'),
    'nj-tax-abstract': ('annual', 'abatements', 'official_release'),
    'njdep-dca-live': ('live', 'professional-live-feeds', 'live_query'),
    'njdep-geology-live': ('live', 'institutional-njdep-geology', 'live_query'),
    'njdep-hydro-live': ('live', 'institutional-njdep-hydrography', 'live_query'),
    'njdep-land-live': ('live', 'institutional-njdep-land', 'live_query'),
    'watchdog-models': ('dependency', 'watchdog-models', 'dependency_change'),
    'watchdog-professional': ('dependency', 'watchdog-models', 'dependency_change'),
    'watchdog-institutional': ('dependency', 'watchdog-institutional', 'dependency_change')
    ,'watchdog-professional-v030': ('dependency', 'watchdog-professional-v030', 'dependency_change')
    ,'watchdog-nj-source-v031': ('dependency', 'watchdog-nj-source-v031', 'dependency_change')
    ,'nj-dca-permits-raw': ('monthly', 'dca-construction-permits', 'official_release')
    ,'nj-dca-development-trends': ('annual', 'dca-development-trends', 'official_release')
    ,'nj-dca-new-home-warranty': ('quarterly', 'dca-new-home-warranty', 'official_release')
    ,'nj-dca-municipal-housing-profile': ('annual', 'dca-municipal-housing-profile', 'official_release')
    ,'nj-dca-affordable-housing': ('annual', 'dca-affordable-housing', 'official_release')
    ,'nj-dca-community-assets': ('review', 'dca-community-assets', 'source_change')
    ,'nj-dca-zoning-directory': ('review', 'dca-zoning-directory', 'source_change')
    ,'nj-dca-pilot-forecast': ('annual', 'dca-pilot-forecast', 'official_release')
    ,'nj-dca-modiv-longitudinal': ('annual', 'dca-modiv-longitudinal', 'official_release')
    ,'nj-dca-neighborhood-trends': ('annual', 'dca-neighborhood-trends', 'official_release')
    ,'njdep-csrr-gis': ('live', 'njdep-csrr-gis', 'live_query')
}

rows = []
for marker in REGISTRY['markers']:
    source = marker.get('source_id', '')
    cadence, dataset, trigger = SOURCE.get(source, ('review', source or 'unmapped', 'manual_review'))
    historical = re.search(r'(?:_|\.)20(?:1[0-9]|2[0-5])$', marker['id']) is not None
    if historical and marker['origin'] == 'public':
        cadence, trigger = 'correction', 'source_correction'
    rows.append({
        'marker_id': marker['id'], 'label': marker['label'], 'source_id': source,
        'dataset_id': dataset, 'cadence': cadence, 'trigger': trigger,
        'priority': 'critical' if marker['tier'] == 'standard' else ('high' if marker['tier'] == 'pro' else 'normal'),
        'tier': marker['tier'], 'origin': marker['origin'], 'scope': marker['scope'],
        'rule': 'Recalculate when any input dataset changes.' if marker['origin'] == 'watchdog-derived' else
                ('Historical value; update only when the publisher corrects or backfills the underlying edition.' if historical else
                ('Query the authoritative endpoint at report time; monitor endpoint health/schema.' if cadence == 'live' else
                 'Refresh when the authoritative publisher releases a new edition; never infer a release date.'))
    })

doc = {
    'schema_version': 1,
    'definition': 'Developer-only operations contract. Cadence is a minimum review expectation; authoritative source publication always wins.',
    'markers': rows,
    'summary': {
        'total': len(rows),
        'annual': sum(r['cadence'] == 'annual' for r in rows),
        'quarterly': sum(r['cadence'] == 'quarterly' for r in rows),
        'live': sum(r['cadence'] == 'live' for r in rows),
        'dependency': sum(r['cadence'] == 'dependency' for r in rows),
        'correction': sum(r['cadence'] == 'correction' for r in rows),
        'review': sum(r['cadence'] == 'review' for r in rows)
    }
}
(ROOT / 'property/data/marker-refresh-policy.json').write_text(json.dumps(doc, indent=2) + '\n')
print(json.dumps(doc['summary']))
