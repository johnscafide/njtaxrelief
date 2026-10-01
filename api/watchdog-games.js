// Watchdog Games daily puzzles: GET /api/watchdog-games?game=sold|town-shapes&date=YYYY-MM-DD
//
// One puzzle per game per day, the same for everyone. Days roll over at
// midnight New Jersey time. Only today's and past puzzles are served, so the
// archive works but nobody can read ahead.
//
// Sold!  draws one verified arm's-length residential sale from the SR-1A
//        county files. The house number and unit are never sent; the price
//        travels lightly encoded so it is not sitting in plain sight in the
//        network panel. Bulk sales files stay blocked at the edge (NJW-37);
//        this hands out one sale per day.
// Town Shapes draws one of New Jersey's 564 municipalities from a fixed,
//        seeded order, so no town repeats until every town has had a day.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LAUNCH_DATE = '2026-10-01';
const TIME_ZONE = 'America/New_York';
const SALT = process.env.WATCHDOG_GAMES_SALT || 'watchdog-games-v1';
const COUNTIES = ['atlantic', 'bergen', 'burlington', 'camden', 'cape-may', 'cumberland', 'essex', 'gloucester', 'hudson', 'hunterdon', 'mercer', 'middlesex', 'monmouth', 'morris', 'ocean', 'passaic', 'salem', 'somerset', 'sussex', 'union', 'warren'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;

const cache = new Map();
function readJson(rel) {
  if (!cache.has(rel)) cache.set(rel, JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')));
  return cache.get(rel);
}

function todayInNewJersey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function puzzleNumber(date) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(LAUNCH_DATE + 'T00:00:00Z')) / DAY_MS) + 1;
}

function hash32(text) {
  return crypto.createHash('sha256').update(text).digest().readUInt32BE(0);
}

// Deterministic shuffle (mulberry32 seeded from the salt) so the order is
// fixed per deployment salt but not guessable from the date alone.
function seededOrder(items, seedText) {
  let seed = hash32(seedText);
  const next = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Light spoiler guard, not security: reversed digits plus a date-derived
// offset, base64 encoded. The page decodes it once the round is over.
function encodeAnswer(value, date) {
  const offset = hash32('k|' + date) % 9973;
  const text = String(value).split('').reverse().join('') + '.' + offset;
  return Buffer.from(text, 'utf8').toString('base64');
}

function townIndex() {
  const doc = readJson('property/data/games/towns.json');
  if (!doc.byCode) doc.byCode = new Map(doc.towns.map((t) => [t.c, t]));
  return doc;
}

// ---------- Sold! ----------
const UNIT_PATTERN = /(?:,|\s)\s*(?:UNIT|APT|APARTMENT|STE|SUITE|BLDG|#)\s*[\w-]*.*$/i;
function streetName(address) {
  const raw = String(address || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const unit = UNIT_PATTERN.test(raw) || /\s#\s*\w+/.test(raw);
  const street = raw
    .replace(UNIT_PATTERN, '')
    .replace(/^[0-9][0-9A-Z/-]*(?:\s+1\/2)?\s+/, '')
    .replace(/[.,]+/g, ' ')
    .replace(/[\s-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[A-Z]{2,}/.test(street) || /^(?:[0-9]|UNIT\b|APT\b|#)/.test(street)) return null;
  return { street: street.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()), unit };
}

function eligibleSale(row) {
  return row && row.c === '2'
    && row.p >= 125000 && row.p <= 3000000
    && row.sf >= 500 && row.sf <= 8000
    && row.yb >= 1800 && row.yb <= 2026
    && row.av > 0 && row.r >= 0.35 && row.r <= 1.25
    && row.ppsf >= 40 && row.ppsf <= 1500
    && row.y >= 2024 && row.m >= 1 && row.m <= 12;
}

function median(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function soldPuzzle(date) {
  const number = puzzleNumber(date);
  const order = seededOrder(COUNTIES, SALT + '|sold-counties');
  const county = order[(number - 1) % order.length];
  const file = readJson(`property/sales-${county}.json`);
  const towns = townIndex().byCode;
  const ratios = readJson('chapter123-ratios-2026.json').districts;
  const candidates = [];
  for (const row of file.sales || []) {
    if (!eligibleSale(row) || !towns.has(row.d) || !ratios[row.d]) continue;
    const street = streetName(row.a);
    if (street) candidates.push({ row, street });
  }
  if (!candidates.length) throw new Error('no eligible sale for ' + county);
  const pick = candidates[hash32(SALT + '|sold|' + date) % candidates.length];
  const { row, street } = pick;
  const town = towns.get(row.d);
  const peers = (file.sales || []).filter((s) => s.d === row.d && s.c === '2' && s.ppsf > 0);
  return {
    game: 'sold',
    date,
    number,
    home: {
      town: town.n,
      county: town.k,
      street: street.street,
      unit: street.unit,
      year_built: row.yb,
      sqft: row.sf,
      sold: MONTHS[row.m - 1] + ' ' + row.y
    },
    hints: {
      town_median_ppsf: median(peers.map((s) => s.ppsf)),
      town_sales: peers.length,
      assessed: row.av,
      town_ratio: ratios[row.d][0],
      ratio_year: readJson('chapter123-ratios-2026.json').tax_year
    },
    k: encodeAnswer(row.p, date)
  };
}

// ---------- Town Shapes ----------
function townShapesPuzzle(date) {
  const number = puzzleNumber(date);
  const doc = townIndex();
  const codes = doc.towns.map((t) => t.c).sort();
  const order = seededOrder(codes, SALT + '|town-shapes');
  const code = order[(number - 1) % order.length];
  const town = doc.byCode.get(code);
  const shapes = readJson('property/data/games/town-shapes.json');
  return {
    game: 'town-shapes',
    date,
    number,
    view_box: shapes.view_box,
    path: shapes.shapes[code],
    hints: {
      type: town.t,
      county: town.k,
      population: town.pop,
      sq_miles: town.sq,
      tax_rate: town.rate,
      rate_year: doc.rate_year,
      first_letter: town.n.replace(/^(?:City|Town|Township|Borough|Village) of /i, '').charAt(0).toUpperCase()
    },
    k: encodeAnswer(code, date)
  };
}

const GAMES = { sold: soldPuzzle, 'town-shapes': townShapesPuzzle };

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const query = req.query || {};
  const game = String(query.game || '').toLowerCase();
  const today = todayInNewJersey();
  const date = String(query.date || today);
  if (!GAMES[game]) return res.status(400).json({ error: 'Unknown game.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) {
    return res.status(400).json({ error: 'Use a date like 2026-10-01.' });
  }
  if (date < LAUNCH_DATE || date > today) {
    return res.status(404).json({ error: 'No puzzle for that day.', today, launch: LAUNCH_DATE });
  }
  try {
    const puzzle = GAMES[game](date);
    puzzle.today = today;
    res.setHeader('Cache-Control', date === today
      ? 'public, max-age=120, s-maxage=600, stale-while-revalidate=600'
      : 'public, max-age=86400, s-maxage=604800');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json(puzzle);
  } catch (error) {
    console.error('watchdog-games', game, date, error && error.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Today\'s puzzle is not available right now.' });
  }
};

module.exports._internals = { todayInNewJersey, puzzleNumber, streetName, eligibleSale, encodeAnswer, soldPuzzle, townShapesPuzzle, LAUNCH_DATE };
