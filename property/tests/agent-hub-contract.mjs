import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Agent Desk is one app: five areas on one page, and every agent tool opens inside it.
// The five areas are the agent side of the Watchdog information architecture
// (property/docs/watchdog-information-architecture.md) and the agent app tab bar.
// The former sixth "Deals" section now lives inside Clients; #deals still works.
const read = p => fs.readFileSync(p, 'utf8');
const html = read('property/agent-desk/index.html');
const js = read('property/js/agent-hub.js');
const css = read('property/css/agent-hub.css');
new vm.Script(js, { filename: 'agent-hub.js' });

assert.ok(html.includes('/property/css/agent-hub.css') && html.includes('/property/js/agent-hub.js'), 'Agent Desk must load the hub stylesheet and runtime');
const AREAS = ['home', 'clients', 'farm', 'marketing', 'research'];
for (const section of AREAS) {
  assert.ok(html.includes(`data-adh-view="${section}"`), `Agent Desk is missing the ${section} section`);
  assert.equal((html.match(new RegExp(`data-adh-nav="${section}"`, 'g')) || []).length >= 2, true, `The ${section} section needs a desktop rail link and a phone tab`);
}
const views = [...html.matchAll(/data-adh-view="([a-z]+)"/g)].map(m => m[1]);
assert.deepEqual(views, AREAS, 'Agent Desk has exactly five areas, in menu order');
assert.doesNotMatch(html, /data-adh-(?:view|nav)="deals"/, 'Deals is part of Clients, not a sixth area');
assert.match(js, /SECTION_ALIASES=\{deals:'clients'\}/, 'Old #deals links must still open the deal tools in Clients');
assert.ok(html.includes('id="adh-deals"') && html.indexOf('id="adh-deals"') > html.indexOf('data-adh-view="clients"') && html.indexOf('id="adh-deals"') < html.indexOf('data-adh-view="farm"'), 'The deal tools sit inside Clients under "Your deals"');
const tabbar = html.match(/<nav class="adh-tabbar"[\s\S]*?<\/nav>/)[0];
assert.equal((tabbar.match(/data-adh-nav=/g) || []).length, 5, 'The phone tab bar has five areas');
assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, 'The phone tab bar lays out five areas');
for (const label of ['Today', 'Clients', 'Farm', 'Marketing', 'Research']) assert.ok(tabbar.includes(`<span>${label}</span>`), `Tab bar label ${label} is missing`);

// A warm first-visit welcome: who Watchdog is for and the three things to do first.
const welcome = html.match(/<section class="adh-welcome"[\s\S]*?<\/section>/);
assert.ok(welcome, 'Agent Desk Today must open with the first-visit welcome');
assert.match(welcome[0], /New Jersey agents/, 'The welcome says who Watchdog is for');
assert.equal((welcome[0].match(/class="adh-step"/g) || []).length, 3, 'The welcome lists exactly three first steps');
assert.match(welcome[0], /data-adh-welcome-hide/, 'Agents can hide the welcome');
assert.match(welcome[0], /data-adh-tour/, 'The welcome offers the tour');
assert.match(js, /wd_agent_desk_welcome_v1/, 'Hiding the welcome is remembered');
assert.match(css, /\.adh-welcome:not\(\[hidden\]\)~\.adh-quick/, 'The quick-start row steps aside while the welcome shows');
assert.doesNotMatch(css, /radial-gradient\(circle/, 'No decorative circles (Watchdog design guardrails)');
// Every tool card explains what the tool does (and why it matters) in plain words.
for (const m of html.matchAll(/<a class="adh-tool"[^>]*data-adh-tool="([a-z-]+)"[\s\S]*?<\/a>/g)) {
  const small = (m[0].match(/<small>([^<]+)<\/small>/) || [])[1] || '';
  assert.ok(small.split(/\s+/).length >= 8, `Tool card ${m[1]} needs a plain explanation`);
}
assert.ok(html.includes('id="adh-frame"') && html.includes('id="adh-iframe"') && html.includes('id="adh-frame-back"'), 'Tools must open inside the desk with a Back button');

// Every tool card maps to a known tool, and every tool has a real page in the repository.
const tools = {};
for (const m of js.matchAll(/'([a-z-]+)':\['([^']*)','([^']*)','[^']*','([a-z]+)'\]/g)) tools[m[1]] = { clean: m[2], physical: m[3], section: m[4] };
assert.ok(Object.keys(tools).length >= 15, 'Agent hub tool registry did not parse');
for (const [key, tool] of Object.entries(tools)) {
  // Server-rendered tools point at their Vercel function (api/<name>.js).
  const file = tool.physical.startsWith('/api/') ? tool.physical.replace(/^\//, '') + '.js' : tool.physical.replace(/^\//, '') + (tool.physical.endsWith('/') ? 'index.html' : '');
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

// First-visit tour (replayable), live card numbers, and Intelligence mounted inside Home.
assert.match(js, /wd_agent_desk_tour_v1/, 'Agent Desk must offer a first-visit tour');
assert.ok(html.includes('data-adh-tour'), 'Agent Desk must let agents replay the tour');
assert.match(js, /localStorage\.getItem\(TOUR_KEY\)/, 'The tour must remember it was seen');
assert.match(js, /catch\(_\)\{return true;\}/, 'Blocked storage must not trap agents in the tour');
for (const key of ['farm', 'lists', 'watched', 'campaigns']) assert.ok(html.includes(`data-adh-stat="${key}"`), `Card is missing its live ${key} number`);
assert.match(read('property/js/watchdog-intelligence-context.js'), /getElementById\('adh-home'\)/, 'Watchdog Intelligence must mount inside the Home section, not the app grid');
assert.match(css, /\.adh-ready \.adh-rail\{grid-column:1;grid-row:1 \/ span 50\}/, 'The rail must keep its column when another script injects content');

console.log(`Agent hub contract passed (${Object.keys(tools).length} tools, 5 areas).`);
