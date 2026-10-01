// The property lookup asks the state ArcGIS parcel server for nearby sales and
// neighborhood stats on every lookup, and pulled 900 parcels to measure a town's tax
// rate for Trade Up. Runs lookup.js's own functions with fake storage, database and
// network: nearby answers survive a reload for a day (empty answers never stored, at
// most 20 kept), and the Trade Up rate comes from the monthly town stats first, with
// the state-server measurement as the fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('property/js/lookup.js', 'utf8');
const pick = (name) => {
  const m = src.match(new RegExp('\\n  (function ' + name + '\\([\\s\\S]*?\\n  \\})\\n'));
  assert.ok(m, `lookup.js defines ${name}`);
  return m[1];
};
const constLine = (name) => {
  const m = src.match(new RegExp('\\n  (var ' + name + '\\b[^\\n]*;)'));
  assert.ok(m, `lookup.js declares ${name}`);
  return m[1];
};

function load({ rpc, parcelFeatures = [] } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const net = { parcel: 0 };
  const deps = {
    localStorage,
    authReady: () => true,
    sb: { rpc: rpc || (async () => ({ data: [], error: null })) },
    officialRatio: () => ({ ratio: 0.8 }),
    NJ_PARCEL: 'https://state.example/parcels',
    xfetch: async (url) => { net.parcel += String(url).startsWith('https://state.example/parcels') ? 1 : 0; return { json: async () => ({ features: parcelFeatures }) }; },
    townRateCache: {},
  };
  const code = [
    'var reqCache = {};',
    constLine('PERSIST_PREFIX'),
    pick('cached'), pick('persisted'), pick('median'),
    pick('townTaxRateFromWarehouse'), pick('townEffectiveRate'), pick('townEffectiveRateFromParcels'),
    'return { persisted, townEffectiveRate, reset: function () { reqCache = {}; } };',
  ].join('\n');
  const names = Object.keys(deps);
  const api = new Function(...names, code)(...names.map((n) => deps[n]));
  return { api, store, net, deps };
}

// 1. A nearby answer survives a reload; an empty answer is retried and never stored.
{
  const { api, store } = load();
  let calls = 0;
  const fetchSales = () => { calls++; return Promise.resolve([{ addr: '1 MAIN ST', price: 400000 }]); };
  await api.persisted('sales800|40.000,-74.000', 864e5, fetchSales);
  api.reset(); // page reload: in-memory cache gone, localStorage kept
  const again = await api.persisted('sales800|40.000,-74.000', 864e5, fetchSales);
  assert.equal(calls, 1, 'second look after a reload is served from localStorage');
  assert.equal(again[0].addr, '1 MAIN ST');
  let emptyCalls = 0;
  await api.persisted('hood500|40.000,-74.000', 864e5, () => { emptyCalls++; return Promise.resolve(null); });
  await api.persisted('hood500|40.000,-74.000', 864e5, () => { emptyCalls++; return Promise.resolve(null); });
  assert.equal(emptyCalls, 2, 'a failed answer is asked again');
  assert.equal(store.has('pl_px_hood500|40.000,-74.000'), false, 'and never stored');
  for (let i = 0; i < 25; i++) await api.persisted('k' + i, 864e5, () => Promise.resolve([i]));
  const kept = [...store.keys()].filter((k) => k.startsWith('pl_px_') && k !== 'pl_px_index');
  assert.equal(kept.length, 20, 'at most 20 answers kept');
  assert.ok(!store.has('pl_px_sales800|40.000,-74.000') && store.has('pl_px_k24'), 'oldest evicted first');
}

// 2. An expired stored answer is fetched again.
{
  const { api, store } = load();
  store.set('pl_px_old', JSON.stringify({ t: Date.now() - 2 * 864e5, v: [1] }));
  let calls = 0;
  await api.persisted('old', 864e5, () => { calls++; return Promise.resolve([2]); });
  assert.equal(calls, 1);
}

// 3. Trade Up reads the town stats first and never touches the state server when they answer.
{
  let asked = null;
  const { api, net } = load({ rpc: async (fn, args) => { asked = { fn, args }; return { data: [{ rate_peers: 5000, median_tax_rate: 0.02 }], error: null }; } });
  const r = await api.townEffectiveRate('HOBOKEN CITY', 'HUDSON');
  assert.deepEqual(asked, { fn: 'get_public_town_tax_rate', args: { p_town: 'HOBOKEN CITY', p_county: 'HUDSON' } });
  assert.equal(r.source, 'town_stats');
  assert.ok(Math.abs(r.rate - 0.016) < 1e-12, 'effective rate = median(tax/assessed) x town ratio');
  assert.equal(r.n, 5000);
  assert.equal(net.parcel, 0, 'no state-server pull');
}

// 4. Without town stats (error, empty, or too few parcels) it measures from the state server as before.
for (const rpc of [async () => ({ data: null, error: { message: 'x' } }), async () => ({ data: [], error: null }), async () => ({ data: [{ rate_peers: 5, median_tax_rate: 0.02 }], error: null }), async () => { throw new Error('offline'); }]) {
  const features = Array.from({ length: 30 }, () => ({ attributes: { NET_VALUE: 400000, LAST_YR_TX: 8000 } }));
  const { api, net } = load({ rpc, parcelFeatures: features });
  const r = await api.townEffectiveRate('TOWN', 'COUNTY');
  assert.equal(net.parcel, 1, 'fell back to the state parcel layer');
  assert.ok(Math.abs(r.rate - 0.016) < 1e-12);
  assert.equal(r.source, undefined);
}

// 5. The town stats function is public, read-only and aggregate-only.
{
  const sql = fs.readFileSync('supabase/migrations/20261001210000_town_median_tax_rate.sql', 'utf8');
  assert.match(sql, /add column if not exists median_tax_rate numeric/);
  assert.match(sql, /percentile_cont\(0\.5\) within group \(order by t\.last_year_tax \/ nullif\(t\.assessed_value, 0\)\)\s*filter \(where t\.assessed_value > 10000 and t\.last_year_tax > 100\)/, 'same filters as the browser measurement');
  const fn = sql.slice(sql.indexOf('create or replace function public.get_public_town_tax_rate'));
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path to 'public', 'pg_temp'/);
  assert.match(fn, /returns table\(town text, county text, rate_peers integer, median_tax_rate numeric, refreshed_at timestamptz\)/, 'aggregates only, no parcel rows');
  assert.match(fn, /limit 1;/);
  assert.match(sql, /revoke all on function public\.get_public_town_tax_rate\(text, text\) from public;/);
  assert.match(sql, /grant execute on function public\.get_public_town_tax_rate\(text, text\) to anon, authenticated, service_role;/);
  assert.match(sql, /revoke all on function public\.refresh_public_town_class_stats\(\) from public, anon, authenticated;/, 'the refresh stays service-only');
}

console.log('Property lookup warehouse contract passed.');
