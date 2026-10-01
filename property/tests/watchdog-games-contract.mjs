import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Watchdog Games (/games): daily puzzles built from public records. This
// contract runs the real puzzle function over a long stretch of days and
// checks the promises the pages make: no house numbers, no future puzzles,
// no repeats in Town Shapes, clean public URLs and the site's copy rules.
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(p, 'utf8');
const games = require('../../api/watchdog-games.js');
const { soldPuzzle, townShapesPuzzle, streetName, encodeAnswer, LAUNCH_DATE } = games._internals;
const decode = (k) => Buffer.from(k, 'base64').toString('utf8').split('.')[0].split('').reverse().join('');
const day = (n) => new Date(Date.parse(LAUNCH_DATE + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// ---------- generated data is current ----------
execFileSync('node', ['scripts/build-games-data.mjs', '--check'], { stdio: 'inherit' });
const towns = JSON.parse(read('property/data/games/towns.json')).towns;
assert.equal(towns.length, 564, 'all 564 New Jersey municipalities are playable');
assert.equal(new Set(towns.map((t) => t.c)).size, 564, 'municipality codes are unique');
assert.ok(towns.every((t) => t.lat > 38.8 && t.lat < 41.4 && t.lon > -75.6 && t.lon < -73.8), 'centroids fall inside New Jersey');

// ---------- street names never carry a house number or unit ----------
assert.deepEqual(streetName('23 LEGION DR., UNIT 202'), { street: 'Legion Dr', unit: true });
assert.deepEqual(streetName('12-14 MAIN ST'), { street: 'Main St', unit: false });
assert.equal(streetName('APT 4 10 MAIN'), null);
assert.equal(decode(encodeAnswer(415000, '2026-10-01')), '415000');
assert.equal(decode(encodeAnswer('0503', '2026-10-01')), '0503');

// ---------- a long run of real puzzles ----------
const DAYS = 120;
const shapeCodes = new Set();
for (let i = 0; i < DAYS; i++) {
  const date = day(i);
  const sold = soldPuzzle(date);
  assert.equal(sold.number, i + 1, `${date}: puzzle numbers count from launch`);
  assert.deepEqual(Object.keys(sold.home).sort(), ['county', 'sold', 'sqft', 'street', 'town', 'unit', 'year_built'], `${date}: Sold! sends only the public facts`);
  assert.ok(!/^\d/.test(sold.home.street) && !/\b(?:UNIT|APT)\b/i.test(sold.home.street), `${date}: no house number or unit in "${sold.home.street}"`);
  const price = Number(decode(sold.k));
  assert.ok(price >= 125000 && price <= 3000000, `${date}: sale price in range`);
  assert.ok(!Object.values(sold.home).concat(Object.values(sold)).includes(price), `${date}: price never travels as a plain field`);
  assert.ok(sold.hints.assessed > 0 && sold.hints.town_ratio > 0, `${date}: hints present`);

  const shape = townShapesPuzzle(date);
  const code = decode(shape.k);
  assert.ok(towns.some((t) => t.c === code), `${date}: answer is a real municipality`);
  assert.ok(!shapeCodes.has(code), `${date}: Town Shapes does not repeat a town`);
  shapeCodes.add(code);
  assert.match(shape.path, /^M[\d. LMZ]+$/, `${date}: outline is a plain SVG path`);
  assert.ok(!Object.values(shape).concat(Object.values(shape.hints)).includes(code), `${date}: answer code never travels as a plain field`);
}

// ---------- handler: today only, never the future ----------
function call(query) {
  const res = { headers: {}, statusCode: 0, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.end = () => res;
  games({ method: 'GET', query, headers: {} }, res);
  return res;
}
assert.equal(call({ game: 'sold' }).statusCode, 200, 'today\'s Sold! puzzle loads');
assert.equal(call({ game: 'town-shapes' }).statusCode, 200, 'today\'s Town Shapes puzzle loads');
assert.equal(call({ game: 'sold', date: '2099-01-01' }).statusCode, 404, 'future puzzles are never served');
assert.equal(call({ game: 'sold', date: '2026-09-30' }).statusCode, 404, 'nothing before launch');
assert.equal(call({ game: 'chess' }).statusCode, 400, 'unknown games are rejected');
assert.equal(call({ game: 'sold', date: 'tomorrow' }).statusCode, 400, 'dates are validated');

// ---------- deployment wiring ----------
const vercel = JSON.parse(read('vercel.json'));
const fn = vercel.functions['api/watchdog-games.js'];
assert.ok(fn && /property\/sales-\*\.json/.test(fn.includeFiles) && /property\/data\/games/.test(fn.includeFiles) && /chapter123-ratios-2026\.json/.test(fn.includeFiles), 'the puzzle function bundles its data');
const sitemap = read('api/watchdog-index-sitemap.js');
for (const p of ['/games', '/games/sold', '/games/town-shapes']) assert.ok(sitemap.includes(`path: '${p}'`), `sitemap lists ${p}`);

// ---------- pages and copy ----------
const pages = {
  'property/games/index.html': 'https://www.watchdogindex.com/games',
  'property/games/sold/index.html': 'https://www.watchdogindex.com/games/sold',
  'property/games/town-shapes/index.html': 'https://www.watchdogindex.com/games/town-shapes'
};
const copyFiles = Object.keys(pages).concat(['property/js/games/games-core.js', 'property/js/games/hub.js', 'property/js/games/sold.js', 'property/js/games/town-shapes.js', 'property/css/watchdog-games.css']);
for (const [file, canonical] of Object.entries(pages)) {
  const html = read(file);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${file}: canonical is the clean Watchdog URL`);
  assert.ok(!/href="\/property\/(?!css\/|js\/)/.test(html), `${file}: links never expose /property/`);
  assert.match(html, /games-core\.js/, `${file}: loads the shared games runtime`);
  assert.match(html, /<meta name="description" content="[^"]{70,}">/, `${file}: has a real description`);
}
for (const file of copyFiles) {
  const text = read(file);
  assert.ok(!/[–—]/.test(text), `${file}: no em or en dashes`);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), `${file}: no emoji`);
  assert.ok(!/ROBUST Score|Watchdog Intel\b/.test(text), `${file}: brand names are correct`);
}
assert.match(read('property/css/watchdog-games.css'), /prefers-reduced-motion/, 'games respect reduced motion');

console.log(`Watchdog games contract passed (${DAYS} days of Sold! and Town Shapes puzzles checked).`);
