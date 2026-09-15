import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Isolated browser fixtures verify interaction behavior only. All network access is blocked.
// Real Agent entitlement and live integrations belong to staging acceptance.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.WATCHDOG_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const evidence = process.env.AGENT_FIXTURE_EVIDENCE_DIR;
if (evidence) await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const allowedScripts = new Set([
  'agent-ui-safety.js', 'agent-desk.js', 'agent-control.js', 'agent-list-actions.js',
  'agent-capacity.js', 'agent-import-mobile-a11y.js', 'agent-control-evidence-mobile.js'
]);

async function fixture(mode, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://agent-fixture.test') return route.abort();
    if (url.pathname === '/agent-desk') {
      let html = await fs.readFile(path.join(root, 'property/agent-desk/index.html'), 'utf8');
      html = html.replace('<body ', '<body class="wdx-modern" ');
      html = html.replace('</body>', '<script src="/property/js/agent-import-mobile-a11y.js"></script><script src="/property/js/agent-control-evidence-mobile.js"></script></body>');
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) return route.abort();
    if (file.endsWith('.js') && !allowedScripts.has(path.basename(file))) return route.fulfill({ contentType: 'text/javascript', body: '' });
    try {
      return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: await fs.readFile(file) });
    } catch { return route.abort(); }
  });
  await page.addInitScript(({ mode }) => {
    const now = new Date().toISOString();
    const rows = {
      saved_properties: [],
      agent_farm_properties: mode === 'worklist' ? [
        { id: 'farm-1', pams_pin: 'fixture_1', address: '123 Fixture Street', municipality: 'Fixture Town', relationship: 'past_client', updated_at: now },
        { id: 'farm-2', pams_pin: 'fixture_2', address: '456 Fixture Avenue', municipality: 'Fixture Town', relationship: 'sphere', assessed: null, last_year_tax: null, watchdog_value: null, updated_at: now }
      ] : [],
      property_update_events: mode === 'worklist' ? [{ pams_pin: 'fixture_1', event_type: 'assessment_change', title: 'Assessment record changed', summary: 'Fixture evidence for interaction testing.', occurred_at: now, delta_numeric: 100000, old_value: 200000, source_url: 'https://www.nj.gov/treasury/taxation/' }] : [],
      agent_opportunity_actions: [], agent_digest_preferences: [{ user_id: 'fixture-agent', enabled: true }],
      agent_territories: [], agent_funnel_events: [], agent_dynamic_list_diffs: [],
      agent_dynamic_lists: [{ id: 'list-1', name: 'Fixture residential farm', scope_type: 'municipality', scope_value: 'Fixture Town', criteria: { property_classes: ['2'] }, monitored: true, monitor_cadence: 'weekly', last_monitor_status: 'complete_no_change' }]
    };
    Object.values(rows).forEach(records => records.forEach(row => { row.user_id = 'fixture-agent'; }));
    const state = window.agentFixture = { rows, rpcCalls: 0, queries: 0, failActions: false, failDigest: false, failMonitoring: false };
    const clone = data => JSON.parse(JSON.stringify(data));
    function query(table) {
      let operation = 'read', payload, single = false;
      const filters = [];
      const chain = {
        select() { return chain; }, order() { return chain; }, limit() { return chain; }, gte() { return chain; }, like() { return chain; },
        eq(key, value) { filters.push(row => row[key] === value); return chain; },
        maybeSingle() { single = true; return chain; }, single() { single = true; return chain; },
        upsert(data) { operation = 'upsert'; payload = data; return chain; },
        insert(data) { operation = 'insert'; payload = data; return chain; },
        update(data) { operation = 'update'; payload = data; return chain; },
        delete() { operation = 'delete'; return chain; },
        then(resolve, reject) {
          state.queries++;
          if (mode === 'load-error' && table === 'saved_properties') {
            return Promise.resolve({ data: null, error: { message: 'Network unavailable' } }).then(resolve, reject);
          }
          if ((operation !== 'read' && table === 'agent_opportunity_actions' && state.failActions) ||
              (operation !== 'read' && table === 'agent_digest_preferences' && state.failDigest) ||
              (operation === 'update' && table === 'agent_dynamic_lists' && payload.monitored !== undefined && state.failMonitoring)) {
            return Promise.resolve({ data: null, error: { message: 'Network unavailable' } }).then(resolve, reject);
          }
          const tableRows = rows[table] || (rows[table] = []);
          let result = tableRows.filter(row => filters.every(filter => filter(row)));
          if (operation === 'insert' || operation === 'upsert') {
            result = (Array.isArray(payload) ? payload : [payload]).map(item => {
              const previous = operation === 'upsert' && tableRows.find(row => item.opportunity_key ? row.opportunity_key === item.opportunity_key : item.address ? row.address === item.address : row.user_id === item.user_id);
              if (previous) { Object.assign(previous, item); return previous; }
              const record = { id: 'fixture-' + tableRows.length, ...item };
              tableRows.push(record);
              return record;
            });
          } else if (operation === 'update') result.forEach(row => Object.assign(row, payload));
          else if (operation === 'delete') rows[table] = tableRows.filter(row => !result.includes(row));
          return Promise.resolve({ data: clone(single ? result[0] || null : result), error: null }).then(resolve, reject);
        }
      };
      return chain;
    }
    const client = {
      from: query,
      rpc: async name => {
        if (name !== 'get_agent_usage') throw new Error('Unexpected fixture RPC: ' + name);
        state.rpcCalls++;
        const usage = { properties: rows.agent_farm_properties.length, lists: rows.agent_dynamic_lists.length, territories: rows.agent_territories.length };
        return { data: { plan: 'agent', usage, limits: { properties: 1000, lists: 10, territories: 10 }, remaining: { properties: 1000 - usage.properties, lists: 10 - usage.lists, territories: 10 - usage.territories } }, error: null };
      },
      functions: { invoke: async () => ({ data: { count: 12 }, error: null }) }
    };
    window.supabase = { createClient: () => client };
    window.NJPTRAccess = { client: () => client };
    window.njptrAccessReady = Promise.resolve({ user: { id: 'fixture-agent' }, plan: 'agent', developer: false });
  }, { mode });
  await page.goto('https://agent-fixture.test/agent-desk');
  if (mode === 'load-error') await page.getByRole('heading', { name: 'Your desk could not load' }).waitFor();
  else await page.locator('#ad-app:not([hidden])').waitFor();
  if (mode !== 'load-error') await page.locator('[data-list-monitor-panel]').first().waitFor();
  return { page, context, errors };
}

try {
  const first = await fixture('empty');
  const page = first.page;
  await page.getByRole('heading', { name: 'Start with a property you know' }).waitFor();
  assert.equal(await page.locator('#ad-focus a[href="/"]').count(), 1);
  assert.equal(await page.locator('#ad-focus a[href="/farm-map"]').count(), 1);
  const before = await page.evaluate(() => ({ rpc: agentFixture.rpcCalls, queries: agentFixture.queries }));
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(() => ({ rpc: agentFixture.rpcCalls, queries: agentFixture.queries })), before, 'An idle desk must not continuously query or refresh itself');
  await page.evaluate(() => { for (let i = 0; i < 10; i++) document.body.append(document.createElement('span')); });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => agentFixture.rpcCalls), before.rpc, 'Unrelated DOM changes must not trigger quota queries');
  const firstImport = page.locator('[data-start-import]');
  await firstImport.click();
  await page.waitForFunction(() => document.activeElement?.id === 'ad-import-close');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-start-import'));
  assert.equal(await page.locator('#ad-import-modal').getAttribute('hidden'), '');
  if (evidence) await page.locator('#ad-focus').screenshot({ path: path.join(evidence, 'agent-first-run-desktop-FIXTURE.png') });
  await page.locator('#ad-list-new').click();
  await page.locator('#ad-list-name').fill('Second fixture farm');
  await page.locator('#ad-list-value').fill('Second Fixture Town');
  await page.locator('#ad-list-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-list-monitor-panel]').length === 2);
  await page.waitForFunction(() => window.WatchdogAgentCapacity.get().usage.lists === 2);
  const afterCreate = await page.evaluate(() => agentFixture.rpcCalls);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => agentFixture.rpcCalls), afterCreate, 'Saving a list must finish refreshing');
  await page.evaluate(() => { agentFixture.failMonitoring = true; });
  await page.locator('.ad-list-monitor-toggle').first().click();
  await page.waitForFunction(() => document.querySelector('[data-list-monitor]').checked && !document.querySelector('[data-list-monitor]').disabled);
  assert.match(await page.locator('#pl-toast').innerText(), /could not be saved/);
  assert.deepEqual(first.errors, []);
  await first.context.close();

  const work = await fixture('worklist');
  const cards = work.page.locator('.ad-card');
  assert.equal(await cards.count(), 2);
  assert.doesNotMatch(await cards.nth(1).locator('.ad-reason').innerText(), /\$0/, 'Missing record amounts must not render as zero-dollar facts');
  const evidenceButton = cards.first().locator('[data-action="evidence"]');
  await evidenceButton.click();
  await work.page.waitForFunction(() => document.activeElement?.id === 'ad-drawer-close');
  await work.page.keyboard.press('Escape');
  await work.page.waitForFunction(() => document.activeElement?.dataset.action === 'evidence');
  await cards.first().locator('[data-action="watch"]').click();
  await work.page.locator('[data-queue="watch"]').click();
  await work.page.waitForFunction(() => document.querySelectorAll('.ad-card').length === 1);
  assert.match(await cards.first().innerText(), /123 Fixture Street/);
  assert.equal(await work.page.locator('#ad-watch-count').innerText(), '1');
  await work.page.evaluate(() => { agentFixture.failActions = true; });
  await cards.first().locator('[data-action="snooze"]').click();
  await work.page.waitForFunction(() => !document.querySelector('[data-action="snooze"]').disabled);
  assert.equal(await cards.count(), 1, 'Failed snooze must keep the property visible');
  assert.match(await work.page.locator('#pl-toast').innerText(), /could not reach/);
  await cards.first().locator('[data-action="outcome"]').selectOption('touch');
  await work.page.waitForFunction(() => document.querySelector('[data-action="outcome"]').value === '');
  assert.equal(await work.page.evaluate(() => agentFixture.rows.agent_funnel_events.filter(event => event.event_name === 'conversation_started').length), 0, 'Failed outcomes must not inflate conversion analytics');
  await work.page.evaluate(() => { agentFixture.failDigest = true; });
  await work.page.locator('.ad-switch').click();
  await work.page.waitForFunction(() => document.querySelector('#ad-digest').checked && !document.querySelector('#ad-digest').disabled);
  assert.deepEqual(work.errors, []);
  await work.context.close();

  const mobile = await fixture('empty', 390);
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'First-session Agent Desk must fit mobile width');
  if (evidence) await mobile.page.locator('#ad-focus').screenshot({ path: path.join(evidence, 'agent-first-run-mobile-FIXTURE.png') });
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();
  const unavailable = await fixture('load-error');
  assert.equal(await unavailable.page.getByRole('button', { name: 'Retry loading your desk' }).count(), 1);
  assert.doesNotMatch(await unavailable.page.locator('#ad-gate').innerText(), /Compare plans|Sign in with an active/);
  assert.deepEqual(unavailable.errors, []);
  await unavailable.context.close();
  console.log('Agent Desk isolated browser interactions passed: idle stability, list refresh, first-run paths, keyboard dialogs, Watching queue, null amounts, failed writes and digest rollback.');
} finally {
  await browser.close();
}
