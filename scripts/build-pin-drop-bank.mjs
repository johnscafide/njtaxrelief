// Builds the Pin Drop puzzle bank: real New Jersey home sales with a map spot.
//
//   NODE_USE_ENV_PROXY=1 node scripts/build-pin-drop-bank.mjs   query the state parcel map and write the bank
//   node scripts/build-pin-drop-bank.mjs --check                 validate the committed bank (no network)
//
// Each entry is one verified arm's-length single-family sale from the SR-1A
// county files (property/sales-*.json). Its map spot is the centroid of the
// matching parcel in the NJ parcel composite (NJOGIS), looked up by PAMS PIN
// and kept only when the parcel's street address matches the sale. The game
// shows property lines at street level and scores an exact pick, so each
// entry keeps its parcel PIN and centroid. House numbers are never stored or
// shown; players find the parcel on the map.
//
// Output: property/data/games/private/pin-drop.json. Only the
// /api/watchdog-games function reads it; middleware.js keeps the private
// folder off the public web so nobody can read ahead.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { streetName, eligibleSale } = require('../api/watchdog-games.js')._internals;

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'property', 'data', 'games', 'private', 'pin-drop.json');
const PARCELS = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';
const COUNTIES = ['atlantic', 'bergen', 'burlington', 'camden', 'cape-may', 'cumberland', 'essex', 'gloucester', 'hudson', 'hunterdon', 'mercer', 'middlesex', 'monmouth', 'morris', 'ocean', 'passaic', 'salem', 'somerset', 'sussex', 'union', 'warren'];
const PER_COUNTY = 26;
const TRY_PER_COUNTY = 160;
const BATCH = 30;

const towns = new Map(JSON.parse(readFileSync(path.join(ROOT, 'property/data/games/towns.json'), 'utf8')).towns.map((t) => [t.c, t]));

function check() {
  const doc = JSON.parse(readFileSync(OUT, 'utf8'));
  const homes = doc.homes || [];
  const fail = (m) => { console.error('pin-drop bank: ' + m); process.exit(1); };
  if (homes.length < 365) fail(`only ${homes.length} homes; keep at least a year of puzzles`);
  const keys = new Set();
  for (const h of homes) {
    if (!towns.has(h.d)) fail(`unknown district ${h.d}`);
    if (!(h.lat > 38.9 && h.lat < 41.36 && h.lon > -75.57 && h.lon < -73.88)) fail(`spot outside New Jersey: ${JSON.stringify(h)}`);
    if (!/^\d{4}_[\d.]+_[\d.]+$/.test(h.pin) || !h.pin.startsWith(h.d + '_')) fail(`bad parcel PIN ${h.pin}`);
    const t = towns.get(h.d);
    if (miles(h, t) > 2 + 1.5 * Math.sqrt(t.sq)) fail(`spot is too far from ${t.n}: ${h.pin}`);
    if (!h.s || /^\d/.test(h.s) || /\b(?:UNIT|APT)\b/i.test(h.s)) fail(`street carries a number or unit: ${h.s}`);
    if (!(h.p >= 125000 && h.p <= 3000000 && h.av > 0 && h.sf > 0 && h.yb > 1700)) fail(`bad sale facts: ${JSON.stringify(h)}`);
    if (keys.has(h.pin)) fail(`the same property appears twice: ${h.pin}`);
    keys.add(h.pin);
  }
  const counties = new Set(homes.map((h) => towns.get(h.d).k));
  if (counties.size !== 21) fail(`homes cover ${counties.size} of 21 counties`);
  console.log(`Pin Drop bank is valid (${homes.length} homes in all 21 counties).`);
}

// Deterministic pick order per county so a rebuild prefers the same sales.
function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function miles(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
const stripZeros = (s) => String(s).replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const pin = (row) => `${row.d}_${stripZeros(row.b)}_${stripZeros(row.l)}`;
const norm = (a) => String(a || '').toUpperCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
function sameAddress(sale, parcel) {
  const a = norm(sale).split(' '), b = norm(parcel).split(' ');
  return a[0] === b[0] && a[1] && a[1] === b[1];
}

async function lookup(pins) {
  const params = new URLSearchParams({
    where: `PAMS_PIN IN ('${pins.join("','")}')`,
    outFields: 'PAMS_PIN,PROP_LOC',
    returnCentroid: 'true',
    returnGeometry: 'false',
    outSR: '4326',
    f: 'json'
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(PARCELS, { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return new Map((json.features || []).filter((f) => f.centroid).map((f) => [f.attributes.PAMS_PIN, f]));
    } catch (error) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      if (attempt === 3) throw error;
    }
  }
  return new Map();
}

async function build() {
  const homes = [];
  const seen = new Set(); // a property that sold twice is used once
  for (const county of COUNTIES) {
    const sales = JSON.parse(readFileSync(path.join(ROOT, `property/sales-${county}.json`), 'utf8')).sales || [];
    const pool = sales
      .filter((row) => eligibleSale(row) && !row.q && towns.has(row.d))
      .map((row) => ({ row, street: streetName(row.a) }))
      .filter((x) => x.street && !x.street.unit)
      .sort((x, y) => hash(pin(x.row) + x.row.p) - hash(pin(y.row) + y.row.p))
      .slice(0, TRY_PER_COUNTY);
    const kept = [];
    for (let i = 0; i < pool.length && kept.length < PER_COUNTY; i += BATCH) {
      const chunk = pool.slice(i, i + BATCH);
      const found = await lookup(chunk.map((x) => pin(x.row)));
      for (const { row, street } of chunk) {
        const f = found.get(pin(row));
        if (!f || seen.has(pin(row)) || !sameAddress(row.a, f.attributes.PROP_LOC) || kept.length >= PER_COUNTY) continue;
        seen.add(pin(row));
        kept.push({
          d: row.d, pin: pin(row), s: street.street, p: row.p, y: row.y, m: row.m, sf: row.sf, yb: row.yb, av: row.av,
          lat: Math.round(f.centroid.y * 1e5) / 1e5, lon: Math.round(f.centroid.x * 1e5) / 1e5
        });
      }
    }
    console.log(`${county}: ${kept.length} homes`);
    homes.push(...kept);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  const doc = {
    schema_version: 1,
    generated_at: new Date().toISOString().slice(0, 10),
    source: "NJ Division of Taxation SR-1A verified arm's-length sales; parcel PINs and centroids from the NJOGIS parcel composite",
    homes
  };
  writeFileSync(OUT, JSON.stringify(doc, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(`Wrote ${homes.length} Pin Drop homes.`);
}

if (process.argv.includes('--check')) check();
else build().then(check);
