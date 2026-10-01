// Nearby sales, neighborhood medians and the neighbors map used to ask the state ArcGIS
// parcel layer on every property lookup. They now read property_lookups first, where the
// monthly parcel sync stores each parcel's center point. Runs lookup.js's own functions
// with a fake database and network: a covered area is answered from the database in the
// same shape as before, and an area without points, a failed call or no client falls
// back to the state layer. Then checks the migration behind it.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('property/js/lookup.js', 'utf8');
const pick = (name) => {
  const m = src.match(new RegExp('\\n  (function ' + name + '\\([\\s\\S]*?\\n  \\})\\n'));
  assert.ok(m, `lookup.js defines ${name}`);
  return m[1];
};

function load({ rpc, layer = [], client = true } = {}) {
  const net = { layer: 0, urls: [] };
  const calls = [];
  const deps = {
    authReady: () => client,
    sb: client ? { rpc: async (fn, args) => { calls.push({ fn, args }); if (!rpc) throw new Error('no rpc'); return rpc(fn, args); } } : null,
    NJ_PARCEL: 'https://state.example/parcels',
    xfetch: async (url) => { net.layer++; net.urls.push(String(url)); return { json: async () => ({ features: layer }) }; },
    deedYear: (d) => (d ? 2000 + Number(String(d).slice(0, 2)) : null),
  };
  const names = ['warehouseNear', 'median', 'nearbySalesRaw', 'nearbySalesFromParcels', 'neighborhoodStatsRaw', 'neighborhoodStatsFromParcels', 'hoodParcels', 'hoodParcelsFromLayer'];
  const code = names.map(pick).join('\n') + '\nreturn { ' + names.join(', ') + ' };';
  const api = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { api, net, calls };
}

const thisYear = new Date().getFullYear();
const yy = String(thisYear - 2).slice(2);
const layerSale = { attributes: { PROP_LOC: '9 ELM ST', SALE_PRICE: 410000, DEED_DATE: yy + '0101', NET_VALUE: 300000, YR_CONSTR: 1950, CALC_ACRE: 0.12, MUN_NAME: 'TOWN', PAMS_PIN: '0101_1_9', COUNTY: 'C', PCLBLOCK: '1', PCLLOT: '9', LAST_YR_TX: 7000 }, centroid: { x: -74.0001, y: 40.0001 } };

// 1. Nearby sales: a covered area is answered from the database, nothing asks the state layer.
{
  const rpc = async () => ({ data: { covered: true, meters: 800, sales: [
    { address: '1 MAIN ST', town: 'TOWN', price: 500000, year: thisYear - 1, assessed: 350000, built: 1960, acres: 0.1, dist: 120 },
    { address: '2 MAIN ST', town: 'TOWN', price: 450000, year: thisYear, assessed: 300000, built: null, acres: null, dist: 300 },
  ] }, error: null });
  const { api, net, calls } = load({ rpc });
  const list = await api.nearbySalesRaw(40, -74, 800, 'TOWN');
  assert.deepEqual(calls, [{ fn: 'get_public_nearby_sales', args: { p_lat: 40, p_lon: -74, p_meters: 800, p_town: 'TOWN' } }]);
  assert.equal(net.layer, 0, 'no state-layer request');
  assert.deepEqual(list.map((x) => x.addr), ['2 MAIN ST', '1 MAIN ST'], 'newest first, as before');
  assert.deepEqual(list[1], { addr: '1 MAIN ST', price: 500000, year: thisYear - 1, assessed: 350000, built: 1960, acres: 0.1, town: 'TOWN', dist: 120 });
  assert.equal(list[0].built, 0, 'missing values keep the old zero defaults');

  // Same keys as the state-layer answer, so pickDrivers and the comps table see no difference.
  const viaLayer = await load({ layer: [layerSale] }).api.nearbySalesFromParcels(40, -74, 800, 'TOWN');
  assert.equal(viaLayer.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), Object.keys(viaLayer[0]).sort());

  // Covered but no sales: an empty list from the database (gatherComps widens the radius), no layer call.
  const empty = load({ rpc: async () => ({ data: { covered: true, meters: 800, sales: [] }, error: null }) });
  assert.deepEqual(await empty.api.nearbySalesRaw(40, -74, 800), []);
  assert.equal(empty.net.layer, 0);
  assert.equal(empty.calls[0].args.p_town, null, 'no town filter is sent as null');
}

// 2. No points in the area yet, an error, a thrown call or no client: the state layer, as before.
for (const opts of [
  { rpc: async () => ({ data: { covered: false, meters: 800, sales: [] }, error: null }) },
  { rpc: async () => ({ data: null, error: { message: 'timeout' } }) },
  { rpc: async () => { throw new Error('offline'); } },
  { rpc: async () => ({ data: null, error: null }) },
  { client: false },
]) {
  const { api, net } = load({ ...opts, layer: [layerSale] });
  const list = await api.nearbySalesRaw(40, -74, 800, 'TOWN');
  assert.equal(net.layer, 1, 'fell back to the state layer');
  assert.equal(list[0].addr, '9 ELM ST');
  assert.ok(net.urls[0].includes("MUN_NAME+%3D+%27TOWN%27") || net.urls[0].includes("MUN_NAME%20%3D%20'TOWN'") || decodeURIComponent(net.urls[0].replace(/\+/g, ' ')).includes("MUN_NAME = 'TOWN'"));
}

// 3. Neighborhood medians.
{
  const { api, net, calls } = load({ rpc: async () => ({ data: { covered: true, meters: 500, n: 400, med_assessed: 312500, med_tax: 8123.5, med_year: 1954.5, med_acres: 0.11 }, error: null }) });
  const h = await api.neighborhoodStatsRaw(40, -74, 500);
  assert.deepEqual(calls[0], { fn: 'get_public_neighborhood_stats', args: { p_lat: 40, p_lon: -74, p_meters: 500 } });
  assert.deepEqual(h, { n: 400, medAssessed: 312500, medTax: 8123.5, medYear: 1955, medAcres: 0.11 });
  assert.equal(net.layer, 0);

  const few = load({ rpc: async () => ({ data: { covered: true, meters: 500, n: 5, med_assessed: 1 }, error: null }) });
  assert.equal(await few.api.neighborhoodStatsRaw(40, -74, 500), null, 'fewer than 8 parcels: no panel, as before');
  assert.equal(few.net.layer, 0);

  const blanks = load({ rpc: async () => ({ data: { covered: true, meters: 500, n: 9, med_assessed: 250000, med_tax: null, med_year: null, med_acres: null }, error: null }) });
  assert.deepEqual(await blanks.api.neighborhoodStatsRaw(40, -74, 500), { n: 9, medAssessed: 250000, medTax: null, medYear: null, medAcres: null });

  const layerHood = Array.from({ length: 10 }, () => ({ attributes: { NET_VALUE: 300000, LAST_YR_TX: 7000, YR_CONSTR: 1950, CALC_ACRE: 0.2 } }));
  const fallback = load({ rpc: async () => ({ data: { covered: false, meters: 500, n: 0 }, error: null }), layer: layerHood });
  const viaLayer = await fallback.api.neighborhoodStatsRaw(40, -74, 500);
  assert.equal(fallback.net.layer, 1);
  assert.deepEqual(Object.keys(viaLayer).sort(), Object.keys(h).sort(), 'same keys either way');
}

// 4. Neighbors map.
{
  const { api, net, calls } = load({ rpc: async () => ({ data: { covered: true, meters: 420, parcels: [
    { pin: '0101_1_2', address: '3 OAK AVE', town: 'TOWN', county: 'C', block: '1', lot: '2', assessed: 200000, tax: 5000, built: 1970, acres: 0.2, sale: 0, sale_year: null, lat: 40.0002, lon: -74.0003, dist: 35 },
  ] }, error: null }) });
  const list = await api.hoodParcels(40, -74, 420);
  assert.deepEqual(calls[0], { fn: 'get_public_neighbor_parcels', args: { p_lat: 40, p_lon: -74, p_meters: 420 } });
  assert.equal(net.layer, 0);
  assert.deepEqual(list[0], { pin: '0101_1_2', addr: '3 OAK AVE', town: 'TOWN', county: 'C', zip: '', block: '1', lot: '2', assessed: 200000, tax: 5000, built: 1970, acres: 0.2, sale: 0, saleYear: null, lat: 40.0002, lon: -74.0003, dist: 35, rate: 2.5 });
  const viaLayer = await load({ layer: [layerSale] }).api.hoodParcelsFromLayer(40, -74, 420);
  assert.equal(viaLayer.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), Object.keys(viaLayer[0]).sort(), 'same keys either way');

  for (const data of [{ covered: false, meters: 420, parcels: [] }, { covered: true, meters: 420, parcels: [] }]) {
    const f = load({ rpc: async () => ({ data, error: null }), layer: [layerSale] });
    assert.equal((await f.api.hoodParcels(40, -74, 420))[0].addr, '9 ELM ST');
    assert.equal(f.net.layer, 1, 'no neighbors from the database: the state layer');
  }
}

// 5. The migration: points written by the sync only, one partial point index, bounded public lookups.
{
  const sql = fs.readFileSync('supabase/migrations/20261001230000_parcel_coordinates.sql', 'utf8');
  const low = sql.toLowerCase();
  assert.match(sql, /create index if not exists property_lookups_class2_point_idx\s+on public\.property_lookups using gist \(point\(lon, lat\)\)\s+where prop_class = '2' and lat is not null and lon is not null;/);
  assert.match(sql, /create index if not exists property_lookups_class2_sale_point_idx\s+on public\.property_lookups using gist \(point\(lon, lat\)\)\s+where prop_class = '2' and lat is not null and lon is not null\s+and last_sale_price > 50000 and last_sale_year >= 2019;/);
  const sales = sql.slice(sql.indexOf('create or replace function public.get_public_nearby_sales'));
  assert.match(sales, /and p\.last_sale_price > 50000\s+and p\.last_sale_year >= 2019\b/, 'the sales query repeats the recent-sales index predicate so the planner can use it');
  assert.ok(!/^\s*update public\.property_lookups/m.test(low), 'no bulk UPDATE: the points arrive through the parcel sync');
  assert.ok(!/owner_name|st_address/.test(low), 'no owner columns');

  const sync = sql.slice(sql.indexOf('create or replace function public.sync_parcel_batch'), sql.indexOf('revoke all on function public.sync_parcel_batch'));
  assert.match(sync, /sales_code text,\s*lat double precision, lon double precision\s*\)/, 'takes lat/lon');
  assert.match(sync, /case when lat between 38\.8 and 41\.4 and lon between -75\.7 and -73\.8 then lat end as lat/, 'out-of-state points are dropped');
  assert.equal((sync.match(/p\.sales_code,\s*p\.lat, p\.lon\s*\) is distinct from \(/g) || []).length, 2, 'both skip-unchanged guards compare the point');
  assert.match(sync, /i\.sales_code,\s*coalesce\(i\.lat, p\.lat\), coalesce\(i\.lon, p\.lon\)\s*\)/);
  assert.match(sync, /excluded\.sales_code,\s*coalesce\(excluded\.lat, p\.lat\), coalesce\(excluded\.lon, p\.lon\)\s*\)/);
  assert.match(sync, /lat = coalesce\(excluded\.lat, p\.lat\),\s*lon = coalesce\(excluded\.lon, p\.lon\),/, 'a blank point keeps the stored one');
  assert.match(sync, /security definer\s+set search_path = public, pg_temp/);
  assert.ok(!/\bzip\b/.test(sync.toLowerCase()) && !sync.includes('lookup_count = ') && !sync.includes('history = '));
  assert.match(sql, /revoke all on function public\.sync_parcel_batch\(jsonb\) from public, anon, authenticated;\s*grant execute on function public\.sync_parcel_batch\(jsonb\) to service_role;/);

  const fns = {
    get_public_nearby_sales: { sig: 'double precision, double precision, integer, text', limit: 400, cap: 3000 },
    get_public_neighborhood_stats: { sig: 'double precision, double precision, integer', limit: 400, cap: 1000 },
    get_public_neighbor_parcels: { sig: 'double precision, double precision, integer', limit: 24, cap: 500 },
  };
  for (const [name, { sig, limit, cap }] of Object.entries(fns)) {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    assert.ok(start > 0, name);
    const body = sql.slice(start, sql.indexOf('$$;', start));
    assert.match(body, /stable\s+security definer\s+set search_path to 'public', 'pg_temp'/, `${name}: security definer, pinned search_path`);
    assert.match(body, new RegExp(`least\\(greatest\\(coalesce\\(p_meters, \\d+\\), 100\\), ${cap}\\)`), `${name}: radius capped at ${cap} m`);
    assert.match(body, /not \(p_lat between 38\.8 and 41\.4\) or not \(p_lon between -75\.7 and -73\.8\)/, `${name}: New Jersey only`);
    assert.match(body, new RegExp(`limit ${limit}\\b`), `${name}: at most ${limit} rows`);
    assert.match(body, /p\.prop_class = '2' and p\.lat is not null and p\.lon is not null and point\(p\.lon, p\.lat\) <@ v_box/, `${name}: matches the partial index`);
    assert.match(body, /order by point\(p\.lon, p\.lat\) <-> point\(p_lon, p_lat\)/, `${name}: nearest first`);
    assert.match(body, /'covered'/, `${name}: says whether the area has points`);
    assert.ok(!/lookup_count|history|effective_rate|first_seen|last_seen|source_synced_at/.test(body), `${name}: parcel facts only`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(${sig}\\) from public;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(${sig}\\) to anon, authenticated, service_role;`));
  }
}

console.log('Parcel coordinates contract passed.');
