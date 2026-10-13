"""Build the trimmed Font Awesome set the Watchdog home page uses.

Run from the repo root (needs Python with fonttools and brotli):
    python3 scripts/build-icon-subset.py

It downloads Font Awesome Free 6.5.0 from cdnjs, keeps every icon whose name
or code point appears anywhere in the repo source, and writes the CSS and
fonts to property/assets/icons/. scripts/check-icon-subset.mjs runs in the
Vercel build and switches the home page back to the full cdnjs set if code
starts using an icon that is missing here, so rerun this after adding icons.
"""
import io
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = '6.5.0'
CDN = f'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/{VERSION}'
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'property' / 'assets' / 'icons'
FONTS = {
    'solid': ('fa-solid-900.woff2', '"Font Awesome 6 Free"', 900),
    'regular': ('fa-regular-400.woff2', '"Font Awesome 6 Free"', 400),
    'brands': ('fa-brands-400.woff2', '"Font Awesome 6 Brands"', 400),
}
ICON_RULE = re.compile(r'((?:\.fa-[a-z0-9-]+:(?:before|after),?)+)\{content:"\\([0-9a-f]+)"\}')


def fetch(path):
    with urllib.request.urlopen(f'{CDN}/{path}') as response:
        return response.read()


def repo_text():
    files = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    for name in files:
        if not re.search(r'\.(js|mjs|html|css|json)$', name) or '/tests/' in name or name.startswith('property/assets/icons/'):
            continue
        path = ROOT / name
        try:
            if path.stat().st_size > 3_000_000:
                continue
            yield path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue


def main():
    css = fetch('css/all.min.css').decode('utf-8')
    icons = {}
    for match in ICON_RULE.finditer(css):
        for name in re.findall(r'\.fa-([a-z0-9-]+):', match.group(1)):
            icons[name] = match.group(2)

    tokens = set()
    codes = set()
    for text in repo_text():
        for token in re.findall(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', text):
            tokens.add(token[3:] if token.startswith('fa-') else token)
        codes.update(c.lower() for c in re.findall(r'\\([ef][0-9a-fA-F]{3})\b', text))

    keep = sorted(name for name in icons if name in tokens)
    keep_codes = {icons[name] for name in keep} | {c for c in codes if c in set(icons.values())}

    def keep_rule(match):
        names = [n for n in re.findall(r'\.fa-([a-z0-9-]+):', match.group(1)) if n in keep]
        if not names:
            return ''
        selectors = ','.join(f'.fa-{n}:before' for n in names)
        return f'{selectors}{{content:"\\{match.group(2)}"}}'

    body = re.sub(r'/\*![\s\S]*?\*/', '', css)
    body = re.sub(r'@font-face\{[^}]*\}', '', body)
    body = ICON_RULE.sub(keep_rule, body)
    faces = ''.join(
        f'@font-face{{font-family:{family};font-style:normal;font-weight:{weight};font-display:block;src:url({file}) format("woff2")}}'
        for file, family, weight in FONTS.values()
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'icons.css').write_text(faces + body.strip() + '\n', encoding='utf-8')

    unicodes = [int(code, 16) for code in sorted(keep_codes)]
    for file, _family, _weight in FONTS.values():
        font = TTFont(io.BytesIO(fetch(f'webfonts/{file}')))
        options = subset.Options()
        options.flavor = 'woff2'
        options.layout_features = ['*']
        options.hinting = False
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(font)
        subset.save_font(font, str(OUT / file), options)

    (OUT / 'icons.json').write_text(json.dumps({'version': VERSION, 'icons': keep, 'all': sorted(icons)}, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Kept {len(keep)} of {len(icons)} icons, {len(unicodes)} glyphs.')


if __name__ == '__main__':
    sys.exit(main())
