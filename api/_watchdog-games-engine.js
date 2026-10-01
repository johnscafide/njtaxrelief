// Watchdog Games puzzle engine: one puzzle per game per day, the same for
// everyone, plus the scoring the leaderboard uses. /api/watchdog-games serves
// the puzzles and /api/watchdog-games-board records scores; both use this
// module so a score is always checked against the exact puzzle that was played.
//
// Days roll over at midnight New Jersey time. Answers travel lightly encoded
// (a spoiler guard so they are not sitting in plain sight in the network
// panel, not security). Bulk sales files stay blocked at the edge (NJW-37);
// each game hands out only the few records it needs for the day.
//
// Games
//   sold            guess a real sale price in six tries
//   town-shapes     name the town from its outline in six tries
//   pin-drop        find a sold home on the map; three free clues, more for 5 points each
//   lineup          put five towns in order by a public statistic, four tries
//   fair-or-unfair  call five real assessments over, fair or under (Chapter 123 common level range)
//   blocks          sort sixteen tiles into four groups of four, four mistakes allowed
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LAUNCH_DATE = '2026-10-01';
const TIME_ZONE = 'America/New_York';
const SALT = process.env.WATCHDOG_GAMES_SALT || 'watchdog-games-v1';
const COUNTIES = ['atlantic', 'bergen', 'burlington', 'camden', 'cape-may', 'cumberland', 'essex', 'gloucester', 'hudson', 'hunterdon', 'mercer', 'middlesex', 'monmouth', 'morris', 'ocean', 'passaic', 'salem', 'somerset', 'sussex', 'union', 'warren'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;
const GAME_IDS = ['sold', 'town-shapes', 'pin-drop', 'lineup', 'fair-or-unfair', 'blocks'];

const cache = new Map();
function readJson(rel) {
  if (!cache.has(rel)) cache.set(rel, JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')));
  return cache.get(rel);
}
function memo(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

function todayInNewJersey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function puzzleNumber(date) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(LAUNCH_DATE + 'T00:00:00Z')) / DAY_MS) + 1;
}
function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date)) && !Number.isNaN(Date.parse(date + 'T00:00:00Z'));
}

function hash32(text) {
  return crypto.createHash('sha256').update(text).digest().readUInt32BE(0);
}
// mulberry32 seeded from the salt: fixed per deployment salt but not
// guessable from the date alone.
function seededRandom(seedText) {
  let seed = hash32(seedText);
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(items, next) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function seededOrder(items, seedText) {
  return shuffle(items, seededRandom(seedText));
}

// Light spoiler guard, not security: reversed digits plus a date-derived
// offset, base64 encoded. The page decodes it once the round is over.
function encodeAnswer(value, date) {
  const offset = hash32('k|' + date) % 9973;
  const text = String(value).split('').reverse().join('') + '.' + offset;
  return Buffer.from(text, 'utf8').toString('base64');
}
function decodeAnswer(k) {
  return Buffer.from(String(k || ''), 'base64').toString('utf8').split('.')[0].split('').reverse().join('');
}
// Same idea for structured answers: reversed ASCII JSON, base64 encoded.
function encodeData(value) {
  const ascii = JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return Buffer.from(ascii.split('').reverse().join(''), 'utf8').toString('base64');
}
function decodeData(k) {
  return JSON.parse(Buffer.from(String(k || ''), 'base64').toString('utf8').split('').reverse().join(''));
}

function townIndex() {
  const doc = readJson('property/data/games/towns.json');
  if (!doc.byCode) doc.byCode = new Map(doc.towns.map((t) => [t.c, t]));
  return doc;
}
function ratios() {
  return readJson('chapter123-ratios-2026.json');
}
function median(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
function miles(a, b) {
  const r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const soldLabel = (row) => MONTHS[row.m - 1] + ' ' + row.y;

// ---------- shared sale helpers ----------
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

// =====================================================================
// Sold!
// =====================================================================
function soldPuzzle(date) {
  const number = puzzleNumber(date);
  const order = seededOrder(COUNTIES, SALT + '|sold-counties');
  const county = order[(number - 1) % order.length];
  const file = readJson(`property/sales-${county}.json`);
  const towns = townIndex().byCode;
  const ratioDoc = ratios();
  const candidates = [];
  for (const row of file.sales || []) {
    if (!eligibleSale(row) || !towns.has(row.d) || !ratioDoc.districts[row.d]) continue;
    const street = streetName(row.a);
    if (street) candidates.push({ row, street });
  }
  if (!candidates.length) throw new Error('no eligible sale for ' + county);
  const { row, street } = candidates[hash32(SALT + '|sold|' + date) % candidates.length];
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
      sold: soldLabel(row)
    },
    hints: {
      town_median_ppsf: median(peers.map((s) => s.ppsf)),
      town_sales: peers.length,
      assessed: row.av,
      town_ratio: ratioDoc.districts[row.d][0],
      ratio_year: ratioDoc.tax_year
    },
    k: encodeAnswer(row.p, date)
  };
}

// =====================================================================
// Town Shapes
// =====================================================================
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

// =====================================================================
// Pin Drop
// =====================================================================
const PIN_DROP_CLUE_COST = 5;
function pinDropPuzzle(date) {
  const number = puzzleNumber(date);
  const homes = readJson('property/data/games/private/pin-drop.json').homes;
  const order = seededOrder(homes.map((_, i) => i), SALT + '|pin-drop');
  const h = homes[order[(number - 1) % order.length]];
  const doc = townIndex();
  const town = doc.byCode.get(h.d);
  const shapes = readJson('property/data/games/town-shapes.json');
  const people = new Intl.NumberFormat('en-US').format(town.pop);
  return {
    game: 'pin-drop',
    date,
    number,
    home: { kind: 'House', year_built: h.yb, sqft: h.sf, sold: soldLabel(h) },
    free: {
      price: h.p,
      tax: Math.round(h.av * town.rate / 100 / 100) * 100,
      rate: town.rate,
      rate_year: doc.rate_year
    },
    clue_cost: PIN_DROP_CLUE_COST,
    // Paid clues, easiest last: county, town size, town outline, town name, street.
    paid: encodeData([
      { id: 'county', label: 'County', value: town.k + ' County' },
      { id: 'size', label: 'Town size', value: `${people} people on ${town.sq} sq mi` },
      { id: 'shape', label: 'Town outline', value: 'Outline of the town', path: shapes.shapes[h.d], view_box: shapes.view_box },
      { id: 'town', label: 'Town', value: town.n },
      { id: 'street', label: 'Street', value: h.s }
    ]),
    k: encodeData({ lat: h.lat, lon: h.lon, pin: h.pin, town: town.n, county: town.k, street: h.s })
  };
}
// Exact parcel: 100. Otherwise 95 at the doorstep, falling off with distance
// (about 86 at a mile, 58 at five, 35 at ten). Each paid clue costs 5.
function pinDropPoints(distanceMiles, exact, cluesBought) {
  const base = exact ? 100 : Math.round(95 * Math.exp(-Math.max(0, distanceMiles) / 10));
  return Math.max(0, base - PIN_DROP_CLUE_COST * Math.max(0, Math.min(5, cluesBought | 0)));
}

// =====================================================================
// Lineup
// =====================================================================
const LINEUP_TRIES = 4;
const LINEUP_POINTS = [100, 75, 50, 25];
const LINEUP_METRICS = [
  { id: 'rate', label: 'General tax rate', unit: 'per $100 of assessed value', note: 'The rate on the tax bill. Towns that assess low need a higher rate to raise the same money, so compare it with the ratio too.', learn: '/glossary/general-tax-rate', gap: (a, b) => Math.abs(a - b) >= 0.15 },
  { id: 'med', label: 'Median home sale price', unit: 'residential sales since 2024', note: 'Half the homes sold for more, half for less. Verified arm\'s-length sales only.', learn: '/glossary/arms-length-sale', gap: (a, b) => Math.abs(a - b) / Math.max(a, b) >= 0.08 },
  { id: 'pop', label: 'Population', unit: '2020 Census', note: 'More people usually means more ratables, but not always lower taxes.', learn: '/town-compare', gap: (a, b) => Math.abs(a - b) / Math.max(a, b) >= 0.12 },
  { id: 'ratio', label: 'Average assessment ratio', unit: 'assessed value as a share of market value, 2026', note: 'How close the town\'s assessments are to market value. Low ratios usually mean a revaluation is overdue.', learn: '/glossary/directors-ratio', gap: (a, b) => Math.abs(a - b) >= 4 },
  { id: 'ppsf', label: 'Median price per square foot', unit: 'residential sales since 2024', note: 'Strips out house size, so it shows what the location is worth.', learn: '/glossary/comparable-sales', gap: (a, b) => Math.abs(a - b) / Math.max(a, b) >= 0.08 }
];
function lineupValue(metric, town) {
  if (metric.id === 'rate') return town.rate;
  if (metric.id === 'pop') return town.pop;
  if (metric.id === 'ratio') { const r = ratios().districts[town.c]; return r ? r[0] : null; }
  const s = readJson('property/data/games/private/town-stats.json').towns[town.c];
  return s ? s[metric.id] : null;
}
function lineupDisplay(metric, v) {
  if (metric.id === 'rate') return v.toFixed(3);
  if (metric.id === 'ratio') return v.toFixed(2) + '%';
  if (metric.id === 'pop') return new Intl.NumberFormat('en-US').format(v);
  return '$' + new Intl.NumberFormat('en-US').format(v);
}
function lineupPuzzle(date) {
  const number = puzzleNumber(date);
  const metrics = seededOrder(LINEUP_METRICS.map((m) => m.id), SALT + '|lineup-metrics');
  const metric = LINEUP_METRICS.find((m) => m.id === metrics[(number - 1) % metrics.length]);
  const counties = seededOrder(COUNTIES, SALT + '|lineup-counties');
  const doc = townIndex();
  const next = seededRandom(SALT + '|lineup|' + date);
  let picked = null, county = null;
  for (let c = 0; c < counties.length && !picked; c++) {
    const slug = counties[(number - 1 + c) % counties.length];
    const name = slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    const pool = doc.towns.filter((t) => t.k === name).map((t) => ({ t, v: lineupValue(metric, t) })).filter((x) => x.v != null && x.v > 0);
    for (let attempt = 0; attempt < 300 && pool.length >= 5; attempt++) {
      const five = shuffle(pool, next).slice(0, 5).sort((a, b) => b.v - a.v);
      if (five.every((x, i) => i === 0 || metric.gap(five[i - 1].v, x.v))) { picked = five; county = name; break; }
    }
  }
  if (!picked) throw new Error('no lineup for ' + date);
  let start;
  for (let i = 0; i < 50; i++) {
    start = shuffle(picked, next);
    if (start.filter((x, j) => x === picked[j]).length <= 1) break;
  }
  return {
    game: 'lineup',
    date,
    number,
    tries: LINEUP_TRIES,
    metric: { id: metric.id, label: metric.label, unit: metric.unit, note: metric.note, learn: metric.learn },
    county,
    towns: start.map((x) => ({ c: x.t.c, n: x.t.n })),
    k: encodeData({ order: picked.map((x) => x.t.c), values: Object.fromEntries(picked.map((x) => [x.t.c, lineupDisplay(metric, x.v)])) })
  };
}
// Feedback per slot: 2 right spot, 1 one spot off, 0 further.
function lineupFeedback(order, answer) {
  return order.map((code, i) => {
    const at = answer.indexOf(code);
    return at === i ? 2 : Math.abs(at - i) === 1 ? 1 : 0;
  });
}

// =====================================================================
// Fair or Unfair
// =====================================================================
const FAIR_HOMES = 5;
const FAIR_MARGIN = 3; // percentage points clear of the range, so no call is a coin flip
const FAIR_MIXES = [[1, 3, 1], [2, 2, 1], [1, 2, 2], [2, 1, 2], [3, 1, 1], [1, 1, 3]]; // over, fair, under
function fairCall(ratioPct, lower, upper) {
  if (ratioPct > upper) return 'over';
  if (ratioPct < lower) return 'under';
  return 'fair';
}
function fairPuzzle(date) {
  const number = puzzleNumber(date);
  const next = seededRandom(SALT + '|fair|' + date);
  const mix = FAIR_MIXES[Math.floor(next() * FAIR_MIXES.length)];
  const want = { over: mix[0], fair: mix[1], under: mix[2] };
  const counties = shuffle(COUNTIES, next);
  const towns = townIndex().byCode;
  const doc = ratios();
  const picks = [];
  const used = new Set();
  for (let c = 0; picks.length < FAIR_HOMES && c < counties.length * 4; c++) {
    const file = readJson(`property/sales-${counties[c % counties.length]}.json`);
    const pool = (file.sales || []).filter((row) => eligibleSale(row) && row.y >= 2025 && towns.has(row.d) && doc.districts[row.d] && !used.has(row.d));
    for (let tries = 0; tries < 40; tries++) {
      const row = pool[Math.floor(next() * pool.length)];
      if (!row) break;
      const [avg, lower, upper] = doc.districts[row.d];
      const pct = row.av / row.p * 100;
      const call = fairCall(pct, lower, upper);
      if (!want[call] || Math.min(Math.abs(pct - lower), Math.abs(pct - upper)) < FAIR_MARGIN) continue;
      const street = streetName(row.a);
      if (!street) continue;
      want[call]--;
      used.add(row.d);
      const town = towns.get(row.d);
      picks.push({
        home: { town: town.n, county: town.k, street: street.street, unit: street.unit, year_built: row.yb, sqft: row.sf, sold: soldLabel(row), price: row.p, assessed: row.av, ratio: avg, lower, upper },
        call,
        pct: Math.round(pct * 10) / 10
      });
      break;
    }
  }
  if (picks.length < FAIR_HOMES) throw new Error('no fair-or-unfair set for ' + date);
  const ordered = shuffle(picks, next);
  return {
    game: 'fair-or-unfair',
    date,
    number,
    ratio_year: doc.tax_year,
    homes: ordered.map((p) => p.home),
    k: encodeData(ordered.map((p) => ({ call: p.call, pct: p.pct })))
  };
}

// =====================================================================
// Blocks
// =====================================================================
const BLOCKS_MISTAKES = 4;
const KEEP_CITY = new Set(['Jersey City', 'Atlantic City', 'Ocean City', 'Union City', 'Egg Harbor City', 'Corbin City', 'Gloucester City', 'Sea Isle City']);
const GENERIC_NAMES = new Set(['UPPER', 'LOWER', 'MIDDLE']);
// Everyday name of a municipality: drop the trailing type word, keep "City"
// where it is part of the name (Jersey City), "City of Orange" is Orange.
function bareTownName(name) {
  if (/^City of Orange/i.test(name)) return 'Orange';
  if (KEEP_CITY.has(name)) return name;
  return String(name).replace(/ (?:Township|Borough|City|Town|Village)$/, '');
}
function blocksGroups() {
  return memo('blocks-groups', () => {
    const doc = readJson('property/data/games/private/blocks.json');
    const towns = townIndex().towns.map((t) => ({ t, bare: bareTownName(t.n) }));
    const bareCount = new Map();
    towns.forEach((x) => bareCount.set(x.bare.toUpperCase(), (bareCount.get(x.bare.toUpperCase()) || 0) + 1));
    const groups = doc.groups.map((g) => {
      let members = new Set(g.tiles.concat(g.also || []));
      if (g.kind === 'prefix' || g.kind === 'suffix') {
        members = new Set();
        for (const { bare } of towns) {
          if (g.kind === 'prefix' && bare.startsWith(g.word) && bare !== g.word) members.add(bare.slice(g.word.length).trim().toUpperCase());
          if (g.kind === 'suffix' && bare.endsWith(' ' + g.word)) members.add(bare.slice(0, -g.word.length - 1).toUpperCase());
        }
      }
      return { id: g.id, tier: g.tier, label: g.label, learn: g.learn || null, tiles: g.tiles.slice(), members };
    });
    const countyNames = [...new Set(towns.map((x) => x.t.k))].sort();
    for (const county of countyNames) {
      const inCounty = towns.filter((x) => x.t.k === county).map((x) => x.bare.toUpperCase());
      groups.push({
        id: 'county-' + county.toLowerCase().replace(/\s+/g, '-'),
        tier: 4,
        label: `Towns in ${county} County`,
        learn: '/town-compare',
        tiles: inCounty.filter((n) => bareCount.get(n) === 1 && n.length <= 14 && n.split(/[\s-]+/).every((w) => w.length <= 12) && !GENERIC_NAMES.has(n)).sort(),
        members: new Set(inCounty)
      });
    }
    return groups;
  });
}
// How many ways can these tiles be split into these groups? (stops at 2)
function blocksSolutions(tiles, groups) {
  const fits = tiles.map((tile) => groups.map((g, i) => (g.members.has(tile) ? i : -1)).filter((i) => i >= 0));
  const room = groups.map(() => 4);
  let found = 0;
  (function place(i) {
    if (found > 1) return;
    if (i === tiles.length) { found++; return; }
    for (const g of fits[i]) {
      if (!room[g]) continue;
      room[g]--;
      place(i + 1);
      room[g]++;
    }
  })(0);
  return found;
}
function blocksPuzzle(date) {
  const number = puzzleNumber(date);
  const groups = blocksGroups();
  const tiers = [1, 2, 3, 4].map((tier) => seededOrder(groups.filter((g) => g.tier === tier && g.tiles.length >= 4).map((g) => g.id), SALT + '|blocks-tier-' + tier));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const slot = (list, k) => list[((number - 1) * 3 + k) % list.length];
  let best = null;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) {
    const chosen = [slot(tiers[0], a), slot(tiers[1], b), slot(tiers[2], c), slot(tiers[3], d)].map((id) => byId.get(id));
    const next = seededRandom(`${SALT}|blocks|${date}|${a}${b}${c}${d}`);
    for (let draw = 0; draw < 4; draw++) {
      const used = new Set();
      const sets = [];
      for (const g of chosen) {
        const four = shuffle(g.tiles.filter((t) => !used.has(t)), next).slice(0, 4);
        if (four.length < 4) break;
        four.forEach((t) => used.add(t));
        sets.push(four);
      }
      if (sets.length < 4) continue;
      const tiles = sets.flat();
      if (blocksSolutions(tiles, chosen) !== 1) continue;
      const herrings = tiles.filter((t) => chosen.filter((g) => g.members.has(t)).length > 1).length;
      const score = -Math.abs(herrings - 3);
      if (!best || score > best.score) best = { score, chosen, sets };
      break;
    }
  }
  if (!best) throw new Error('no blocks puzzle for ' + date);
  const tiles = shuffle(best.sets.flat(), seededRandom(SALT + '|blocks-tiles|' + date));
  return {
    game: 'blocks',
    date,
    number,
    mistakes: BLOCKS_MISTAKES,
    tiles,
    k: encodeData(best.chosen.map((g, i) => ({ label: g.label, tier: g.tier, tiles: best.sets[i], learn: g.learn })))
  };
}

// =====================================================================
// Puzzle lookup and scoring
// =====================================================================
const BUILDERS = { sold: soldPuzzle, 'town-shapes': townShapesPuzzle, 'pin-drop': pinDropPuzzle, lineup: lineupPuzzle, 'fair-or-unfair': fairPuzzle, blocks: blocksPuzzle };
function puzzleFor(game, date) {
  if (!BUILDERS[game]) throw new Error('unknown game');
  return memo(`puzzle|${game}|${date}`, () => BUILDERS[game](date));
}

const SIX_TRY_POINTS = [100, 85, 70, 55, 40, 25];
const asList = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

// Replays a finished play against the real puzzle and returns
// { points (0-100), solved, detail }. Throws on a malformed play.
function scorePlay(game, date, play) {
  const puzzle = puzzleFor(game, date);
  play = play || {};
  if (game === 'sold') {
    const price = Number(decodeAnswer(puzzle.k));
    const guesses = asList(play.guesses, 6).map(Number);
    if (!guesses.length || guesses.some((g) => !(g >= 10000 && g <= 20000000))) throw new Error('bad guesses');
    const hit = guesses.findIndex((g) => Math.abs(g - price) / price <= 0.05);
    if (hit >= 0 && hit !== guesses.length - 1) throw new Error('play continued after a win');
    if (hit < 0 && guesses.length < 6) throw new Error('unfinished play');
    return { points: hit >= 0 ? SIX_TRY_POINTS[hit] : 0, solved: hit >= 0, detail: { guesses: guesses.length } };
  }
  if (game === 'town-shapes') {
    const answer = decodeAnswer(puzzle.k);
    const codes = townIndex().byCode;
    const guesses = asList(play.guesses, 6).map(String);
    if (!guesses.length || guesses.some((c) => !codes.has(c))) throw new Error('bad guesses');
    const hit = guesses.indexOf(answer);
    if (hit >= 0 && hit !== guesses.length - 1) throw new Error('play continued after a win');
    if (hit < 0 && guesses.length < 6) throw new Error('unfinished play');
    return { points: hit >= 0 ? SIX_TRY_POINTS[hit] : 0, solved: hit >= 0, detail: { guesses: guesses.length } };
  }
  if (game === 'pin-drop') {
    const answer = decodeData(puzzle.k);
    const lat = Number(play.lat), lon = Number(play.lon), clues = Number(play.clues || 0);
    if (!(lat > 38.5 && lat < 41.6 && lon > -76 && lon < -73.5) || !(clues >= 0 && clues <= 5)) throw new Error('bad pin');
    const exact = String(play.pin || '') === answer.pin;
    const d = miles({ lat, lon }, answer);
    return { points: pinDropPoints(d, exact, clues), solved: exact, detail: { miles: Math.round(d * 100) / 100, clues, exact } };
  }
  if (game === 'lineup') {
    const answer = decodeData(puzzle.k).order;
    const orders = asList(play.orders, LINEUP_TRIES);
    if (!orders.length || orders.some((o) => !Array.isArray(o) || o.length !== answer.length || [...o].sort().join() !== [...answer].sort().join())) throw new Error('bad orders');
    const hit = orders.findIndex((o) => o.join() === answer.join());
    if (hit >= 0 && hit !== orders.length - 1) throw new Error('play continued after a win');
    if (hit < 0 && orders.length < LINEUP_TRIES) throw new Error('unfinished play');
    return { points: hit >= 0 ? LINEUP_POINTS[hit] : 0, solved: hit >= 0, detail: { tries: orders.length } };
  }
  if (game === 'fair-or-unfair') {
    const answer = decodeData(puzzle.k);
    const picks = asList(play.picks, FAIR_HOMES);
    if (picks.length !== FAIR_HOMES || picks.some((p) => !['over', 'fair', 'under'].includes(p))) throw new Error('bad picks');
    const right = picks.filter((p, i) => p === answer[i].call).length;
    return { points: right * 20, solved: right === FAIR_HOMES, detail: { right } };
  }
  if (game === 'blocks') {
    const answer = decodeData(puzzle.k);
    const guesses = asList(play.guesses, 4 + BLOCKS_MISTAKES);
    let mistakes = 0;
    const found = new Set();
    for (const g of guesses) {
      if (!Array.isArray(g) || g.length !== 4 || mistakes >= BLOCKS_MISTAKES || found.size === 4) throw new Error('bad guesses');
      const key = g.map(String).sort().join('|');
      const hit = answer.findIndex((grp, i) => !found.has(i) && grp.tiles.slice().sort().join('|') === key);
      if (hit >= 0) found.add(hit); else mistakes++;
    }
    const solved = found.size === 4;
    if (!solved && mistakes < BLOCKS_MISTAKES) throw new Error('unfinished play');
    return { points: solved ? 100 - 20 * mistakes : 10 * found.size, solved, detail: { mistakes, groups: found.size } };
  }
  throw new Error('unknown game');
}

module.exports = {
  LAUNCH_DATE,
  GAME_IDS,
  todayInNewJersey,
  puzzleNumber,
  validDate,
  puzzleFor,
  scorePlay,
  _internals: {
    streetName, eligibleSale, encodeAnswer, decodeAnswer, encodeData, decodeData, seededOrder, miles,
    soldPuzzle, townShapesPuzzle, pinDropPuzzle, pinDropPoints, lineupPuzzle, lineupFeedback, fairPuzzle, fairCall,
    blocksPuzzle, blocksGroups, blocksSolutions, bareTownName, LAUNCH_DATE, LINEUP_METRICS
  }
};
