import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Agent Desk is one app: six sections on one page, and every agent tool opens inside it.
const read = p => fs.readFileSync(p, 'utf8');
const html = read('property/agent-desk/index.html');
const js = read('property/js/agent-hub.js');
const css = read('property/css/agent-hub.css');
new vm.Script(js, { filename: 'agent-hub.js' });

assert.ok(html.includes('/property/css/agent-hub.css') && html.includes('/property/js/agent-hub.js'), 'Agent Desk must load the hub stylesheet and runtime');
for (const section of ['home', 'clients', 'farm', 'marketing', 'research', 'deals']) {
  assert.ok(html.includes(`data-adh-view="${section}"`), `Agent Desk is missing the ${section} section`);
  assert.equal((html.match(new RegExp(`data-adh-nav="${section}"`, 'g')) || []).length >= 2, true, `The ${section} section needs a desktop rail link and a phone tab`);
}
assert.ok(html.includes('id="adh-frame"') && html.includes('id="adh-iframe"') && html.includes('id="adh-frame-back"'), 'Tools must open inside the desk with a Back button');

// Every tool card maps to a known tool, and every tool has a real page in the repository.
const tools = {};
for (const m of js.matchAll(/'([a-z-]+)':\['([^']*)','([^']*)','[^']*','([a-z]+)'\]/g)) tools[m[1]] = { clean: m[2], physical: m[3], section: m[4] };
assert.ok(Object.keys(tools).length >= 15, 'Agent hub tool registry did not parse');
for (const [key, tool] of Object.entries(tools)) {
  const file = tool.physical.replace(/^\//, '') + (tool.physical.endsWith('/') ? 'index.html' : '');
  assert.ok(fs.existsSync(file), `Tool ${key} points at a missing page: ${tool.physical}`);
  assert.ok(!tool.clean.startsWith('/property/'), `Tool ${key} must use a clean public path`);
}
for (const m of html.matchAll(/data-adh-tool="([a-z-]+)"/g)) assert.ok(tools[m[1]], `Card opens unknown tool ${m[1]}`);

// The existing desk runtimes keep every element they bind to.
for (const id of ['ad-app', 'ad-gate', 'ad-list', 'ad-stats', 'ad-total', 'ad-focus', 'ad-today-queue', 'ad-import-open', 'ad-import-side', 'ad-import-modal', 'ad-drawer', 'ad-digest', 'ad-load-more', 'ad-list-new', 'ad-list-form', 'ad-dynamic-lists', 'ad-territory-new', 'ad-territory-list', 'ad-capacity', 'ad-coverage', 'ad-funnel', 'ad-funnel-window', 'ad-portal-analytics', 'ad-refreshed', 'ad-today-transactions', 'ad-today-listings', 'ad-today-buyers', 'ad-today-openhouses']) {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `Agent Desk must keep exactly one #${id}`);
}

// Works without the hub runtime (every section shows), keeps history, and never nests the desk.
assert.match(css, /\.adh-rail,\.adh-tabbar\{display:none\}/, 'Rail and tab bar only appear once the hub runtime is ready');
assert.match(js, /history\.pushState/, 'Sections and tools must be browser-history entries');
assert.match(js, /popstate/, 'Browser Back must return to the previous section or tool');
assert.match(js, /isDesk\(href\)/, 'A tool that links back to the desk must not load the desk inside itself');
assert.match(css, /prefers-reduced-motion:reduce/, 'Agent hub must respect reduced motion');
assert.match(css, /env\(safe-area-inset-bottom\)/, 'Phone tab bar must respect the home indicator');
assert.doesNotMatch(html, /<a [^>]*href="\/property\//, 'Agent Desk links must use clean public paths');

console.log(`Agent hub contract passed (${Object.keys(tools).length} tools, 6 sections).`);
