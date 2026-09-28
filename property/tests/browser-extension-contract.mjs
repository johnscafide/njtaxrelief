// Watchdog browser extension: key API, lookup API and the extension package.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
process.chdir(new URL('.', root).pathname);
const ext = require(new URL('api/watchdog-extension.js', root).pathname);
const manifest = JSON.parse(read('extension/manifest.json'));
const content = read('extension/content.js');
const background = read('extension/background.js');
const popup = read('extension/popup.js');
const desk = read('property/agent-desk/index.html');
const keyJs = read('property/js/agent-extension-key.js');

// Address parsing from listing titles.
assert.deepEqual(ext.parseAddress('102 Grant Ave, Harrison, NJ 07029'), { street: '102 Grant Ave', city: 'Harrison', query: '102 Grant Ave, Harrison, NJ' });
assert.equal(ext.parseAddress('12-14 Main St Unit 2, Red Bank, New Jersey').city, 'Red Bank');
assert.equal(ext.parseAddress('Grant Ave, Harrison, NJ'), null, 'needs a house number');
assert.deepEqual(ext.parseAddress('308 N 2nd St Harrison NJ 07029'), { street: '308 N 2nd St Harrison', city: '', query: '308 N 2nd St Harrison NJ 07029' });

// Street spellings the tax list uses: ordinals, directions, units.
const v = ext.streetVariants('308 N 2nd St');
assert.ok(v.includes('308 N 2ND ST') && v.includes('308 N SECOND ST') && v.includes('308 NORTH 2ND ST'), v.join(' | '));
assert.ok(ext.streetVariants('12 Main St Unit 2').includes('12 MAIN ST'), 'unit stripped');
assert.ok(ext.streetVariants('5 First Ave').includes('5 1ST AVE'));
assert.ok(ext.streetVariants('1 A B C D E F G').length <= 6);
assert.equal(ext.normStreet('102 Grant Avenue'), '102 GRANT AVE');

// Only an exact street counts. Map location, then town, then a single statewide match.
const c = (pin, address, town, exact = true, cityHint = '') => ({ row: { pams_pin: pin, address, town }, exact, cityHint });
assert.equal(ext.pickMatch([c('a', '308 2ND ST', 'HARRISON TOWN', false)], 'Harrison'), null, 'wrong street is not a match');
let pick = ext.pickMatch([c('m', '308 N 2ND ST', 'MIDDLE TWP'), c('h', '308 N 2ND ST', 'HARRISON TOWN')], 'Harrison');
assert.deepEqual([pick.row.pams_pin, pick.confident], ['h', true], 'right town wins over another town with the same street');
pick = ext.pickMatch([c('g', '9 OAK LN', 'GLOUCESTER TWP')], 'Sicklerville');
assert.deepEqual([pick.row.pams_pin, pick.confident], ['g', true], 'postal town may differ');
pick = ext.pickMatch([c('x', '9 OAK LN', 'CAMDEN CITY'), c('y', '9 OAK LN', 'NEWARK CITY')], 'Sicklerville');
assert.equal(pick.confident, false, 'two towns, no way to tell: agent picks');
pick = ext.pickMatch([c('x', '9 OAK LN', 'CAMDEN CITY'), c('y', '9 OAK LN', 'NEWARK CITY')], 'Sicklerville', { lat: 40.7357, lon: -74.1724 }, { x: { lat: 39.94, lon: -75.12 }, y: { lat: 40.7359, lon: -74.1726 } });
assert.deepEqual([pick.row.pams_pin, pick.confident], ['y', true], 'map location wins');
pick = ext.pickMatch([c('h', '102 GRANT AVE', 'HARRISON TOWN', true, 'HARRISON'), c('m', '102 GRANT AVE', 'MIDDLESEX BORO')], '');
assert.equal(pick.row.pams_pin, 'h', 'URL addresses carry the town after the street');

// A tiny fake PostgREST + auth backend.
function backend(state) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ method, path: u.pathname, search: u.search, body: init.body ? JSON.parse(init.body) : null });
    const ok = (data, headers = {}) => ({ ok: true, status: 200, headers: new Map(Object.entries(headers)), text: async () => (data == null ? '' : JSON.stringify(data)), json: async () => data });
    if (u.pathname === '/auth/v1/user') return state.user ? ok(state.user) : { ok: false, status: 401, json: async () => ({}) };
    if (u.pathname === '/rest/v1/profiles') return ok([state.profile || {}]);
    if (u.pathname === '/rest/v1/account_entitlements') return ok(state.entitlement ? [state.entitlement] : []);
    if (u.pathname === '/rest/v1/integration_api_keys' && method === 'GET') return ok(state.keyRow ? [state.keyRow] : []);
    if (u.pathname === '/rest/v1/integration_api_keys') return ok(null);
    if (u.pathname === '/rest/v1/usage_events' && method === 'GET') return ok([], { 'content-range': `0-0/${state.used || 0}` });
    if (u.pathname === '/rest/v1/usage_events') return ok(null);
    if (u.pathname === '/rest/v1/rpc/search_parcels') return ok(state.matches || []);
    if (u.pathname === '/rest/v1/property_lookups') return ok(state.coords || []);
    if (u.pathname === '/functions/v1/workbench-score') return ok(state.scored || { rows: [] });
    if (u.pathname === '/rest/v1/rpc/get_public_property_page') return ok(state.row || null);
    throw new Error('unexpected ' + u.pathname);
  };
  fetchImpl.headers = { get: () => null };
  return { calls, fetchImpl };
}
async function call(req, state) {
  const b = backend(state);
  const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(x) { this.body = x; } };
  const real = global.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  global.fetch = async (url, init) => {
    const r = await b.fetchImpl(url, init);
    if (r.headers instanceof Map) { const m = r.headers; r.headers = { get: (k) => m.get(k.toLowerCase()) || null }; }
    return r;
  };
  await ext({ headers: {}, query: {}, ...req }, res);
  global.fetch = real;
  return { res, body: JSON.parse(res.body), calls: b.calls };
}
const agent = { user: { id: 'u1' }, profile: { account_role: 'user', vanity_slug: 'jane-smith' }, entitlement: { subscription_status: 'active', billing_tier: 'agent' } };

// Create key: signed in + Agent plan; old key revoked first; only the hash is stored.
let out = await call({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'create_key' } }, agent);
assert.equal(out.res.statusCode, 200);
assert.match(out.body.key, /^wdg_ext_[0-9a-f]{48}$/);
const revoke = out.calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/integration_api_keys');
assert.match(revoke.search, /provider=eq\.browser_extension/);
const insert = out.calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/integration_api_keys');
assert.equal(insert.body.key_hash, crypto.createHash('sha256').update(out.body.key).digest('hex'));
assert.equal(insert.body.provider, 'browser_extension');
assert.deepEqual(insert.body.scopes, ['extension.property.read']);
assert.ok(!JSON.stringify(insert.body).includes(out.body.key), 'the raw key is never stored');
out = await call({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'create_key' } }, { ...agent, entitlement: { subscription_status: 'canceled', billing_tier: 'agent' } });
assert.equal(out.res.statusCode, 403, 'no key without an active Agent plan');
out = await call({ method: 'POST', headers: {}, body: { action: 'create_key' } }, { ...agent, user: null });
assert.equal(out.res.statusCode, 401);

// Lookup.
const key = 'wdg_ext_' + 'ab'.repeat(24);
const row = { pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN', county: 'HUDSON', zip: '07105', assessed_value: 424300, last_year_tax: 9954.08, score: { score: 65 }, town_compare: { peers: 1964, median_tax: 10828, share_paying_less: 39 } };
const lookupState = { ...agent, keyRow: { id: 'k1', user_id: 'u1' }, matches: [{ pams_pin: '1210_116_2', address: '102 GRANT AVE', town: 'MIDDLESEX BORO' }, { pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN' }, { pams_pin: '0904_9_99', address: '102 GRANT ST', town: 'HARRISON TOWN' }], row };
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { address: '102 Grant Ave, Harrison, NJ 07029' } }, lookupState);
assert.equal(out.res.statusCode, 200);
assert.equal(out.body.property.pin, '0904_9_20');
assert.equal(out.body.confident, true);
assert.deepEqual(out.body.alternatives, []);
assert.equal(out.body.property.score, 65);
assert.ok(!out.calls.some((c) => c.path === '/functions/v1/workbench-score'), 'no rescoring when a score exists');
assert.equal(out.body.property.tax, 9954.08);
assert.equal(out.body.property.tax_year, 2024, 'the state list bill is a 2024 bill for Harrison');
assert.equal(out.body.property.tax_current.year, 2025);
assert.equal(out.body.property.assessment_floor, 531704);
assert.equal(out.body.property.links.true_cost, 'https://www.watchdogindex.com/true-cost?pin=0904_9_20&agent=jane-smith');
assert.ok(!JSON.stringify(out.body).includes('07105'), 'never returns the owner mailing ZIP');
assert.equal(out.res.headers['cache-control'], 'private, no-store');
assert.ok(out.calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events'), 'every lookup is counted');
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { address: '102 Grant Ave, Harrison, NJ' } }, { ...lookupState, used: ext.DAILY_LIMIT });
assert.equal(out.res.statusCode, 429, 'daily cap');
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { address: '102 Grant Ave, Harrison, NJ' } }, { ...lookupState, used: ext.DAILY_LIMIT, profile: { account_role: 'developer' } });
assert.equal(out.res.statusCode, 200, 'developer accounts are not capped');
assert.ok(out.calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events'), 'but still counted');
// Pin lookup (from the "pick one" list) skips the search.
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { pin: '0904_9_20' } }, lookupState);
assert.equal(out.res.statusCode, 200);
assert.ok(!out.calls.some((c) => c.path === '/rest/v1/rpc/search_parcels'));
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { pin: "0904'; drop" } }, lookupState);
assert.equal(out.res.statusCode, 400);
assert.equal(out.calls.length, 0);
// No exact street: 404 with the closest listings to pick from.
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { address: '7 Nowhere Rd, Harrison, NJ' } }, lookupState);
assert.equal(out.res.statusCode, 404);
assert.ok(out.body.alternatives.length > 0);
// Score on demand when the property has none yet.
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { pin: '0904_9_20' } }, { ...lookupState, row: { ...row, score: null }, scored: { rows: [{ pams_pin: '0904_9_20', watchdog_score: 71.4, verdict: 'Fair' }] } });
assert.equal(out.body.property.score, 71);
const scoreCall = out.calls.find((c) => c.path === '/functions/v1/workbench-score');
assert.equal(scoreCall.body.mode, 'public_score');
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { address: '102 Grant Ave, Harrison, NJ' } }, { ...lookupState, keyRow: null });
assert.equal(out.res.statusCode, 401);
out = await call({ method: 'GET', headers: { 'x-watchdog-key': 'wdg_zap_' + 'ab'.repeat(24) }, query: { address: '102 Grant Ave, Harrison, NJ' } }, lookupState);
assert.equal(out.res.statusCode, 401, 'Zapier keys do not work here');
assert.equal(out.calls.length, 0);
out = await call({ method: 'GET', headers: { 'x-watchdog-key': key }, query: { address: '102 Grant Ave, Harrison, NJ' } }, { ...lookupState, entitlement: null });
assert.equal(out.res.statusCode, 403);

// Extension package: least privilege, Watchdog is the only network host, key only in local storage.
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.host_permissions, ['https://www.watchdogindex.com/*']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.zillow.com/*', 'https://www.realtor.com/*', 'https://www.redfin.com/*']);
for (const size of ['16', '32', '48', '128']) assert.ok(readdirSync('extension/icons').includes(`icon-${size}.png`));
assert.match(background, /const API = 'https:\/\/www\.watchdogindex\.com\/api\/watchdog-extension'/);
assert.equal((background.match(/fetch\(/g) || []).length, 1, 'one network call');
assert.doesNotMatch(content, /fetch\(|XMLHttpRequest|innerHTML|document\.cookie|localStorage/, 'content script only reads the address and draws with textContent');
assert.match(content, /attachShadow\(\{ mode: 'closed' \}\)/);
assert.match(popup, /chrome\.storage\.local\.set\(\{ key \}\)/);

// Agent Desk key card.
assert.match(desk, /<section id="ad-extension"/);
assert.match(desk, /<script src="\/property\/js\/agent-extension-key\.js/);
assert.match(keyJs, /fetch\('\/api\/watchdog-extension',\{method:'POST'/);
assert.match(keyJs, /Authorization:'Bearer '\+token/);

assert.match(JSON.parse(read('vercel.json')).functions['api/watchdog-extension.js'].includeFiles, /chapter123-ratios-2026\.json/);

console.log('Browser extension contract passed.');
