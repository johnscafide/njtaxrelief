#!/usr/bin/env python3
"""Render Watchdog Marketing Studio creative JSON into deterministic SVG previews.

No third-party packages are required. The script intentionally renders SVG because it is
resolution-independent, browser-viewable, printable, and easy to convert to PNG/PDF later.

Usage:
  python property/scripts/render_marketing_creatives.py --input creative.json --output-dir ./rendered

Input may be a single creative object or {"creatives": [...]}.
"""
from __future__ import annotations
import argparse
import html
import json
import re
from pathlib import Path

POSTCARD_W, POSTCARD_H = 900, 580
LETTER_W, LETTER_H = 816, 1056

def esc(value: object) -> str:
    return html.escape(str(value or ''), quote=True)

def slug(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-') or 'creative'

def wrap(text: str, width: int) -> list[str]:
    words = str(text or '').split()
    lines, current = [], []
    count = 0
    for word in words:
        add = len(word) + (1 if current else 0)
        if current and count + add > width:
            lines.append(' '.join(current)); current = [word]; count = len(word)
        else:
            current.append(word); count += add
    if current: lines.append(' '.join(current))
    return lines

def text_lines(lines: list[str], x: int, y: int, size: int, weight: int = 600, gap: int | None = None, fill: str = '#1f2937') -> str:
    gap = gap or int(size * 1.35)
    return ''.join(f'<text x="{x}" y="{y+i*gap}" font-size="{size}" font-weight="{weight}" fill="{fill}" font-family="Arial, Helvetica, sans-serif">{esc(line)}</text>' for i, line in enumerate(lines))

def brand_of(item: dict) -> dict:
    b = item.get('brand') or {}
    return {
        'name': b.get('display_name') or b.get('name') or 'Your Name',
        'company': b.get('company') or b.get('brokerage') or 'Your Company',
        'phone': b.get('phone') or '', 'email': b.get('email') or '',
        'disclosure': b.get('disclosure') or ''
    }

def content_of(item: dict) -> dict:
    c = item.get('content') or item
    return {
        'headline': c.get('headline') or 'Your campaign headline',
        'body': c.get('body') or 'Your campaign message appears here.',
        'cta': c.get('cta') or 'Learn more',
        'disclaimer': c.get('disclaimer') or '',
    }

def postcard_front(item: dict) -> str:
    c, b = content_of(item), brand_of(item)
    headline = wrap(c['headline'], 27)[:3]
    body = wrap(c['body'], 62)[:5]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{POSTCARD_W}" height="{POSTCARD_H}" viewBox="0 0 {POSTCARD_W} {POSTCARD_H}">
<rect width="100%" height="100%" rx="26" fill="#ffffff"/><rect width="100%" height="18" fill="#111827"/>
<text x="58" y="72" font-size="17" font-weight="700" letter-spacing="3" fill="#6b7280" font-family="Arial">WATCHDOG MARKETING</text>
{text_lines(headline,58,145,48,800,58,'#111827')}
{text_lines(body,58,335,22,500,31,'#4b5563')}
<rect x="58" y="470" width="250" height="58" rx="16" fill="#111827"/><text x="183" y="507" text-anchor="middle" font-size="21" font-weight="700" fill="#fff" font-family="Arial">{esc(c['cta'])}</text>
<text x="840" y="510" text-anchor="end" font-size="17" font-weight="700" fill="#374151" font-family="Arial">{esc(b['company'])}</text></svg>'''

def postcard_back(item: dict) -> str:
    c, b = content_of(item), brand_of(item)
    disclosure = ' '.join(x for x in [c['disclaimer'], b['disclosure']] if x)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{POSTCARD_W}" height="{POSTCARD_H}" viewBox="0 0 {POSTCARD_W} {POSTCARD_H}">
<rect width="100%" height="100%" rx="26" fill="#fff"/><line x1="470" y1="60" x2="470" y2="475" stroke="#d1d5db" stroke-width="2"/>
<text x="60" y="92" font-size="27" font-weight="800" fill="#111827" font-family="Arial">{esc(b['name'])}</text><text x="60" y="126" font-size="19" fill="#4b5563" font-family="Arial">{esc(b['company'])}</text>
<text x="60" y="176" font-size="18" fill="#374151" font-family="Arial">{esc(b['phone'])}</text><text x="60" y="205" font-size="18" fill="#374151" font-family="Arial">{esc(b['email'])}</text>
<rect x="60" y="275" width="150" height="150" rx="14" fill="#f3f4f6"/><text x="135" y="358" text-anchor="middle" font-size="25" font-weight="800" fill="#9ca3af" font-family="Arial">QR</text>
<text x="530" y="205" font-size="23" font-weight="700" fill="#111827" font-family="Arial">CURRENT RESIDENT</text><text x="530" y="245" font-size="21" fill="#374151" font-family="Arial">PROPERTY ADDRESS</text><text x="530" y="280" font-size="21" fill="#374151" font-family="Arial">CITY, NJ 00000</text>
{text_lines(wrap(disclosure,100)[:3],60,520,13,400,18,'#6b7280')}</svg>'''

def letter(item: dict) -> str:
    c, b = content_of(item), brand_of(item)
    contact = ' · '.join(x for x in [b['phone'], b['email']] if x)
    disclosure = ' '.join(x for x in [c['disclaimer'], b['disclosure']] if x)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{LETTER_W}" height="{LETTER_H}" viewBox="0 0 {LETTER_W} {LETTER_H}">
<rect width="100%" height="100%" fill="#fff"/><text x="70" y="78" font-size="25" font-weight="800" fill="#111827" font-family="Arial">{esc(b['company'])}</text><text x="746" y="78" text-anchor="end" font-size="14" fill="#6b7280" font-family="Arial">{esc(b['name'])}</text><text x="746" y="102" text-anchor="end" font-size="13" fill="#6b7280" font-family="Arial">{esc(contact)}</text><line x1="70" y1="132" x2="746" y2="132" stroke="#111827" stroke-width="3"/>
<text x="70" y="215" font-size="31" font-weight="800" fill="#111827" font-family="Arial">{esc(c['headline'])}</text>
{text_lines(wrap(c['body'],78)[:14],70,285,18,400,30,'#374151')}
<text x="70" y="785" font-size="19" font-weight="800" fill="#111827" font-family="Arial">{esc(c['cta'])}</text>
{text_lines(wrap(disclosure,105)[:5],70,930,11,400,17,'#6b7280')}</svg>'''

def render(item: dict, out_dir: Path) -> list[Path]:
    creative_type = item.get('creative_type') or item.get('type') or 'postcard'
    name = slug(item.get('template_key') or item.get('title') or item.get('name') or creative_type)
    outputs = []
    if creative_type == 'letter':
        path = out_dir / f'{name}-letter.svg'; path.write_text(letter(item), encoding='utf-8'); outputs.append(path)
    else:
        front = out_dir / f'{name}-front.svg'; back = out_dir / f'{name}-back.svg'
        front.write_text(postcard_front(item), encoding='utf-8'); back.write_text(postcard_back(item), encoding='utf-8'); outputs += [front, back]
    return outputs

def main() -> None:
    parser = argparse.ArgumentParser(description='Render Watchdog Marketing Studio creative previews.')
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding='utf-8'))
    creatives = payload.get('creatives') if isinstance(payload, dict) and isinstance(payload.get('creatives'), list) else [payload]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for item in creatives: files.extend(render(item, args.output_dir))
    manifest = {'renderer':'watchdog-marketing-svg-v1','files':[p.name for p in files]}
    (args.output_dir/'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest))

if __name__ == '__main__': main()
