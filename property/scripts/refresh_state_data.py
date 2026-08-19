#!/usr/bin/env python3
"""Refresh downloadable NJ datasets, validate materialized coverage, and verify live-source health."""
import argparse
import datetime as dt
import glob
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTRY = ROOT / 'property/data/source-registry.json'
REPORT = ROOT / 'property/data/data-freshness.json'
UA = 'NJPTR-data-refresh/3.0'


def digest(path):
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def nested(data, key):
    value = data
    for part in key.split('.'):
        value = value.get(part, {}) if isinstance(value, dict) else {}
    return value


def validation_kind(item):
    if item.get('live'):
        return 'live_health'
    if item.get('glob') or item.get('output'):
        return 'materialized_coverage'
    return 'configured_reference'


def expected_minimum(item):
    kind = validation_kind(item)
    if kind == 'live_health':
        return 1
    if item.get('glob'):
        return item.get('minimum_files', 1)
    if item.get('output'):
        return item.get('minimum_records', 1)
    return None


def live_health_url(item):
    url = item.get('healthcheck_url') or item.get('source_url')
    if url and '/arcgis/rest/services/' in url.lower() and 'f=json' not in url.lower():
        url += ('&' if '?' in url else '?') + 'f=json'
    return url


def probe_live(item):
    url = live_health_url(item)
    checked_at = dt.datetime.now(dt.timezone.utc).isoformat()
    started = time.monotonic()
    if not url:
        return False, {'checked_at': checked_at, 'error': 'No health-check URL configured'}
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': UA, 'Accept': 'application/json,text/html;q=0.8,*/*;q=0.5'},
        )
        with urllib.request.urlopen(req, timeout=25) as response:
            body = response.read(262144)
            status = int(getattr(response, 'status', 200))
            ctype = response.headers.get('content-type', '')
        ok = 200 <= status < 400
        semantic_error = None
        if '/arcgis/rest/services/' in url.lower():
            try:
                payload = json.loads(body.decode('utf-8', errors='replace'))
                if isinstance(payload, dict) and payload.get('error'):
                    ok = False
                    semantic_error = payload['error']
            except Exception:
                ok = False
                semantic_error = 'ArcGIS health endpoint did not return valid JSON'
        return ok, {
            'checked_at': checked_at,
            'healthcheck_url': url,
            'http_status': status,
            'content_type': ctype,
            'latency_ms': int((time.monotonic() - started) * 1000),
            'semantic_error': semantic_error,
        }
    except Exception as error:
        return False, {
            'checked_at': checked_at,
            'healthcheck_url': url,
            'latency_ms': int((time.monotonic() - started) * 1000),
            'error': f'{type(error).__name__}: {error}',
        }


def validate(item, probe=True):
    kind = validation_kind(item)
    if kind == 'live_health':
        ok, health = probe_live(item) if probe else (False, {'error': 'Live probe disabled'})
        return ok, 1 if ok else 0, [], health
    if item.get('glob'):
        files = [pathlib.Path(x) for x in glob.glob(str(ROOT / item['glob']))]
        return len(files) >= item.get('minimum_files', 1), len(files), files, {}
    if item.get('output'):
        path = ROOT / item['output']
        if not path.exists():
            return False, 0, [], {}
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            return False, 0, [path], {}
        value = nested(data, item.get('collection', ''))
        count = len(value) if isinstance(value, (dict, list)) else 0
        return count >= item.get('minimum_records', 1), count, [path], {}
    # Reference/catalog entries are useful lineage metadata, but there is no
    # local coverage artifact to validate and no live endpoint claim to make.
    return True, None, [], {}


def run_parser(item, download):
    command = [str(download) if p == '{download}' else p for p in item['parser']]
    subprocess.run(command, cwd=ROOT, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--write-version', action='store_true')
    ap.add_argument('--no-live-probe', action='store_true')
    args = ap.parse_args()

    registry = json.loads(REGISTRY.read_text())
    before = {}
    after = {}
    results = []
    failures = []

    for item in registry['datasets']:
        kind = validation_kind(item)
        ok, count, files, health = validate(item, not args.no_live_probe)
        before[item['id']] = {str(p): digest(p) for p in files if p.exists()}
        action = {
            'live_health': 'health_checked',
            'materialized_coverage': 'validated',
            'configured_reference': 'configured',
        }[kind]

        if args.refresh and item.get('source_url') and item.get('parser'):
            try:
                with tempfile.TemporaryDirectory(prefix='njptr-refresh-') as tmp:
                    target = pathlib.Path(tmp) / 'source.download'
                    request = urllib.request.Request(item['source_url'], headers={'User-Agent': UA})
                    with urllib.request.urlopen(request, timeout=90) as response:
                        target.write_bytes(response.read())
                    run_parser(item, target)
                    action = 'refreshed'
            except Exception as error:
                failures.append({'dataset': item['id'], 'stage': 'refresh', 'error': str(error)})
                action = 'refresh_failed'

        ok, count, files, health = validate(item, not args.no_live_probe)
        after[item['id']] = {str(p): digest(p) for p in files if p.exists()}
        if not ok:
            failures.append({
                'dataset': item['id'],
                'stage': 'source_health' if kind == 'live_health' else 'coverage',
                'error': health.get('error') or health.get('semantic_error') or 'validation failed',
            })

        latest = max((p.stat().st_mtime for p in files if p.exists()), default=0)
        row = {
            'id': item['id'],
            'label': item['label'],
            'agency': item['agency'],
            'status': ('configured' if kind == 'configured_reference' else ('passed' if ok else 'failed')),
            'validation_kind': kind,
            'action': action,
            'records_or_files': count,
            'minimum': expected_minimum(item),
            'changed': before[item['id']] != after[item['id']],
            'last_modified': dt.datetime.fromtimestamp(latest, dt.timezone.utc).isoformat() if latest else None,
            'cadence': item['cadence'],
            'source_url': item.get('source_url'),
            'live': bool(item.get('live')),
        }
        if item.get('note'):
            row['note'] = item['note']
        if item.get('warning'):
            row['warning'] = item['warning']
        if health:
            row['health'] = health
        results.append(row)

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    REPORT.write_text(
        json.dumps(
            {
                'schema_version': 3,
                'generated_at': now,
                'overall_status': 'failed' if failures else 'passed',
                'definitions': {
                    'live_health': 'Endpoint/service health was probed. This does not mean every property has a matching record.',
                    'materialized_coverage': 'A governed local artifact was validated against its configured record/file minimum.',
                    'configured_reference': 'A lineage/catalog reference is configured but is not represented as a live health check or local coverage test.',
                },
                'datasets': results,
                'failures': failures,
            },
            indent=2,
        ) + '\n'
    )

    if args.write_version and any(x['changed'] for x in results):
        path = ROOT / 'property/data/versions.json'
        versions = json.loads(path.read_text())
        versions['updated_at'] = now
        versions['releases'].insert(
            0,
            {
                'version': 'data-' + now[:10],
                'date': now[:10],
                'timestamp': now,
                'title': 'Automated state-data refresh',
                'category': 'Data',
                'status': 'Completed',
                'summary': 'State-data sources refreshed; configured local coverage and live-source health evidence was regenerated.',
                'links': ['/property/updates'],
                'files': [x['id'] for x in results if x['changed']],
                'impact': {
                    'html': 0,
                    'css': 0,
                    'javascript': 0,
                    'data': sum(1 for x in results if x['changed']),
                    'navigation': 0,
                },
            },
        )
        path.write_text(json.dumps(versions, indent=2) + '\n')

    print(
        json.dumps(
            {
                'status': 'failed' if failures else 'passed',
                'datasets': len(results),
                'failures': len(failures),
                'live_sources_checked': sum(1 for x in results if x['validation_kind'] == 'live_health'),
                'materialized_sources_checked': sum(1 for x in results if x['validation_kind'] == 'materialized_coverage'),
                'configured_references': sum(1 for x in results if x['validation_kind'] == 'configured_reference'),
                'report': str(REPORT.relative_to(ROOT)),
            }
        )
    )
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
