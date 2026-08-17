from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'property' / 'index.html'
html = path.read_text(encoding='utf-8')
old = '<b id="ins-days">227</b><span>Days to general appeal deadline</span>'
new = '<b id="ins-days">Apr 1</b><span>General appeal deadline</span>'
if old not in html:
    if new in html:
        print('Durable appeal fallback already present')
        raise SystemExit(0)
    raise RuntimeError('Expected NJW-202 appeal fallback not found')
path.write_text(html.replace(old, new, 1), encoding='utf-8')
print('Durable appeal fallback applied')
