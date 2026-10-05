// Network-isolated browser fixtures for the Data Center and Data Workbench.
// Every page asset is served from this checkout; Supabase is replaced by an in-page fake client whose
// payload shapes follow supabase/functions/workbench-hydrate and workbench-derived. Nothing leaves the
// browser. Real entitlements and live providers belong to staging acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.WATCHDOG_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const ORIGIN = 'https://www.watchdogindex.com';
const evidence = process.env.DATA_PAGES_EVIDENCE_DIR;
if (evidence) await fs.mkdir(evidence, { recursive: true });
const registry = JSON.parse(await fs.readFile(path.join(root, 'property/data/marker-registry.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });

// Governed coverage fixture: the first 40 live registry markers are DB-governed, one is unavailable.
const coverage = registry.markers.filter((m) => m.provider_status === 'live').slice(0, 40).map((m, i) => ({ marker_id: m.id, value_status: i === 39 ? 'unavailable' : 'live', bulk_capable: i % 2 === 0, last_verified_at: '2026-09-20T12:00:00Z', scopes: [m.scope] }));

async function open(route, { width = 1440, height = 900, device = null, signedIn = false, plan = 'pro_plus', failOverview = false, failRegistry = false } = {}) {
  const context = await browser.newContext(device ? { ...devices[device] } : { viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  const stats = { registry: 0 };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (request) => {
    const url = new URL(request.request().url());
    if (url.origin !== ORIGIN) return request.abort();
    if (url.pathname === '/property/data/marker-registry.json') {
      stats.registry += 1;
      if (failRegistry && stats.registry === 1) return request.fulfill({ status: 503, body: 'unavailable' });
    }
    if (url.pathname.startsWith('/api/')) return request.fulfill({ contentType: 'application/json', body: JSON.stringify({ zone: 'X', risk: 'minimal' }) });
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) return request.abort();
    const clean = { '/data-center': 'property/data-center/index.html', '/data-workbench': 'property/data-workbench/index.html' }[url.pathname];
    if (clean) file = path.join(root, clean);
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, 'index.html');
      return request.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: await fs.readFile(file) });
    } catch { return request.fulfill({ status: 404, body: 'Not found' }); }
  });
  await page.addInitScript(({ signedIn, plan, failOverview, coverage, registryIds }) => {
    const calls = window.__dataFixtureCalls = { functions: {}, rpc: {} };
    const saved = Array.from({ length: 6 }, (_, i) => ({ pams_pin: `0409_${100 + i}_${i + 1}`, address: `${100 + i} Fixture Ave`, town: 'Fixture Township', county: 'Camden', zip: '08002', block: String(100 + i), lot: String(i + 1), assessed: 250000 + i * 1000, last_year_tax: 8200, effective_rate: 3.2, watchdog_value: 410000, lat: 39.9, lon: -75.0 }));
    const tables = { saved_properties: signedIn ? saved : [], saved_data_center_views: [], data_center_delivery_jobs: [], data_workbench_views: [], data_workbench_campaigns: [], score_observations: [] };
    const user = { id: 'fixture-user', email: 'fixture@example.test' };
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const byId = new Map(registryIds.map((m) => [m.id, m]));
    function query(table) {
      let op = 'read', payload = null, single = false;
      const builder = new Proxy({}, {
        get(_t, key) {
          if (key === 'then') return (resolve, reject) => {
            const rows = tables[table] || [];
            if (op === 'insert') { const row = { id: 'row-' + rows.length, updated_at: new Date().toISOString(), ...(Array.isArray(payload) ? payload[0] : payload) }; rows.unshift(row); tables[table] = rows; return Promise.resolve({ data: single ? row : [row], error: null }).then(resolve, reject); }
            if (op === 'delete') { tables[table] = []; return Promise.resolve({ data: null, error: null }).then(resolve, reject); }
            return Promise.resolve({ data: single ? (rows[0] || null) : clone(rows), error: null }).then(resolve, reject);
          };
          if (key === 'insert' || key === 'upsert') return (data) => { op = 'insert'; payload = data; return builder; };
          if (key === 'delete') return () => { op = 'delete'; return builder; };
          if (key === 'single' || key === 'maybeSingle') return () => { single = true; return builder; };
          return () => builder;
        }
      });
      return builder;
    }
    function hydrate(pins, ids) {
      const markers = {}, meta = {};
      for (const pin of pins) {
        markers[pin] = {}; meta[pin] = {};
        for (const id of ids) {
          const m = byId.get(id);
          if (/_history$/.test(id)) { markers[pin][id] = { 2021: 97.1, 2022: 98, 2023: 98.4 }; meta[pin][id] = { status: 'available', source: 'Fixture UFB' }; }
          else if (id === 'watchdog.watchdog_score') meta[pin][id] = { status: 'not_computed', source: 'Watchdog canonical scoring pipeline' };
          else if (m && m.scope === 'county') { markers[pin][id] = 41.5; meta[pin][id] = { status: 'available', source: 'Fixture county reference' }; }
          else if (m && m.scope === 'municipality') meta[pin][id] = { status: 'source_checked_no_value', source: 'Fixture municipal reference' };
          else if (m && m.source_id === 'nj-parcels-modiv') meta[pin][id] = { status: 'source_checked_no_value', source: 'Fixture parcel' };
          else meta[pin][id] = { status: 'provider_missing', source: 'No live provider family is connected for this marker' };
        }
      }
      return { records: pins.map((pin) => ({ pams_pin: pin, acres: 0.25, prop_class: '2' })), markers, meta, provider_summary: {}, plan };
    }
    const client = {
      auth: {
        getSession: async () => ({ data: { session: signedIn ? { user, access_token: 'fixture', expires_at: 4102444800 } : null }, error: null }),
        getUser: async () => ({ data: { user: signedIn ? user : null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      rpc: async (name) => {
        calls.rpc[name] = (calls.rpc[name] || 0) + 1;
        if (name === 'get_public_data_center_overview_v1') {
          if (failOverview) return { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } };
          return { data: { contract: 'public-data-center-overview-v1', summary: { live_fields: 39, bulk_ready_fields: 20, newest_live_verified_at: '2026-09-20T12:00:00Z' }, marker_coverage: coverage, source_freshness: [{ group_key: 'core_authoritative', compliant_count: 29, total_count: 144, newest_verified_at: '2026-09-20T12:00:00Z' }] }, error: null };
        }
        if (name === 'has_watchdog_plan') return { data: signedIn && ['pro_plus', 'teams', 'developer'].includes(plan), error: null };
        if (name === 'get_my_entitlement') return { data: [{ plan_tier: plan, subscription_status: 'active' }], error: null };
        if (name === 'is_watchdog_developer') return { data: false, error: null };
        if (name === 'get_agent_usage') return { data: { plan, limits: { properties: 1000 } }, error: null };
        if (name === 'get_my_watchdog_onboarding_state') return { data: [{ completed: true }], error: null };
        if (name === 'get_my_agent_training_state') return { data: [{ required: false, completed: true }], error: null };
        if (name === 'get_workbench_provider_coverage') return { data: coverage, error: null };
        return { data: null, error: null };
      },
      from: query,
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
      functions: {
        invoke: async (name, options) => {
          calls.functions[name] = (calls.functions[name] || 0) + 1;
          const body = (options && options.body) || {};
          const pins = (body.pams_pins || []).map(String), ids = (body.marker_ids || []).map(String);
          if (name === 'workbench-hydrate') return { data: hydrate(pins, ids), error: null };
          if (name === 'workbench-derived') {
            const markers = {}, meta = {};
            for (const pin of pins) { markers[pin] = {}; meta[pin] = {}; for (const id of ids) { const m = byId.get(id); if (m && m.origin === 'watchdog-derived' && m.id !== 'watchdog.watchdog_score') meta[pin][id] = { status: 'dependency_missing', provider_kind: 'derived_governed' }; } }
            return { data: { records: [], markers, meta }, error: null };
          }
          return { data: {}, error: null };
        }
      }
    };
    window.supabase = { createClient: () => client };
  }, { signedIn, plan, failOverview, coverage, registryIds: registry.markers.map((m) => ({ id: m.id, scope: m.scope, origin: m.origin, source_id: m.source_id })) });
  await page.goto(ORIGIN + route, { waitUntil: 'load' });
  return { context, page, errors, stats };
}

const calls = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__dataFixtureCalls)));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function shot(page, name) { if (evidence) await page.screenshot({ path: path.join(evidence, name + '.png'), fullPage: false }); }

// A. Public Data Center: one registry download, one overview call, agreeing counts, visible filters.
{
  const { context, page, errors, stats } = await open('/data-center');
  await page.waitForFunction(() => document.documentElement.dataset.dcOverview === 'ready' && document.documentElement.dataset.dataCenterReady === 'true');
  await page.waitForTimeout(400);
  const c = await calls(page);
  assert.equal(stats.registry, 1, 'the Data Center downloads the marker registry once');
  assert.equal(c.rpc.get_public_data_center_overview_v1, 1, 'the Data Center calls the overview RPC once');
  assert.equal(await page.locator('.pg-summary, .pg-toggle').count(), 0, 'static provider governance does not overlay the governed page');
  const pagebarLinks = await page.$$eval('[data-dc-pagebar-action]', (links) => links.map((a) => a.getAttribute('href')));
  if (pagebarLinks.length) assert.deepEqual(pagebarLinks, ['/dashboard', '/data-workbench'], 'page-bar actions use root-level URLs');
  await page.click('[data-dc-tab="build"]');
  const liveRows = await page.locator('#dc-rows tr[data-provider-status="live"]').count();
  assert.equal(await page.textContent('#dc-kpi-live'), liveRows.toLocaleString('en-US'), 'Live fields KPI equals the builder Live filter');
  await page.selectOption('#dc-provider-status', 'planned');
  const planned = page.locator('#dc-rows tr[data-provider-status="planned"]');
  assert.ok(await planned.count() > 0, 'planned fields are listed under the Planned filter');
  assert.ok(await planned.first().isVisible(), 'planned rows are visible, not hidden by a second filter');
  assert.ok(await planned.first().locator('input[data-marker]').isDisabled(), 'planned fields cannot be added to a dataset');
  await page.selectOption('#dc-provider-status', 'live');
  await page.locator('#dc-rows [data-marker-detail]').first().click();
  assert.equal(await page.evaluate(() => document.getElementById('dc-marker-drawer').contains(document.activeElement)), true, 'marker drawer receives focus');
  assert.match(await page.getAttribute('#dc-drawer-link', 'href'), /^\/marker\?id=/);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-marker-detail]')), true, 'focus returns to the opener');
  assert.ok(await overflow(page) <= 1, 'no horizontal overflow at 1440px');
  await shot(page, 'data-center-1440');
  assert.deepEqual(errors, []);
  await context.close();
}

// B. Phone widths render without page errors or horizontal scrolling.
for (const opts of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { device: 'iPhone 13' }]) {
  const { context, page, errors } = await open('/data-center', opts);
  await page.waitForFunction(() => document.documentElement.dataset.dataCenterReady === 'true');
  await page.click('[data-dc-tab="build"]');
  await page.waitForTimeout(300);
  assert.ok(await overflow(page) <= 1, `no horizontal overflow on the Data Center at ${opts.width || opts.device}`);
  await shot(page, 'data-center-' + (opts.width || 'iphone13'));
  assert.deepEqual(errors, []);
  await context.close();
}

// C. The overview RPC fails: an explained notice replaces the forever-loading placeholders.
{
  const { context, page, errors } = await open('/data-center', { failOverview: true });
  await page.waitForFunction(() => document.documentElement.dataset.dcOverview === 'error');
  assert.ok(await page.isVisible('#dc-overview-error'), 'coverage failure notice is shown');
  assert.ok(await page.isVisible('#dc-source-freshness-error'), 'freshness failure message is shown');
  assert.equal(await page.isVisible('#dc-source-freshness-empty'), false, 'the loading placeholder is not left on screen');
  for (const id of ['dc-kpi-live', 'dc-kpi-bulk', 'dc-kpi-verified']) assert.notEqual((await page.textContent('#' + id)).trim(), '...', `${id} resolves`);
  assert.deepEqual(errors, []);
  await context.close();
}

// D. The registry download fails once: the builder shows Try again at every width, and it recovers.
{
  const { context, page, errors, stats } = await open('/data-center', { width: 1024, failRegistry: true });
  await page.click('[data-dc-tab="build"]');
  await page.waitForSelector('#dc-catalog-error:not([hidden])');
  await page.click('#dc-catalog-error [data-dc-retry]');
  await page.waitForFunction(() => document.querySelectorAll('#dc-rows [data-marker]').length > 0);
  assert.equal(await page.isVisible('#dc-catalog-error'), false, 'catalog notice clears after a successful retry');
  assert.ok(stats.registry >= 2, 'Try again fetches the registry again');
  assert.deepEqual(errors, []);
  await context.close();
}

// E. Pro+ dataset build: one base and one derived call, explicit states, structured values, full CSV.
{
  const { context, page, errors } = await open('/data-center', { signedIn: true });
  await page.waitForFunction(() => document.documentElement.dataset.dataCenterReady === 'true');
  await page.click('[data-dc-tab="build"]');
  await page.selectOption('#dc-provider-status', '');
  const municipal = registry.markers.find((m) => m.scope === 'municipality' && m.provider_status === 'live' && !/_history$/.test(m.id));
  const history = registry.markers.find((m) => m.id === 'njplus.nj-dca-ufb-longitudinal.rut_tax_collection_pct_history');
  for (const id of ['property.address', municipal.id, history.id, 'property.lot_area_sqft']) {
    await page.evaluate((id) => { const cb = document.querySelector(`#dc-rows [data-marker="${id}"]`); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }, id);
  }
  await page.waitForFunction(() => window.__dataFixtureCalls.rpc.has_watchdog_plan >= 1);
  await page.click('#dc-build');
  await page.waitForFunction(() => /^\d+ checked /.test(document.getElementById('dc-result-note').textContent));
  const c = await calls(page);
  assert.equal(c.functions['workbench-hydrate'], 1);
  assert.equal(c.functions['workbench-derived'], 1, 'every selected field is offered to the derived resolver once');
  const cells = await page.$$eval('#dc-results tbody tr:first-child td', (tds) => tds.map((td) => td.textContent));
  assert.equal(cells[1], 'No value at source', 'a municipal field with no value shows its provider state');
  assert.equal(cells[2], '2023: 98.4 · 3 yrs', 'annual histories are summarized, never [object Object]');
  assert.equal(cells[3], '10,890 sq ft', 'lot area in square feet is computed from parcel acres');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#dc-export')]);
  const csv = await fs.readFile(await download.path(), 'utf8');
  assert.match(csv, /"2021: 97\.1; 2022: 98; 2023: 98\.4"/, 'CSV carries the full history');
  assert.match(csv, /"10890"/, 'CSV keeps raw numbers');
  await shot(page, 'data-center-build');
  assert.deepEqual(errors, []);
  await context.close();
}

// F. Data Workbench: resolvers settle (no request or render loop), full field library, honest cells.
{
  const { context, page, errors } = await open('/data-workbench', { signedIn: true });
  await page.waitForSelector('#dw-rows [data-row]');
  await page.waitForTimeout(1500);
  const settled = await calls(page);
  await page.evaluate(() => { window.__rowMutations = 0; new MutationObserver((m) => { window.__rowMutations += m.length; }).observe(document.getElementById('dw-rows'), { childList: true, subtree: true, characterData: true }); });
  await page.waitForTimeout(2500);
  const after = await calls(page);
  assert.ok((settled.functions['workbench-hydrate'] || 0) <= 2, 'initial grid resolves in at most two hydrate calls');
  assert.deepEqual(after.functions, settled.functions, 'no further edge-function calls once the grid has settled');
  assert.equal(await page.evaluate(() => window.__rowMutations), 0, 'the grid does not keep re-rendering');
  assert.equal(await page.isVisible('#dw-more'), false, 'Load more is hidden for sources that are not paged');
  const shellLinks = await page.$$eval('#dw-app a[href]', (links) => links.map((a) => a.getAttribute('href')));
  assert.ok(shellLinks.length > 0 && shellLinks.every((href) => !href.startsWith('/property/')), `Workbench page links are root-level: ${shellLinks.join(', ')}`);
  await page.click('#dw-fields');
  const listed = await page.locator('#dw-fields-list [data-field]').count();
  assert.ok(listed >= registry.markers.length, `field library lists every catalog marker (${listed}/${registry.markers.length})`);
  const municipal = registry.markers.find((m) => m.scope === 'municipality' && m.provider_status === 'live' && m.tier !== 'pro_plus' && /units|county|town|tax/.test(m.id));
  await page.evaluate((id) => { const cb = document.querySelector(`#dw-fields-list [data-field="${id}"]`); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }, municipal.id);
  await page.waitForFunction((id) => { const i = [...document.querySelectorAll('#dw-head th[data-col]')].findIndex((th) => th.dataset.col === id); const td = i < 0 ? null : document.querySelectorAll('#dw-rows tr')[0].querySelectorAll('td')[i + 1]; return td && td.textContent.trim(); }, municipal.id);
  const value = await page.evaluate((id) => { const i = [...document.querySelectorAll('#dw-head th[data-col]')].findIndex((th) => th.dataset.col === id); return document.querySelectorAll('#dw-rows tr')[0].querySelectorAll('td')[i + 1].textContent.trim(); }, municipal.id);
  assert.equal(value, 'No value at source', `${municipal.id} shows its provider state instead of a parcel value`);
  const before = await calls(page);
  await page.waitForTimeout(2000);
  assert.deepEqual((await calls(page)).functions, before.functions, 'adding a field resolves once and then settles');
  await page.click('#dw-field-close');
  await page.click('#dw-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="visible"]')]);
  const csv = await fs.readFile(await download.path(), 'utf8');
  assert.match(csv, /No value at source/, 'CSV export includes resolved field states');
  assert.ok(await overflow(page) <= 1, 'no horizontal overflow on the Workbench at 1440px');
  await shot(page, 'data-workbench-1440');
  assert.deepEqual(errors, []);
  await context.close();
}

// G. Workbench on a phone.
{
  const { context, page, errors } = await open('/data-workbench', { signedIn: true, width: 390, height: 844 });
  await page.waitForSelector('#dw-rows [data-row]');
  await page.waitForTimeout(800);
  assert.ok(await overflow(page) <= 1, 'no horizontal overflow on the Workbench at 390px');
  await shot(page, 'data-workbench-390');
  assert.deepEqual(errors, []);
  // The legacy close control is hidden by the modern page shell; its handler must still use the root-level route.
  const [closeRequest] = await Promise.all([page.waitForRequest((request) => request.isNavigationRequest()), page.evaluate(() => document.getElementById('dw-close').click())]);
  assert.equal(new URL(closeRequest.url()).pathname, '/dashboard', 'Close returns to the root-level Dashboard');
  await context.close();
}

await browser.close();
console.log('Data Center and Data Workbench interaction fixtures: ok');
