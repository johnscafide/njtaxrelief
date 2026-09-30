import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Watchdog site search: one Ctrl/Cmd+K search for pages, plain-English terms,
// NJ addresses and public guides. The matching engine is pure and exported for
// Node, so this contract runs the real ranking against the real dictionary.
const read = (p) => fs.readFileSync(p, 'utf8');
const require = createRequire(import.meta.url);
const Engine = require('../js/watchdog-site-search.js');
const js = read('property/js/watchdog-site-search.js');
const dict = JSON.parse(read('property/data/site-search.json'));
const glossary = JSON.parse(read('property/data/glossary.json'));

// ---------- dictionary shape ----------
assert.equal(dict.schema_version, 1, 'dictionary schema_version');
assert.ok(Array.isArray(dict.entries) && dict.entries.length >= 40, 'dictionary has entries');
const ids = new Set();
for (const e of dict.entries) {
  const where = `entry ${e.id || e.label}`;
  assert.match(String(e.id || ''), /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${where}: kebab-case id`);
  assert.ok(!ids.has(e.id), `${where}: duplicate id`);
  ids.add(e.id);
  assert.ok(e.kind === 'term' || e.kind === 'page', `${where}: kind is term or page`);
  assert.ok(e.label && typeof e.label === 'string', `${where}: label`);
  assert.ok(Array.isArray(e.aliases), `${where}: aliases array`);
  for (const a of e.aliases) assert.equal(a, a.toLowerCase(), `${where}: aliases are lowercase`);
  assert.match(String(e.href || ''), /^\/(?!\/)/, `${where}: href is a root-relative Watchdog path`);
  assert.ok(!/^\/property(?:\/|$)/.test(e.href), `${where}: public hrefs never expose /property/`);
  assert.ok(!e.need || ['agent', 'pro', 'pro_plus'].includes(e.need), `${where}: need is agent, pro or pro_plus`);
  assert.match(String(e.icon || ''), /^fa-[a-z0-9-]+$/, `${where}: Font Awesome icon name`);
  assert.ok(!e.summary || e.summary.length <= 160, `${where}: summary stays short`);
}
assert.ok(!/[–—]/.test(read('property/data/site-search.json')), 'no em or en dashes in customer copy');
assert.ok(!/ROBUST Score/i.test(read('property/data/site-search.json')), 'never "ROBUST Score"');
assert.ok(!/Watchdog Intel\b/.test(read('property/data/site-search.json')), 'product name is "Watchdog Intelligence"');

// ---------- ranking ----------
const glossaryEntries = glossary.terms.map((g) => ({ id: `glossary-${g.slug}`, kind: 'term', label: g.term, aliases: [], keywords: [], href: `/glossary/${g.slug}/` }));
const prepared = Engine.prepare(dict.entries.concat(glossaryEntries));
const top = (q, n = 3) => Engine.rank(prepared, q).slice(0, n).map((r) => r.entry);
const find = (pred, msg) => { const e = dict.entries.find(pred); assert.ok(e, msg); return e; };
const co = find((e) => e.aliases.includes('certificate of occupancy'), 'a Certificate of Occupancy entry exists');
const cco = find((e) => e.aliases.includes('certificate of continued occupancy'), 'a CCO entry exists');
const alarm = find((e) => e.aliases.includes('carbon monoxide') || e.aliases.includes('co alarm'), 'a smoke / CO alarm certificate entry exists');

assert.equal(co.kind, 'term');
assert.match(co.label, /^CO - Certificate of Occupancy/, 'CO label reads "CO - Certificate of Occupancy"');
assert.match(co.href, /^\/transaction\?evidence=occupancy/, 'CO opens the Transactions occupancy evidence');
assert.ok(co.where && /Transactions/.test(co.where), 'CO says it lives in Transactions');
assert.equal(top('certif', 1)[0], co, '"certif" suggests CO - Certificate of Occupancy first');
assert.equal(top('Certif', 1)[0], co, 'matching ignores case');
assert.equal(top('certificate of occupancy', 1)[0], co, 'full name finds CO');
assert.equal(top('c.o.', 1)[0], co, '"c.o." finds CO');
assert.ok(top('co', 4).includes(co) && top('co', 4).includes(alarm), '"co" finds both the certificate of occupancy and the CO alarm certificate');
assert.equal(top('cco', 1)[0], cco, '"cco" finds the Certificate of Continued Occupancy');
assert.ok(top('certifcate of ocupancy').includes(co), 'one typo per word still finds CO');
assert.ok(top('where is the co').includes(co), 'filler words are ignored');
assert.ok(top('occupancy', 4).includes(co), 'a later word in the name matches');
assert.equal(Engine.rank(prepared, '').length, 0, 'empty query returns nothing');
assert.equal(Engine.rank(prepared, 'zzqxj').length, 0, 'nonsense returns nothing');

// ---------- query split (term + address) ----------
assert.deepEqual(Engine.splitQuery('co 12 main st'), { text: 'co', address: '12 main st' });
assert.deepEqual(Engine.splitQuery('12 Main St'), { text: '', address: '12 Main St' });
assert.deepEqual(Engine.splitQuery('chapter 123'), { text: 'chapter 123', address: '' }, 'a number with nothing after it is not an address');
assert.deepEqual(Engine.splitQuery('pas-1 form'), { text: 'pas-1 form', address: '' }, 'PAS-1 is not an address');
assert.equal(Engine.editDistance('occupancy', 'ocupancy', 2), 1);

// ---------- runtime guards ----------
assert.match(js, /if\(!root \|\| !root\.document \|\| root\.__wdSiteSearch\) return;\s*root\.__wdSiteSearch = true;/, 'runtime is idempotent');
assert.match(js, /k === 'k' && \(e\.metaKey \|\| e\.ctrlKey\)/, 'Ctrl/Cmd+K opens search');
assert.match(js, /role="combobox"[^>]*aria-controls="wdss-list"/, 'input is an ARIA combobox');
assert.match(js, /aria-activedescendant/, 'active option is announced');
assert.match(js, /role="dialog" aria-modal="true"/, 'search is a modal dialog');
assert.match(js, /function trapTab\(e\)/, 'focus stays inside the dialog');
assert.match(js, /esc\(safeHref\(item\.href\)\)/, 'result links are escaped and limited to Watchdog');
assert.match(js, /function safeHref\(href\)[\s\S]*?: '#';/, 'non-Watchdog links are dropped');
assert.match(js, /replace\(\/<\(\?!\\\/\?mark>\)\[\^>\]\*>\/g,''\)/, 'guide excerpts keep only <mark>');
assert.match(js, /parcel\.until = Date\.now\(\) \+ 60000/, 'address search backs off when the database is slow');
assert.match(js, /PARCEL_TIMEOUT = 3500/, 'address search has a timeout');
assert.match(js, /if\(!byPath\[k\]\) byPath\[k\] = e;/, 'first menu row wins, so the Agent Desk areas do not overwrite the desk itself');
assert.match(js, /transaction\\\/shared\|client-room\|public-report\|open-house/, 'client-facing shared pages are excluded');
assert.match(js, /prefers-reduced-motion:no-preference/, 'animation respects reduced motion');
assert.match(js, /@media print\{\.wdss,\.wdss-trigger\{display:none!important\}\}/, 'search chrome never prints');
assert.match(js, /min-height:52px/, 'result rows are comfortable touch targets');
assert.doesNotMatch(js, /font:[^;]*(?<![\d.])(?:[0-9]|1[01])(?:\.\d+)?px/, 'no text under 12px');

// ---------- wiring ----------
const server = read('api/watchdog-index-page-contact-safe.js');
assert.match(server, /safeBody = installSiteSearch\(safeBody, publicPath\);/, 'page server adds site search to every clean page');
assert.match(server, /SITE_SEARCH_OFF_PATH = \/\^\\\/\(\?:transaction\\\/shared\|client-room/, 'page server skips client-facing pages');
for (const f of ['property/js/app-shell-2027.js', 'property/js/watchdog-universal-menu.js', 'property/js/public-nav.js']) {
  assert.match(read(f), /s\.src='\/property\/js\/watchdog-site-search\.js\?v=/, `${f} self-loads site search`);
}
assert.match(read('property/js/watchdog-universal-menu.js'), /class="wd-universal-search" data-wd-search="open"/, 'the menu drawer opens site search');
assert.match(read('property/css/watchdog-universal-menu.css'), /\.wd-universal-search\{/, 'the drawer search row is styled with the drawer');
assert.match(read('property/partials/nav.html'), /class="wdn-site-search"\s+data-wd-search="open"/, 'the shared nav partial has a search button');
assert.match(read('search/index.html'), /ui\.triggerSearch\(q\)/, '/search?q= runs the search');

console.log(`Site search contract passed (${dict.entries.length} dictionary entries).`);
