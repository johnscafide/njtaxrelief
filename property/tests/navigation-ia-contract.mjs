// Watchdog information architecture contract.
// One menu structure, the same labels on every navigation surface, an obvious way
// back to the Agent Desk from every agent tool. Source of truth:
// property/docs/watchdog-information-architecture.md
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const menuJs = read('property/js/watchdog-universal-menu.js');
const hubJs = read('property/js/agent-hub.js');
const workspaceJs = read('property/js/agent-workspace.js');
const shellJs = read('property/js/app-shell-2027.js');
const deskHtml = read('property/agent-desk/index.html');
const crumbCss = read('property/css/watchdog-page-head.css');
const doc = read('property/docs/watchdog-information-architecture.md');

/* ---------- 1. Run the real menu runtime for each persona ---------- */
const PERSONAS = {
  visitor: null,
  homeowner: { profile: { display_name: 'Pat', roles: ['homeowner'], plan_tier: 'standard' }, entitlement: { plan_tier: 'standard', subscription_status: 'none' } },
  agent: { profile: { display_name: 'Jamie', roles: ['real_estate_agent'], role: 'agent', plan_tier: 'agent' }, entitlement: { plan_tier: 'agent', subscription_status: 'active' } },
  pro: { profile: { display_name: 'Lee', roles: ['appraiser'], role: 'appraiser', plan_tier: 'pro_plus' }, entitlement: { plan_tier: 'pro_plus', subscription_status: 'active' } }
};

async function runMenu({ persona = null, host = 'www.watchdogindex.com', path = '/', hash = '', sidebarPage = '' } = {}) {
  const created = [];
  const makeEl = (tag = 'div') => {
    const el = {
      tagName: String(tag).toUpperCase(), id: '', className: '', innerHTML: '', dataset: {}, style: {}, children: [],
      classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle() {} },
      setAttribute(k, v) { this[`attr:${k}`] = String(v); }, getAttribute(k) { return this[`attr:${k}`] ?? null; }, removeAttribute(k) { delete this[`attr:${k}`]; },
      appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
      querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, focus() {}
    };
    created.push(el);
    return el;
  };
  const body = makeEl('body');
  body.getAttribute = (k) => (k === 'data-sidebar-page' ? sidebarPage || null : null);
  const document = {
    readyState: 'complete', body, head: makeEl('head'), documentElement: makeEl('html'), activeElement: null,
    getElementById: (id) => created.find((el) => el.id === id) || null,
    querySelector: () => null, querySelectorAll: () => [], createElement: makeEl,
    addEventListener() {}, dispatchEvent() {}
  };
  const store = new Map();
  const user = persona ? { id: 'user-1', email: 'person@example.com', user_metadata: {}, created_at: '2020-01-01T00:00:00Z' } : null;
  const db = {
    auth: { getSession: async () => ({ data: { session: user ? { user } : null } }), signOut: async () => ({}) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: persona ? persona.profile : null }) }),
    rpc: async (name) => ({ data: name === 'get_my_entitlement' ? (persona ? [persona.entitlement] : []) : null })
  };
  const context = {
    document, navigator: {}, console, URLSearchParams, WeakSet, Promise,
    location: { hostname: host, pathname: path, hash, search: '', origin: `https://${host}` },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    requestAnimationFrame: (cb) => { cb(); return 1; }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    MutationObserver: class { observe() {} },
    supabase: { createClient: () => db }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(menuJs, context, { filename: 'watchdog-universal-menu.js' });
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
  const api = context.WatchdogUniversalMenu;
  const sheet = document.getElementById('wd-main-sheet');
  // Arrays built inside the VM belong to another realm; copy them so deepEqual compares values.
  const items = Array.from(api.items(), (i) => ({ key: i.key, href: i.href, label: i.label }));
  return { api, keys: items.map((i) => i.key), items, drawer: sheet ? sheet.innerHTML : '' };
}

const HOME = ['dashboard', 'lookup', 'home', 'pulse', 'anchor', 'town-compare', 'robust'];
const visitor = await runMenu({ persona: PERSONAS.visitor });
assert.deepEqual(visitor.keys, [...HOME, 'data-center', 'pro', 'account'], 'Signed-out visitors see the homeowner destinations, the public Data Center and plans');
const homeowner = await runMenu({ persona: PERSONAS.homeowner, path: '/dashboard', sidebarPage: 'dashboard' });
assert.deepEqual(homeowner.keys, [...HOME, 'data-center', 'pro', 'account'], 'Homeowners never get professional tools in their list');
assert.match(homeowner.drawer, /<p class="wd-universal-lens-eyebrow wd-universal-lens-home">For your home<\/p>(?:<a [^>]*>[\s\S]*?<\/a>){5}<p class="wd-universal-lens-eyebrow wd-universal-lens-home wd-universal-group-learn">Learn and compare<\/p>/, 'Home lens: five destinations (the homeowner tab bar), then Learn and compare');
assert.match(homeowner.drawer, /class="wd-universal-link wd-universal-lens-home active" aria-current="page" data-wd-nav="dashboard"/, 'Dashboard is marked current on the Dashboard');

const agent = await runMenu({ persona: PERSONAS.agent, path: '/farm-map', sidebarPage: 'agent-desk' });
assert.deepEqual(agent.keys, [...HOME, 'agent-desk', 'clients', 'farm', 'marketing', 'research', 'account'], 'Agents get exactly the five Agent Desk areas in My work');
assert.match(agent.drawer, /class="wd-universal-link wd-universal-lens-work active" aria-current="page" data-wd-nav="farm"/, 'An agent tool page lights up its area (Farm Map -> Farm)');
assert.match(agent.drawer, /data-wd-universal="lens" data-wd-lens="work" aria-selected="true"/, 'Agent tool pages open the menu on My work');
assert.equal((agent.drawer.match(/ active"/g) || []).length, 1, 'Exactly one current destination');
const agentHrefs = Object.fromEntries(agent.items.map((i) => [i.key, i.href]));
assert.equal(agentHrefs['agent-desk'], '/agent-desk');
for (const area of ['clients', 'farm', 'marketing', 'research']) assert.equal(agentHrefs[area], `/agent-desk#${area}`, `${area} opens its Agent Desk section`);
for (const item of agent.items.concat(visitor.items)) assert.ok(!item.href.startsWith('/property'), `Menu link ${item.key} must use a clean public URL on WatchdogIndex`);

const onDesk = await runMenu({ persona: PERSONAS.agent, path: '/agent-desk', hash: '#deals', sidebarPage: 'agent-desk' });
assert.match(onDesk.drawer, /active" aria-current="page" data-wd-nav="clients"/, 'The retired #deals section maps to Clients');
assert.equal(Object.fromEntries(onDesk.items.map((i) => [i.key, i.href]))['agent-desk'], '/agent-desk#home', 'On the desk, Agent Desk switches to Today in place');

const preview = await runMenu({ persona: PERSONAS.agent, host: 'watchdog-preview.vercel.app', path: '/property/farm-map/' });
assert.equal(Object.fromEntries(preview.items.map((i) => [i.key, i.href])).farm, '/property/agent-desk#farm', 'Preview hosts use the physical /property route');

const pro = await runMenu({ persona: PERSONAS.pro, path: '/data-center', sidebarPage: 'data-center' });
assert.deepEqual(pro.keys, [...HOME, 'scan', 'transaction', 'data-workbench', 'data-center', 'pro', 'account'], 'Non-agent professionals keep their research tools');

const areaFor = agent.api.areaFor;
for (const [path, hash, area] of [
  ['/farm-map', '', 'farm'], ['/property/farm-builder/', '', 'farm'], ['/market-list', '', 'farm'],
  ['/agent/contacts', '', 'clients'], ['/agent/listing-prep', '', 'clients'], ['/agent/buyers/', '', 'clients'], ['/agent/open-house', '', 'clients'], ['/transaction/', '', 'clients'], ['/true-cost', '', 'clients'],
  ['/marketing-studio/postcards', '', 'marketing'], ['/newsletter-studio', '', 'marketing'], ['/report-builder', '', 'marketing'], ['/report-studio', '', 'marketing'], ['/marketing-plan', '', 'marketing'], ['/growth/run.html', '', 'marketing'],
  ['/scan', '', 'research'], ['/data-workbench', '', 'research'], ['/data-center', '', 'research'],
  ['/agent-desk', '', 'agent-desk'], ['/agent-desk', '#farm/farm-map', 'farm'], ['/agent-desk', '#deals', 'clients'], ['/agent/training', '', 'agent-desk'],
  ['/agent/jamie-rivera', '', ''], ['/home', '', ''], ['/', '', '']
]) assert.equal(areaFor(path, hash), area, `areaFor(${path}${hash}) should be "${area}"`);

/* ---------- 1b. Idle pages do not re-render the shared chrome in a loop ----------
   Real browsers serialize innerHTML differently from the source string, the menu
   observes its own profile host, and other runtimes add rows to it (the ANCHOR
   profile row). This used to re-render the profile about 60 times a second on
   /dashboard and /data-center. The stub below reproduces all three conditions. */
async function idleProfileWrites() {
  const created = [];
  const writes = { profile: 0 };
  const notify = (el) => (el._observers || []).forEach((o) => {
    if (o.pending) return;
    o.pending = true;
    queueMicrotask(() => { if (o.pending) { o.pending = false; o.cb([{ addedNodes: [] }]); } });
  });
  const makeEl = (tag = 'div') => {
    const el = {
      tagName: String(tag).toUpperCase(), id: '', className: '', dataset: {}, style: {}, children: [], _src: '', firstElementChild: null, firstChild: null,
      classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle() {} },
      get innerHTML() { return this._src.replace(/"/g, "'"); },
      set innerHTML(v) { if (this.firstChild) this.firstChild.parentNode = null; this._src = String(v); this.firstElementChild = this.firstChild = { parentNode: this }; if (this.id === 'wd6-profile') writes.profile += 1; notify(this); },
      setAttribute(k, v) { this[`attr:${k}`] = String(v); }, getAttribute(k) { return this[`attr:${k}`] ?? null; }, removeAttribute(k) { delete this[`attr:${k}`]; },
      appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
      querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, focus() {}
    };
    created.push(el);
    return el;
  };
  const body = makeEl('body');
  body.getAttribute = (k) => (k === 'data-sidebar-page' ? 'dashboard' : null);
  const profile = makeEl('aside');
  profile.id = 'wd6-profile';
  const document = {
    readyState: 'complete', body, head: makeEl('head'), documentElement: makeEl('html'), activeElement: null,
    getElementById: (id) => created.find((el) => el.id === id) || null,
    querySelector: () => null, querySelectorAll: () => [], createElement: makeEl, addEventListener() {}, dispatchEvent() {}
  };
  const persona = PERSONAS.agent;
  const user = { id: 'user-1', email: 'person@example.com', user_metadata: {}, created_at: '2020-01-01T00:00:00Z' };
  const db = {
    auth: { getSession: async () => ({ data: { session: { user } } }), signOut: async () => ({}) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: persona.profile }) }),
    rpc: async (name) => ({ data: name === 'get_my_entitlement' ? [persona.entitlement] : null })
  };
  const context = {
    document, navigator: {}, console, URLSearchParams, WeakSet, Promise,
    location: { hostname: 'www.watchdogindex.com', pathname: '/dashboard', hash: '', search: '', origin: 'https://www.watchdogindex.com' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: (cb) => { setImmediate(cb); return 1; }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    MutationObserver: class { constructor(cb) { this.cb = cb; this.pending = false; } observe(t) { t._observers = (t._observers || []).concat(this); } takeRecords() { this.pending = false; return []; } disconnect() {} },
    supabase: { createClient: () => db }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(menuJs, context, { filename: 'watchdog-universal-menu.js' });
  const ticks = async (n) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };
  // Another runtime adds its own row inside the profile after every render (like the ANCHOR row).
  let lastSeen = null;
  const augment = () => { if (profile.firstChild && profile.firstChild !== lastSeen && !profile._src.includes('data-anchor-row')) { lastSeen = profile.firstChild; profile._src += '<a data-anchor-row></a>'; notify(profile); } };
  const results = {};
  for (let i = 0; i < 40; i += 1) { augment(); await ticks(1); }
  results.settled = writes.profile;
  for (let i = 0; i < 60; i += 1) { augment(); await ticks(1); }
  results.idle = writes.profile - results.settled;
  // A different script replacing the popover content gets exactly one re-render.
  profile.innerHTML = '<header>Another shell</header>';
  const beforeForeign = writes.profile;
  await ticks(20);
  results.afterForeign = writes.profile - beforeForeign;
  return results;
}
const idle = await idleProfileWrites();
assert.ok(idle.settled <= 3, `The profile renders once per real change (${idle.settled} writes while settling)`);
assert.equal(idle.idle, 0, 'An idle page must not keep re-rendering the shared profile');
assert.equal(idle.afterForeign, 1, 'A foreign overwrite of the profile is repaired exactly once');
assert.doesNotMatch(menuJs, /innerHTML\s*!==/, 'Shared chrome must not compare innerHTML against its source string');
assert.match(menuJs, /function renderChrome\(node,html\)/, 'Shared chrome renders through one idempotent helper');
assert.match(menuJs, /observer\.takeRecords\(\)/, 'The menu drops the mutation records of its own writes');

/* ---------- 2. Same labels on every surface ---------- */
const menuAreas = Object.fromEntries(agent.api.areas.map((a) => [a.section, a.label]));
assert.deepEqual(Array.from(agent.api.areas, (a) => a.label), ['Agent Desk', 'Clients', 'Farm', 'Marketing', 'Research'], 'Five agent areas, in order');
const hubSections = Object.fromEntries([...hubJs.match(/var SECTIONS=\{([^}]*)\}/)[1].matchAll(/(\w+):'([^']+)'/g)].map((m) => [m[1], m[2]]));
const wsAreas = Object.fromEntries([...workspaceJs.match(/var AREAS=\{([^}]*)\}/)[1].matchAll(/(\w+):'([^']+)'/g)].map((m) => [m[1], m[2]]));
assert.deepEqual(Object.keys(hubSections), ['home', 'clients', 'farm', 'marketing', 'research'], 'Agent Desk areas match the menu areas');
for (const key of ['clients', 'farm', 'marketing', 'research']) {
  assert.equal(hubSections[key], menuAreas[key], `Agent Desk calls ${key} "${menuAreas[key]}" like the menu`);
  assert.equal(wsAreas[key], menuAreas[key], `Workspace breadcrumb calls ${key} "${menuAreas[key]}" like the menu`);
}
assert.equal(hubSections.home, 'Today', 'The desk home area is Today');
assert.equal(wsAreas.home, 'Agent Desk');
const railLabels = [...deskHtml.match(/<div class="adh-nav-list">[\s\S]*?<\/div>/)[0].matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
const tabLabels = [...deskHtml.match(/<nav class="adh-tabbar"[\s\S]*?<\/nav>/)[0].matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
assert.deepEqual(railLabels, ['Today', 'Clients', 'Farm', 'Marketing', 'Research'], 'Desk rail labels');
assert.deepEqual(tabLabels, railLabels, 'Desk phone tab bar uses the same labels as the rail');

// Canonical tool names: the desk card title is the name the frame, breadcrumb and IA doc use.
const TOOLS = {};
for (const m of hubJs.matchAll(/'([a-z-]+)':\['([^']*)','([^']*)','([^']*)','([a-z]+)'\]/g)) TOOLS[m[1]] = { clean: m[2], title: m[4], section: m[5] };
for (const m of deskHtml.matchAll(/<a class="adh-tool" href="[^"]*" data-adh-tool="([a-z-]+)">[\s\S]*?<b>([^<]+)<\/b>/g)) {
  const name = m[2].replace(/&amp;/g, '&');
  assert.equal(TOOLS[m[1]].title, name, `Desk card "${name}" and the in-desk frame title must match`);
  const section = m.index > deskHtml.indexOf('data-adh-view="research"') ? 'research' : m.index > deskHtml.indexOf('data-adh-view="marketing"') ? 'marketing' : m.index > deskHtml.indexOf('data-adh-view="farm"') ? 'farm' : m.index > deskHtml.indexOf('data-adh-view="clients"') ? 'clients' : 'home';
  assert.equal(TOOLS[m[1]].section, section, `${name} belongs to the ${section} area`);
  if (TOOLS[m[1]].clean !== '/' && areaFor(TOOLS[m[1]].clean, '') !== '') assert.equal(areaFor(TOOLS[m[1]].clean, ''), section === 'home' ? 'agent-desk' : section, `${name} lights up the ${section} area in the menu`);
}

/* ---------- 3. Every agent tool has a header with a way back to the desk ---------- */
const crumbPages = [
  ['property/marketing-studio/postcards/index.html', 'marketing', 'Postcard Studio'],
  ['property/newsletter-studio/index.html', 'marketing', 'Email Updates'],
  ['property/report-builder/index.html', 'marketing', 'Report Builder'],
  ['property/marketing-plan/index.html', 'marketing', 'Marketing Plan'],
  ['property/report-studio/index.html', 'marketing', 'Farm Reports'],
  ['agent/listing-prep/index.html', 'clients', 'Listing Prep'],
  ['agent/buyers/index.html', 'clients', 'Buyer Shortlists'],
  ['agent/open-house/index.html', 'clients', 'Open Houses'],
  ['agent/contacts/index.html', 'clients', 'Contacts'],
  ['property/agent/contacts/index.html', 'clients', 'Contacts'],
  ['transaction/index.html', 'clients', 'Transactions'],
  ['agent/training/index.html', '', 'Training &amp; how-tos'],
  ['property/agent/training/index.html', '', 'Training &amp; how-tos']
];
for (const [file, area, label] of crumbPages) {
  const html = read(file);
  const nav = (html.match(/<nav class="wd-crumbs[^"]*" aria-label="Breadcrumb">[\s\S]*?<\/nav>/) || [])[0];
  assert.ok(nav, `${file} needs the Agent Desk breadcrumb`);
  assert.match(nav, /^<nav[^>]*><a class="wd-crumbs-desk" href="\/agent-desk" data-wd-route>/, `${file}: the first crumb goes back to the Agent Desk`);
  if (area) assert.ok(nav.includes(`<a href="/agent-desk#${area}" data-wd-route>${menuAreas[area]}</a>`), `${file}: the second crumb opens ${menuAreas[area]}`);
  assert.ok(nav.includes(`<span class="wd-crumbs-here" aria-current="page">${label}</span>`), `${file}: the last crumb names the page (${label})`);
  assert.ok(!/href="\/property\//.test(nav), `${file}: breadcrumb links use clean URLs`);
  assert.ok(html.includes('/property/css/watchdog-page-head.css'), `${file} must load the shared breadcrumb styles`);
}
const wsPages = Object.keys(Object.fromEntries([...workspaceJs.match(/var PAGES=\{([\s\S]*?)\n  \};/)[1].matchAll(/'([a-z-]+)':\{/g)].map((m) => [m[1], 1])));
const barFiles = ['property/farm-map/index.html', 'property/farm-builder/index.html', 'property/market-list/index.html', ...fs.readdirSync('property/growth').filter((f) => f.endsWith('.html')).map((f) => `property/growth/${f}`)];
for (const file of barFiles) {
  const html = read(file);
  const active = (html.match(/id="agent-workspace-nav" data-active="([^"]*)"/) || [])[1];
  assert.ok(active && wsPages.includes(active), `${file} must declare a workspace page key the breadcrumb knows (got "${active}")`);
  assert.ok(html.includes('/property/css/watchdog-page-head.css'), `${file} must load the shared breadcrumb styles`);
}
assert.match(workspaceJs, /class="wd-crumbs-desk" href="'\+esc\(route\('\/agent-desk'\)\)\+'"/, 'Workspace bar breadcrumb starts with the way back to the desk');
assert.doesNotMatch(workspaceJs, /var TABS=/, 'The workspace bar no longer carries a second set of tabs');
assert.match(hubJs, /\.wd-crumbs,\.ag-utility/, 'Inside the desk frame the page breadcrumb gives way to the desk Back bar');
assert.match(shellJs, /if\(!document\.querySelector\('\.wd-crumbs'\)\)/, 'Pages with their own breadcrumb header skip the generic page bar');
assert.doesNotMatch(shellJs, /href="\/property\/|location\.href='\/property/, 'App shell links use host-aware clean routes');
assert.doesNotMatch(deskHtml, /<a [^>]*href="\/property\//, 'Agent Desk links use clean URLs (assets may stay under /property)');

/* ---------- 4. Breadcrumb styles follow the board rules ---------- */
assert.match(crumbCss, /min-height:44px/, '44px touch targets');
assert.match(crumbCss, /:focus-visible\{outline:3px solid/, 'Visible focus ring');
assert.match(crumbCss, /@media print\{\.wd-crumbs\{display:none!important\}\}/, 'Breadcrumbs do not print');
assert.match(crumbCss, /prefers-reduced-motion/, 'Reduced motion rule');
assert.match(crumbCss, /position:static;z-index:auto;background:transparent;box-shadow:none/, 'Resets the legacy global nav rule');
for (const m of crumbCss.matchAll(/font(?:-size)?:[^;{}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12, `Breadcrumb text must be at least 12px (found ${m[1]}px)`);
assert.doesNotMatch(crumbCss, /radial-gradient|border-left/, 'No decorative circles or border-left accents');

/* ---------- 4b. Shared header, menus and cookie banner meet the 12px / 44px floor ---------- */
const shellCss = read('property/css/app-shell-2027.css');
const menuCss = read('property/css/watchdog-universal-menu.css');
const consentCss = read('property/css/watchdog-consent.css');
const floor = shellCss.slice(shellCss.indexOf('Readability floor for the shared app header'));
assert.ok(floor.length > 100, 'App shell must end with the readability floor block');
for (const rule of ['.wdx-brand{min-height:44px;min-width:44px}', '.wdx-brand-copy small,body.wdx-modern .wd4-brand-copy small{font-size:12px', '.wdx-date span,.wdx-weather span{font-size:12px}', 'font-size:12px;line-height:1}', '.wdx-icon,.wdx-user{min-width:44px;min-height:44px}', '.wdx-btn{min-height:44px;font-size:13px}', 'body.wdx-modern .wd6-x{width:44px;height:44px}']) {
  assert.ok(floor.includes(rule), `App shell floor is missing ${rule}`);
}
assert.match(read('property/css/agent-workspace.css'), /body\.wdx-agent-workspace \.wdx-menu\{width:44px;height:44px\}/, 'Agent workspace menu button keeps a 44px target');
const menuFloor = menuCss.slice(menuCss.indexOf('Readability floor for shared chrome'));
for (const rule of ['plan-promo-copy>small{font-size:12px', 'plan-promo-copy>em{font-size:12px', 'plan-promo-cta{font-size:12px', '.wd-universal-profile-close,.wd-universal-invite-x{min-width:44px!important;min-height:44px!important}', '.wd-public-trigger{min-width:44px!important;min-height:44px!important}', '.wd-anchor-apps-top{width:44px!important;height:44px!important}']) {
  assert.ok(menuFloor.includes(rule), `Menu floor is missing ${rule}`);
}
for (const m of consentCss.matchAll(/font(?:-size)?:[^;{}]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 12, `Cookie banner text must be at least 12px (found ${m[1]}px)`);
for (const m of consentCss.matchAll(/\.wd-consent-banner button[^{]*\{[^}]*min-height:(\d+)px/g)) assert.ok(Number(m[1]) >= 44, `Cookie banner buttons must be at least 44px tall (found ${m[1]}px)`);

/* ---------- 5. The IA doc names the structure ---------- */
for (const word of ['Agent Desk', 'Clients', 'Farm', 'Marketing', 'Research', 'Dashboard', 'Property Lookup', 'Property Home', 'Property Pulse', 'ANCHOR Applications', 'Town Compare', 'ROBUST Framework', 'Plans & Pricing']) {
  assert.ok(doc.includes(word), `IA doc must describe "${word}"`);
}
assert.doesNotMatch(doc, /\]\(\/property\/|https:\/\/www\.watchdogindex\.com\/property\//, 'IA doc links use clean public URLs');

console.log('Navigation IA contract passed (4 personas, 5 agent areas, ' + (crumbPages.length + barFiles.length) + ' agent tool headers).');
