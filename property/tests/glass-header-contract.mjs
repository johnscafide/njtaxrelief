import assert from 'node:assert/strict';
import fs from 'node:fs';

// Universal frosted-glass top bar: one runtime + stylesheet, loaded on every
// clean Watchdog page by the page server and self-loaded by the shared shells.
const read = (p) => fs.readFileSync(p, 'utf8');
const js = read('property/js/watchdog-glass-header.js');
const css = read('property/css/watchdog-glass-header.css');
const server = read('api/watchdog-index-page-contact-safe.js');

assert.match(js, /if\(window\.__wdGlassHeader\)return;window\.__wdGlassHeader=true;/, 'runtime is idempotent');
assert.match(js, /cs\.position!=='sticky'&&cs\.position!=='fixed'/, 'only sticky or fixed top bars are glassed');
assert.match(js, /closest\('dialog,\[role="dialog"\],\[aria-modal="true"\]/, 'dialogs and sheets are never glassed');
assert.match(js, /className='wd-glass-layer'/, 'the frost lives on its own layer');

// The blur sits on the child layer, never on the bar itself, so fixed menus
// inside a bar keep positioning against the viewport.
assert.match(css, /\[data-wd-glass\]\{[^}]*backdrop-filter:none!important/);
assert.match(css, /\[data-wd-glass\]>\.wd-glass-layer\{[^}]*backdrop-filter:blur\(/);
assert.match(css, /prefers-reduced-transparency:reduce/, 'reduced transparency gets a near-solid bar');
assert.match(css, /@supports not/, 'browsers without backdrop-filter get a near-solid bar');
assert.match(css, /@media print/);

assert.match(server, /safeBody = installGlassHeader\(safeBody\);/, 'page server adds the glass bar to every clean page');
for (const f of ['property/js/app-shell-2027.js', 'property/js/watchdog-universal-menu.js', 'property/js/public-nav.js']) {
  assert.match(read(f), /s\.src='\/property\/js\/watchdog-glass-header\.js'/, `${f} self-loads the glass bar`);
}
assert.match(read('property/agent/index.html'), /watchdog-glass-header\.js/, 'agent share page (served directly) loads the glass bar');

console.log('Glass header contract passed.');
