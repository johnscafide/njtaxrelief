// Property JSON for the Android app: GET /api/watchdog-property (session JWT).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
process.chdir(new URL('.', root).pathname);
const api = require(new URL('api/watchdog-property.js', root).pathname);

// A tiny fake Supabase (auth, PostgREST, storage, the score function).
function backend(state) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ method, path: u.pathname, search: u.search, body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} });
    const ok = (data, headers = {}) => {
      const m = new Map(Object.entries(headers));
      return { ok: true, status: 200, headers: { get: (k) => m.get(k.toLowerCase()) || null }, text: async () => (data == null ? '' : JSON.stringify(data)), json: async () => data };
    };
    if (u.pathname === '/auth/v1/user') return state.user ? ok(state.user) : { ok: false, status: 401, json: async () => ({}) };
    if (u.pathname === '/rest/v1/profiles') return ok([state.profile || {}]);
    if (u.pathname === '/rest/v1/account_entitlements') return ok(state.entitlement ? [state.entitlement] : []);
    if (u.pathname === '/rest/v1/usage_events' && method === 'GET') return ok([], { 'content-range': `0-0/${state.used || 0}` });
    if (u.pathname === '/rest/v1/usage_events') return ok(null);
    if (u.pathname === '/rest/v1/rpc/search_parcels') return ok(state.matches || []);
    if (u.pathname === '/rest/v1/property_lookups') return ok(state.coords || []);
    if (u.pathname === '/functions/v1/workbench-score') {
      // scoreStatus simulates the scorer failing (429 from its shared-IP rate limit, 500, ...).
      if (state.scoreStatus) return { ok: false, status: state.scoreStatus, json: async () => ({ error: 'rate limited' }) };
      return ok(state.scored || { rows: [] });
    }
    if (u.pathname === '/rest/v1/rpc/get_public_property_page') {
      if (state.rpcDown) return { ok: false, status: 500, json: async () => ({}) };
      return ok(state.row || null);
    }
    if (u.pathname.startsWith('/storage/v1/object/sign/property-photos/')) return ok({ signedURL: '/object/sign/property-photos/a.jpg?token=t' });
    throw new Error('unexpected ' + u.pathname);
  };
  return { calls, fetchImpl };
}
async function call(req, state) {
  const b = backend(state);
  const res = { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(x) { this.body = x; } };
  const real = global.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  global.fetch = b.fetchImpl;
  try { await api({ headers: {}, query: {}, ...req }, res); } finally { global.fetch = real; }
  return { res, body: res.body === undefined ? undefined : JSON.parse(res.body), calls: b.calls };
}

// The same Harrison fixture the property page and extension tests use, with
// the two fields that must never come back: the owner mailing ZIP and the
// private photo storage key.
const row = {
  pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN', county: 'HUDSON', zip: '07105',
  block: '9', lot: '20', qualifier: null, prop_class: '2', year_built: 1900, acres: 0.0574, dwelling_units: 2,
  building_desc: '2 SF 2 FAM', land_value: 180000, improvement_value: 244300, assessed_value: 424300, last_year_tax: 9954.08,
  last_sale_price: null, last_sale_date: null, last_sale_year: null, sale_flagged_non_market: false, source_synced_at: '2026-09-28T15:15:28Z',
  score: { score: 78, verdict: 'Favorable tax position', confidence: 'high', evidence_coverage: 85, model_version: 'ROBUST-v1', computed_at: '2026-09-01T00:00:00Z', precomputed: true,
    components: { recourse: 60, fairness: { score: 100 }, burden: 86.4, uniformity: 69, stability: null, trajectory: '45' } },
  town_compare: { peers: 1964, median_tax: 10828, median_assessed: null, share_paying_less: 39, refreshed_at: '2026-09-04T06:29:00Z' },
  neighbors: [{ pams_pin: '0904_9_1', address: '140 GRANT AVE', town: 'HARRISON TOWN', assessed_value: null, last_year_tax: 10655.53 }],
  recent_sales: [{ pams_pin: '0904_9_4', address: '134 GRANT AVE', town: 'HARRISON TOWN', price: 775000, date: '2024-08-18', year_built: 1960, assessed_value: null, same_street: true }],
  sales_summary: { count: 69, median: 700000, first_date: '2023-09-28', last_date: '2025-06-30' },
  photo_path: 'contrib/0904_9_20/a.jpg', alerts_enabled: false
};
const signedIn = { user: { id: 'u1' }, profile: { account_role: 'user', vanity_slug: null }, entitlement: null, row, coords: [{ pams_pin: '0904_9_20', lat: 40.7357, lon: -74.1724 }] };
const agent = { ...signedIn, profile: { account_role: 'user', vanity_slug: 'jane-smith' }, entitlement: { subscription_status: 'active', billing_tier: 'agent' } };
const auth = { authorization: 'Bearer tok' };

// Method, session, input, missing row.
let out = await call({ method: 'POST', headers: auth, query: { pin: '0904_9_20' } }, signedIn);
assert.equal(out.res.statusCode, 405);
assert.equal(out.res.headers.allow, 'GET, HEAD');
out = await call({ method: 'GET', headers: {}, query: { pin: '0904_9_20' } }, signedIn);
assert.equal(out.res.statusCode, 401, 'no token');
assert.deepEqual(out.body, { error: 'Sign in again.' });
assert.equal(out.calls.length, 0, 'no backend call without a token');
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, user: null });
assert.equal(out.res.statusCode, 401, 'token does not resolve to a user');
assert.deepEqual(out.body, { error: 'Sign in again.' });
assert.ok(!out.calls.some((c) => c.path !== '/auth/v1/user'), 'a rejected token reaches nothing but the session check');
out = await call({ method: 'GET', headers: { authorization: 'Bearer ' + 'a'.repeat(4001) }, query: { pin: '0904_9_20' } }, signedIn);
assert.equal(out.res.statusCode, 401, 'an over-long token is refused');
assert.deepEqual(out.body, { error: 'Sign in again.' });
assert.ok(!out.calls.some((c) => c.path === '/auth/v1/user'), 'without asking the auth service');
out = await call({ method: 'GET', headers: auth, query: { pin: "0904'; drop" } }, signedIn);
assert.equal(out.res.statusCode, 400);
assert.deepEqual(out.body, { error: 'Unknown property.' });
assert.equal(out.calls.length, 0);
out = await call({ method: 'GET', headers: auth, query: {} }, signedIn);
assert.equal(out.res.statusCode, 400, 'neither pin nor address');
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_21' } }, { ...signedIn, row: null });
assert.equal(out.res.statusCode, 404);
assert.deepEqual(out.body, { error: 'Not found on the New Jersey tax list.' });
assert.equal(out.res.headers['cache-control'], 'private, no-store');
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, rpcDown: true });
assert.equal(out.res.statusCode, 503);
assert.equal(out.res.headers['retry-after'], '60');
assert.equal(out.res.headers['cache-control'], 'no-store');
assert.equal(out.res.headers.vary, 'Authorization');
assert.ok(out.body.error);
assert.ok(out.calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events'), 'a miss the backend caused is still a counted lookup');
// The usage write itself failing is a 503 too: never a free lookup.
const usageDown = { ...signedIn };
out = await (async () => {
  const b = backend(usageDown);
  const inner = b.fetchImpl;
  b.fetchImpl = async (url, init) => {
    if (new URL(url).pathname === '/rest/v1/usage_events' && (init && init.method) === 'POST') { b.calls.push({ method: 'POST', path: '/rest/v1/usage_events' }); return { ok: false, status: 500, text: async () => '', headers: { get: () => null } }; }
    return inner(url, init);
  };
  const res = { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(x) { this.body = x; } };
  const real = global.fetch;
  global.fetch = b.fetchImpl;
  try { await api({ headers: auth, query: { pin: '0904_9_20' }, method: 'GET' }, res); } finally { global.fetch = real; }
  return { res, body: JSON.parse(res.body), calls: b.calls };
})();
assert.equal(out.res.statusCode, 503, 'usage write failed: the lookup is refused');
assert.ok(out.calls.some((c) => c.path === '/rest/v1/rpc/get_public_property_page'), 'the lookup ran alongside the write');

// Success by pin.
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, signedIn);
assert.equal(out.res.statusCode, 200);
assert.equal(out.res.headers['cache-control'], 'private, max-age=300');
assert.equal(out.res.headers['content-type'], 'application/json; charset=utf-8');
assert.equal(out.res.headers.vary, 'Authorization', 'a per-user answer is never shared across tokens');
assert.equal(out.res.headers['x-robots-tag'], 'noindex, nofollow');
assert.deepEqual(Object.keys(out.body), ['ok', 'property', 'photo_url', 'derived']);
const p = out.body.property, d = out.body.derived;
assert.deepEqual(Object.keys(p), ['pams_pin', 'address', 'town', 'county', 'block', 'lot', 'qualifier', 'prop_class', 'year_built', 'acres', 'dwelling_units', 'building_desc',
  'land_value', 'improvement_value', 'assessed_value', 'last_year_tax', 'last_sale_price', 'last_sale_date', 'last_sale_year', 'source_synced_at', 'lat', 'lon',
  'score', 'town_compare', 'neighbors', 'recent_sales', 'sales_summary', 'alerts_enabled']);
assert.deepEqual(Object.keys(d), ['display', 'bill', 'rate_trend', 'rate_change', 'chapter123', 'revalued_2026', 'holds_up', 'town_compare_text', 'next_deadline', 'price_check', 'links']);
const text = JSON.stringify(out.body);
assert.ok(!text.includes('07105') && !text.includes('"zip"'), 'never the owner mailing ZIP');
assert.ok(!text.includes('photo_path') && !text.includes('contrib/0904_9_20'), 'never the private storage key');
assert.ok(!/owner|mailing/i.test(text), 'no owner or mailing fields');
assert.ok(!text.includes('precomputed') && !text.includes('sale_flagged_non_market'), 'internal flags stay internal');
assert.equal(out.body.photo_url, 'https://example.supabase.co/storage/v1/object/sign/property-photos/a.jpg?token=t', 'signed photo link instead');
assert.equal(p.lat, 40.7357);
assert.equal(p.lon, -74.1724);
const coordsCall = out.calls.find((c) => c.path === '/rest/v1/property_lookups');
assert.equal(decodeURIComponent(coordsCall.search), '?select=pams_pin,lat,lon&pams_pin=in.("0904_9_20")', 'coordinates come from the same select the extension uses, nothing else');
assert.deepEqual(p.score.components, { recourse: 60, fairness: 100, burden: 86, uniformity: 69, stability: null, trajectory: 45 }, 'components are bare integers or null');
assert.deepEqual([p.score.score, p.score.verdict, p.score.confidence, p.score.evidence_coverage, p.score.model_version, p.score.source], [78, 'Favorable tax position', 'high', 85, 'ROBUST-v1', 'robust_public_cache']);
assert.ok(!out.calls.some((c) => c.path === '/functions/v1/workbench-score'), 'no rescoring when the cache has a score');
assert.deepEqual(p.town_compare, { peers: 1964, median_tax: 10828, median_assessed: null, share_paying_less: 39, refreshed_at: '2026-09-04T06:29:00Z' });
assert.deepEqual(p.neighbors, [{ pams_pin: '0904_9_1', address: '140 GRANT AVE', town: 'HARRISON TOWN', assessed_value: null, last_year_tax: 10655.53 }]);
assert.deepEqual(p.recent_sales, [{ pams_pin: '0904_9_4', address: '134 GRANT AVE', town: 'HARRISON TOWN', price: 775000, date: '2024-08-18', year_built: 1960, assessed_value: null, same_street: true }]);
assert.deepEqual(p.sales_summary, { count: 69, median: 700000, first_date: '2023-09-28', last_date: '2025-06-30' });
assert.equal(p.alerts_enabled, false);
assert.deepEqual(d.display, { address: '102 Grant Ave', town: 'Harrison Town', county: 'Hudson', class_label: 'Residential', property_path: '/nj/harrison-town/102-grant-ave/0904_9_20' });
assert.deepEqual(d.bill, { year: 2024, label: '2024 tax bill', current: { year: 2025, amount: 10115.31, general_rate_only: false } }, 'the state list bill is the 2024 bill for Harrison, moved to the 2025 rate');
assert.deepEqual(d.rate_trend.latest, { year: 2025, rate: 2.384 });
assert.deepEqual(d.rate_trend.first, { year: 2020, rate: 2.28 });
assert.equal(d.rate_trend.cut_at_reval, true, 'rates start after the last revaluation');
assert.deepEqual(d.rate_change, { from_year: 2020, to_year: 2025, per_year_pct: 0.9 });
assert.deepEqual(d.chapter123, { district: '0904', tax_year: 2026, ratio: 69.39, lower: 58.98, upper: 79.8 });
assert.equal(d.revalued_2026, false);
assert.deepEqual(d.holds_up, { floor: 531704, implied: 611471, limit: 79.8, ratio: 69.39 }, 'same floor the extension reports');
assert.match(d.town_compare_text, /Among 1,964 homes in Harrison Town.*lower than about 61% of them\./);
assert.match(d.next_deadline.date, /^April 1, 20\d\d$/);
assert.equal(d.next_deadline.note, 'May 1 if your town revalues that year');
assert.equal(d.price_check, null, 'no price, no price check');
assert.deepEqual(d.links, {
  property: 'https://www.watchdogindex.com/nj/harrison-town/102-grant-ave/0904_9_20',
  true_cost: 'https://www.watchdogindex.com/true-cost?pin=0904_9_20',
  checkup: 'https://www.watchdogindex.com/checkup?pin=0904_9_20'
}, 'no agent slug without an Agent plan');
assert.ok(!text.includes('/property/'), 'no /property/ paths in public links');
const use = out.calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events');
assert.equal(use.body.user_id, 'u1', 'every call is tied to the account');
assert.equal(use.body.metric_key, api.METRIC);
assert.notEqual(use.body.metric_key, 'extension_lookup', 'does not spend the extension allowance');
assert.equal(use.body.quantity, 1);
assert.ok(use.body.request_key);
const count = out.calls.find((c) => c.method === 'GET' && c.path === '/rest/v1/usage_events');
assert.match(count.search, /metric_key=eq\.app_property_lookup/);
assert.match(count.search, /occurred_at=gte\.\d{4}-\d\d-\d\dT00%3A00%3A00\.000Z/, 'counted per UTC day');
const rpc = out.calls.find((c) => c.path === '/rest/v1/rpc/get_public_property_page');
assert.deepEqual(rpc.body, { p_pin: '0904_9_20' });
const useIndex = out.calls.indexOf(use), rpcIndex = out.calls.indexOf(rpc);
assert.ok(useIndex < rpcIndex, 'usage is written before the lookup');
const planIndex = out.calls.findIndex((c) => c.path === '/rest/v1/profiles'), countIndex = out.calls.indexOf(count);
assert.ok(planIndex >= 0 && countIndex >= 0 && Math.abs(planIndex - countIndex) <= 2 && Math.max(planIndex, countIndex) < useIndex, 'the plan read and the count are issued together, before the write');
// WATCHDOG_PROPERTY_SAMPLE=1 prints the fixture's success body (for docs and the app's test fixtures).
if (process.env.WATCHDOG_PROPERTY_SAMPLE) console.log(JSON.stringify(out.body, null, 2));

// Agent plan: the slug rides on the card links.
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, agent);
assert.equal(out.body.derived.links.true_cost, 'https://www.watchdogindex.com/true-cost?pin=0904_9_20&agent=jane-smith');
assert.equal(out.body.derived.links.checkup, 'https://www.watchdogindex.com/checkup?pin=0904_9_20&agent=jane-smith');
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...agent, entitlement: { subscription_status: 'canceled', billing_tier: 'agent' } });
assert.equal(out.body.derived.links.true_cost, 'https://www.watchdogindex.com/true-cost?pin=0904_9_20', 'lapsed plan: no slug');

// Daily cap per UTC day; developer accounts are counted but not capped.
assert.equal(api.DAILY_LIMIT, 2000);
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, used: 2000 });
assert.equal(out.res.statusCode, 429);
assert.ok(Number(out.res.headers['retry-after']) > 0 && Number(out.res.headers['retry-after']) <= 86400, 'retry when the UTC day turns');
assert.ok(!out.calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events'), 'a refused call is not counted');
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, used: 1999 });
assert.equal(out.res.statusCode, 200);
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, used: 5000, profile: { account_role: 'developer' } });
assert.equal(out.res.statusCode, 200, 'developer accounts are not capped');
assert.ok(out.calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events'), 'but still counted');

// Score on demand when the cache is empty, carrying the source and parts.
const scored = { rows: [{ pams_pin: '0904_9_20', watchdog_score: 71.4, verdict: 'Fair', confidence: 'medium', evidence_coverage: 62, model_version: 'ROBUST-v1', observed_at: '2026-09-29T00:00:00Z', source: 'robust_on_demand',
  components: { recourse: { score: 55.5 }, fairness: { score: 80 }, burden: null, uniformity: { score: 70 }, stability: { score: 10 }, trajectory: { score: 40 } } }] };
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, row: { ...row, score: null }, scored });
assert.equal(out.res.statusCode, 200);
assert.deepEqual(out.body.property.score, { score: 71, verdict: 'Fair', confidence: 'medium', evidence_coverage: 62, model_version: 'ROBUST-v1', computed_at: '2026-09-29T00:00:00Z', source: 'robust_on_demand',
  components: { recourse: 56, fairness: 80, burden: null, uniformity: 70, stability: 10, trajectory: 40 } });
assert.equal(out.calls.find((c) => c.path === '/functions/v1/workbench-score').body.mode, 'public_score');
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20' } }, { ...signedIn, row: { ...row, score: null }, scored: { rows: [] } });
assert.equal(out.body.property.score, null, 'no score yet is null, not a fake zero');

// Nothing to derive: blocks are null, never invented.
out = await call({ method: 'GET', headers: auth, query: { pin: '9999_1_1' } }, { ...signedIn, coords: [], row: { pams_pin: '9999_1_1', address: '1 MAIN ST', town: 'NOWHERE', county: 'NONE', assessed_value: 100000, last_year_tax: 2000, score: null, neighbors: [], recent_sales: [], sales_summary: null, alerts_enabled: true }, scored: { rows: [] } });
assert.equal(out.res.statusCode, 200);
const e = out.body;
assert.deepEqual([e.property.lat, e.property.lon, e.property.score, e.property.town_compare, e.photo_url], [null, null, null, null, null]);
assert.deepEqual(e.property.sales_summary, { count: 0, median: null, first_date: null, last_date: null });
assert.equal(e.property.alerts_enabled, true);
assert.deepEqual(e.derived.bill, { year: null, label: 'Latest annual tax', current: null });
assert.deepEqual([e.derived.rate_trend, e.derived.rate_change, e.derived.chapter123, e.derived.holds_up, e.derived.town_compare_text], [null, null, null, null, null]);
assert.equal(e.derived.display.class_label, null);

// Address lookup (the Scan flow): same matcher and map-location tie-break as
// the extension, then the same shape, plus the price check.
const matches = [{ pams_pin: '1210_116_2', address: '102 GRANT AVE', town: 'MIDDLESEX BORO' }, { pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN' }, { pams_pin: '0904_9_99', address: '102 GRANT ST', town: 'HARRISON TOWN' }];
out = await call({ method: 'GET', headers: auth, query: { address: '102 Grant Ave, Harrison, NJ 07029', price: '$700,000' } }, { ...signedIn, matches });
assert.equal(out.res.statusCode, 200);
assert.equal(out.body.property.pams_pin, '0904_9_20');
assert.equal(out.body.confident, true);
assert.deepEqual(out.body.alternatives, []);
assert.deepEqual(Object.keys(out.body), ['ok', 'property', 'photo_url', 'derived', 'confident', 'alternatives']);
assert.deepEqual(out.body.derived.price_check, {
  verdict: 'In line for this price', expected_tax: 11580,
  text: 'Homes that sell for about $700,000 in Harrison Town usually carry a bill near $11,580 a year. This one is close to that.'
});
assert.equal(out.calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/usage_events').body.metadata.lookup, 'address');
assert.ok(!JSON.stringify(out.body).includes('07105'));
// Two towns share the street and no town is named: the listing's map location decides.
const twoTowns = { ...signedIn, matches: matches.slice(0, 2), coords: [{ pams_pin: '1210_116_2', lat: 40.5726, lon: -74.4929 }, { pams_pin: '0904_9_20', lat: 40.7357, lon: -74.1724 }] };
out = await call({ method: 'GET', headers: auth, query: { address: '102 Grant Ave NJ', lat: '40.7359', lon: '-74.1726' } }, twoTowns);
assert.equal(out.body.property.pams_pin, '0904_9_20');
assert.equal(out.body.confident, true, 'map location wins');
out = await call({ method: 'GET', headers: auth, query: { address: '102 Grant Ave NJ' } }, twoTowns);
assert.equal(out.body.confident, false, 'no location and no town: the app should ask');
assert.equal(out.body.alternatives.length, 1);
assert.deepEqual(Object.keys(out.body.alternatives[0]), ['pin', 'address', 'town']);
out = await call({ method: 'GET', headers: auth, query: { address: '7 Nowhere Rd, Harrison, NJ' } }, { ...signedIn, matches });
assert.equal(out.res.statusCode, 404);
assert.equal(out.body.error, 'Not found on the New Jersey tax list.');
assert.ok(out.body.alternatives.length > 0, 'closest listings to pick from');
out = await call({ method: 'GET', headers: auth, query: { address: 'Grant Ave, Harrison, NJ' } }, signedIn);
assert.equal(out.res.statusCode, 400, 'no house number');
assert.equal(out.calls.length, 0);
out = await call({ method: 'GET', headers: auth, query: { pin: '0904_9_20', price: '700000' } }, signedIn);
assert.equal(out.body.derived.price_check.expected_tax, 11580, 'price works with a pin too');

// HEAD: headers only.
out = await call({ method: 'HEAD', headers: auth, query: { pin: '0904_9_20' } }, signedIn);
assert.equal(out.res.statusCode, 200);
assert.equal(out.res.headers['cache-control'], 'private, max-age=300');
assert.equal(out.res.body, undefined);

// Deployment wiring: the function ships the same town files as the
// extension, the test has a script, and the script is not part of the build.
const vercel = JSON.parse(read('vercel.json'));
assert.equal(vercel.functions['api/watchdog-property.js'].includeFiles, vercel.functions['api/watchdog-extension.js'].includeFiles);
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:watchdog-property-json'], 'node property/tests/watchdog-property-json-contract.mjs');
assert.ok(!pkg.scripts['vercel-build:full'].includes('test:watchdog-property-json'));
const middleware = read('middleware.js');
assert.match(middleware, /RESERVED_ROOT_PREFIXES = \['\/api'/, '/api/* passes through the routing layer');
const source = read('api/watchdog-property.js').replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(source, /\.\.\.row\b/, 'the row is never spread into the response');
assert.doesNotMatch(source, /zip|photo_path:|owner|mailing/i, 'no owner, mailing, zip or storage-key fields in the route (comments aside)');

console.log('Watchdog property JSON contract passed.');
