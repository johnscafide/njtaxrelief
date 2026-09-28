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

// The frost follows the bar's state. Home's header sits clear over the hero,
// turns solid (fixed) once the hero is behind you, and must be clear again
// back at the top: a bar is only frosted while it is stuck at the top and has
// a background of its own or content under it, and clearing removes the layer.
assert.match(js, /if\(stuck\(cs\)&&\(own\|\|scrollY>8\)\)frost\(el,own\|\|DEFAULT_RGB\);else clear\(el\);/, 'frost only while stuck with a background or content under it');
assert.match(js, /function clear\(el\)\{\s*el\.removeAttribute\('data-wd-glass'\);[\s\S]*?if\(layer\)layer\.remove\(\);/, 'clearing removes the glass attribute and layer');
assert.match(js, /classWatch\.observe\(el,\{attributes:true,attributeFilter:\['class'\]\}\)/, 'a bar changing state (for example Home\'s .solid) is re-checked right away');
assert.match(js, /addEventListener\('scroll',onScroll,\{passive:true\}\)/, 'scrolling keeps each bar\'s frost in step');
assert.doesNotMatch(js, /removeEventListener\('scroll'/, 'the scroll check must not stop after the first bar is found');
assert.match(js, /el\.style\.transition='none';[\s\S]*?el\.style\.transition=transition;/, 'state switches never animate a fade between frosted and clear');

// The blur sits on the child layer, never on the bar itself, so fixed menus
// inside a bar keep positioning against the viewport.
assert.match(css, /\[data-wd-glass\]\{[^}]*backdrop-filter:none!important/);
assert.match(css, /\[data-wd-glass\]>\.wd-glass-layer\{[^}]*backdrop-filter:blur\(/);
assert.match(css, /prefers-reduced-transparency:reduce/, 'reduced transparency gets a near-solid bar');
assert.match(css, /@supports not/, 'browsers without backdrop-filter get a near-solid bar');
assert.match(css, /@media print/);

// Home's header sits over the hero. The hero's photo is scaled 3%, so the hero
// must clip sideways or the whole page scrolls horizontally; it stays visible
// vertically for the address suggestions.
const landing = read('property/css/landing-review.css');
assert.match(landing, /body\.wd-consumer-mode \.pl-hero\{[^}]*overflow:visible;overflow-x:clip\}/, 'Home hero must not widen the page');

assert.match(server, /safeBody = installGlassHeader\(safeBody\);/, 'page server adds the glass bar to every clean page');
for (const f of ['property/js/app-shell-2027.js', 'property/js/watchdog-universal-menu.js', 'property/js/public-nav.js']) {
  assert.match(read(f), /s\.src='\/property\/js\/watchdog-glass-header\.js'/, `${f} self-loads the glass bar`);
}
assert.match(read('property/agent/index.html'), /watchdog-glass-header\.js/, 'agent share page (served directly) loads the glass bar');

console.log('Glass header contract passed.');
