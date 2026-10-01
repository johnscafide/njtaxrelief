// Builds the static data behind Watchdog Games (/games).
//
//   node scripts/build-games-data.mjs            write the files
//   node scripts/build-games-data.mjs --check    fail if the committed files are stale
//
// Outputs (both under property/data/games/):
//   towns.json        every NJ municipality: code, name, county, centroid,
//                     population, type and 2025 general tax rate. The Town
//                     Shapes guess list and distance feedback use it.
//   town-shapes.json  a simplified SVG outline per municipality code. Only the
//                     /api/watchdog-games function reads it, so the browser
//                     never downloads every outline (or tomorrow's answer).
//
// Sources: Municipal_Boundaries_of_NJ.geojson (NJOGIS, EPSG:4326) and
// property/tax-rates.json (Division of Taxation general tax rates).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'property', 'data', 'games');
const BOUNDARIES = path.join(ROOT, 'Municipal_Boundaries_of_NJ.geojson');
const TAX_RATES = path.join(ROOT, 'property', 'tax-rates.json');
const RATE_YEAR = '2025';
const VIEW = 100;
const PAD = 4;

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// tax-rates.json is keyed "NAME TYPE (COUNTY)" with Division of Taxation
// abbreviations (TWP, BORO, SO, HGHTS, RIV...). Expand the abbreviations,
// strip the type words and spaces so both files reduce to the same key.
// Toms River is still filed under its pre-2006 name, Dover Township.
const TYPE_WORDS = /\b(?:CITY|TWP|TWNSHP|TOWNSHIP|TW|BORO|BOR|BOROUGH|TOWN|VILLAGE|OF)\b/g;
const ABBREVIATIONS = [[/\bMT\b/g, 'MOUNT'], [/\bNO\b/g, 'NORTH'], [/\bSO\b/g, 'SOUTH'], [/\bE\b/g, 'EAST'], [/\bW\b/g, 'WEST'],
  [/\bPT\b/g, 'POINT'], [/\bH(?:GH)?TS\b/g, 'HEIGHTS'], [/\bHLS\b/g, 'HILLS'], [/\bRIV\b/g, 'RIVER'], [/\bCRK\b/g, 'CREEK'],
  [/\bTR\b/g, 'TROY'], [/\bALLOWAYS\b/g, 'ALLOWAY']];
const RENAMED = new Map([['TOMSRIVER|OCEAN', 'DOVER|OCEAN']]);
function bareName(name) {
  let s = String(name || '').toUpperCase().replace(/[^A-Z ]+/g, ' ');
  for (const [rx, to] of ABBREVIATIONS) s = s.replace(rx, to);
  return s.replace(TYPE_WORDS, ' ').replace(/\s+/g, '');
}

function rateIndex() {
  const rates = JSON.parse(readFileSync(TAX_RATES, 'utf8')).rates;
  const index = new Map();
  for (const [key, years] of Object.entries(rates)) {
    const m = key.match(/^(.*)\(([^)]+)\)\s*$/);
    if (!m) continue;
    const k = bareName(m[1]) + '|' + m[2].trim().toUpperCase();
    // Two towns can share a bare name in one county (Andover Boro and
    // Andover Twp). Keep both and disambiguate by type below.
    if (!index.has(k)) index.set(k, []);
    index.get(k).push({ key, rate: years[RATE_YEAR] });
  }
  index.exact = rates;
  return index;
}

function typeHint(mun) {
  const t = String(mun || '').toUpperCase();
  if (/\bTWP\b|TOWNSHIP/.test(t)) return /TWP|TWNSHP|TOWNSHIP|\bTW\b/;
  if (/BORO/.test(t)) return /BORO/;
  if (/CITY/.test(t)) return /CITY/;
  if (/VILLAGE/.test(t)) return /VILLAGE/;
  return /TOWN\b/;
}

function lookupRate(index, props) {
  const exact = index.exact[`${props.MUN} (${props.COUNTY})`];
  if (exact && exact[RATE_YEAR] != null) return exact[RATE_YEAR];
  let k = bareName(props.MUN) + '|' + String(props.COUNTY).toUpperCase();
  if (RENAMED.has(k)) k = RENAMED.get(k);
  const hits = index.get(k) || [];
  if (hits.length === 1) return hits[0].rate;
  const typed = hits.filter((h) => typeHint(props.MUN).test(h.key.replace(/\(.*$/, '')));
  return typed.length === 1 ? typed[0].rate : null;
}

// ---------- geometry ----------
function polygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}

function ringCentroid(ring) {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f;
  }
  a /= 2;
  return a ? { x: x / (6 * a), y: y / (6 * a), a: Math.abs(a) } : null;
}

function perpendicular(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicular(points[i], points[s], points[e]);
      if (d > max) { max = d; at = i; }
    }
    if (max > tolerance && at > 0) { keep[at] = 1; stack.push([s, at], [at, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

function outline(geometry) {
  const polys = polygons(geometry);
  let lat0 = 0, n = 0;
  for (const poly of polys) for (const [, lat] of poly[0]) { lat0 += lat; n++; }
  lat0 /= n || 1;
  const k = Math.cos(lat0 * Math.PI / 180);
  const project = ([lon, lat]) => [lon * k, -lat];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const projected = polys.map((poly) => poly.map((ring) => ring.map((pt) => {
    const p = project(pt);
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    return p;
  })));
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (VIEW - 2 * PAD) / span;
  const offX = PAD + ((VIEW - 2 * PAD) - (maxX - minX) * scale) / 2;
  const offY = PAD + ((VIEW - 2 * PAD) - (maxY - minY) * scale) / 2;
  const tolerance = 0.35 / scale; // about a third of a viewBox unit
  const largest = Math.max(...projected.map((poly) => Math.abs(ringArea(poly[0]))));

  const parts = [];
  for (const poly of projected) {
    // Drop slivers and specks (tiny marsh islands) that read as noise.
    if (Math.abs(ringArea(poly[0])) < largest * 0.002) continue;
    for (const ring of poly) {
      if (Math.abs(ringArea(ring)) * scale * scale < 1.5) continue;
      const pts = simplify(ring, tolerance);
      if (pts.length < 4) continue;
      parts.push('M' + pts.slice(0, -1).map(([x, y]) =>
        (Math.round(((x - minX) * scale + offX) * 10) / 10) + ' ' + (Math.round(((y - minY) * scale + offY) * 10) / 10)
      ).join('L') + 'Z');
    }
  }
  return parts.join('');
}

function centroid(geometry) {
  let best = null;
  let sx = 0, sy = 0, sa = 0;
  for (const poly of polygons(geometry)) {
    const c = ringCentroid(poly[0]);
    if (!c) continue;
    sx += c.x * c.a; sy += c.y * c.a; sa += c.a;
    if (!best || c.a > best.a) best = c;
  }
  if (!sa) return best;
  return { x: sx / sa, y: sy / sa };
}

// ---------- build ----------
const geo = JSON.parse(readFileSync(BOUNDARIES, 'utf8'));
const rates = rateIndex();
const towns = [];
const shapes = {};
const missingRates = [];

for (const feature of geo.features) {
  const p = feature.properties;
  const code = String(p.MUN_CODE);
  const c = centroid(feature.geometry);
  const rate = lookupRate(rates, p);
  if (rate == null) missingRates.push(p.MUN_LABEL + ' (' + p.COUNTY + ')');
  towns.push({
    c: code,
    n: p.MUN_LABEL,
    k: titleCase(p.COUNTY),
    t: p.MUN_TYPE,
    lat: Math.round(c.y * 1e4) / 1e4,
    lon: Math.round(c.x * 1e4) / 1e4,
    pop: p.POP2020,
    sq: Math.round(p.SQ_MILES * 100) / 100,
    rate: rate == null ? null : rate
  });
  shapes[code] = outline(feature.geometry);
}

towns.sort((a, b) => a.n.localeCompare(b.n) || a.k.localeCompare(b.k));

const townsDoc = {
  schema_version: 1,
  source: 'NJ Office of GIS municipal boundaries (2020 Census populations) and NJ Division of Taxation general tax rates',
  rate_year: Number(RATE_YEAR),
  towns
};
const shapesDoc = { schema_version: 1, view_box: `0 0 ${VIEW} ${VIEW}`, shapes };

const files = [
  [path.join(OUT_DIR, 'towns.json'), JSON.stringify(townsDoc) + '\n'],
  [path.join(OUT_DIR, 'town-shapes.json'), JSON.stringify(shapesDoc) + '\n']
];

if (process.argv.includes('--check')) {
  let stale = 0;
  for (const [file, body] of files) {
    let current = '';
    try { current = readFileSync(file, 'utf8'); } catch (_) { /* missing */ }
    if (current !== body) { console.error('stale: ' + path.relative(ROOT, file)); stale++; }
  }
  if (stale) { console.error('Run: node scripts/build-games-data.mjs'); process.exit(1); }
  console.log('Watchdog Games data is current.');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, body] of files) writeFileSync(file, body);
  const sizes = files.map(([f, b]) => path.relative(ROOT, f) + ' ' + Math.round(b.length / 1024) + ' KB').join(', ');
  console.log(`Wrote ${towns.length} towns (${sizes}).`);
  if (missingRates.length) console.log(`No ${RATE_YEAR} tax rate matched for ${missingRates.length}: ${missingRates.join('; ')}`);
}
