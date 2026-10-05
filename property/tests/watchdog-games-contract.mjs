import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Watchdog Games (/games): six daily puzzles built from public records plus a
// signed-in leaderboard. This contract runs the real puzzle engine over a year
// of days and checks the promises the pages make: no house numbers, no future
// puzzles, no repeats where promised, every Blocks board has exactly one
// solution, scores are recomputed from plays, private answer banks stay off
// the web, clean public URLs and the site's copy rules.
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(p, 'utf8');
const games = require('../../api/watchdog-games.js');
const engine = require('../../api/_watchdog-games-engine.js');
const board = require('../../api/watchdog-games-board.js');
const I = engine._internals;
const { soldPuzzle, townShapesPuzzle, pinDropPuzzle, lineupPuzzle, fairPuzzle, blocksPuzzle, streetName, encodeAnswer, decodeAnswer, decodeData, LAUNCH_DATE } = I;
const day = (n) => new Date(Date.parse(LAUNCH_DATE + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const GAME_IDS = ['sold', 'town-shapes', 'pin-drop', 'lineup', 'fair-or-unfair', 'blocks'];
assert.deepEqual(engine.GAME_IDS, GAME_IDS, 'six games, in a fixed list');

// ---------- generated data is current ----------
execFileSync('node', ['scripts/build-games-data.mjs', '--check'], { stdio: 'inherit' });
execFileSync('node', ['scripts/build-pin-drop-bank.mjs', '--check'], { stdio: 'inherit' });
const towns = JSON.parse(read('property/data/games/towns.json')).towns;
const townByCode = new Map(towns.map((t) => [t.c, t]));
assert.equal(towns.length, 564, 'all 564 New Jersey municipalities are playable');
assert.equal(new Set(towns.map((t) => t.c)).size, 564, 'municipality codes are unique');
assert.ok(towns.every((t) => t.lat > 38.8 && t.lat < 41.4 && t.lon > -75.6 && t.lon < -73.8), 'centroids fall inside New Jersey');

// ---------- street names never carry a house number or unit ----------
assert.deepEqual(streetName('23 LEGION DR., UNIT 202'), { street: 'Legion Dr', unit: true });
assert.deepEqual(streetName('12-14 MAIN ST'), { street: 'Main St', unit: false });
assert.equal(streetName('APT 4 10 MAIN'), null);
assert.equal(decodeAnswer(encodeAnswer(415000, '2026-10-01')), '415000');
assert.equal(decodeAnswer(encodeAnswer('0503', '2026-10-01')), '0503');
assert.deepEqual(decodeData(I.encodeData({ a: 'Pequannock', b: [1, 2] })), { a: 'Pequannock', b: [1, 2] });

// ---------- Blocks group bank ----------
const groups = I.blocksGroups();
const glossarySlugs = new Set(JSON.parse(read('property/data/glossary.json')).terms.map((t) => t.slug));
for (const g of groups) {
  assert.ok(g.tiles.length >= 4, `${g.id}: at least four tiles to choose from`);
  assert.equal(new Set(g.tiles).size, g.tiles.length, `${g.id}: no duplicate tiles`);
  for (const t of g.tiles) {
    assert.ok(g.members.has(t), `${g.id}: tile ${t} is a real member of the group`);
    assert.match(t, /^[A-Z0-9][A-Z0-9 '.\-]*$/, `${g.id}: tile ${t} is plain capitals`);
    assert.ok(t.length <= 15 && t.split(/[\s-]+/).every((w) => w.length <= 12), `${g.id}: tile ${t} fits a phone tile`);
  }
  if (g.learn && g.learn.startsWith('/glossary/')) assert.ok(glossarySlugs.has(g.learn.slice(10)), `${g.id}: learn link ${g.learn} is a real glossary term`);
}
// Fill-in-the-blank groups come straight from municipality names.
const bare = new Set(towns.map((t) => I.bareTownName(t.n).toUpperCase()));
const doc = JSON.parse(read('property/data/games/private/blocks.json'));
for (const g of doc.groups.filter((x) => x.kind)) {
  for (const t of g.tiles) {
    const word = g.word.toUpperCase();
    const joined = g.kind === 'prefix' ? [`${word} ${t}`, `${word}${t}`] : [`${t} ${word}`];
    assert.ok(joined.some((n) => bare.has(n)), `${g.id}: ${joined[0]} is a New Jersey municipality`);
  }
}
for (const g of groups.filter((x) => x.tier === 4)) {
  const county = g.label.replace(/^Towns in | County$/g, '');
  for (const t of g.tiles) assert.ok(towns.some((x) => x.k === county && I.bareTownName(x.n).toUpperCase() === t), `${g.id}: ${t} is in ${county} County`);
}
assert.equal(groups.filter((g) => g.tier === 4).length, 21, 'one county group per county');

// ---------- a year of real puzzles ----------
const DAYS = 365;
const shapeCodes = new Set();
const pinHomes = new Set();
for (let i = 0; i < DAYS; i++) {
  const date = day(i);

  if (i < 120) {
    const sold = soldPuzzle(date);
    assert.equal(sold.number, i + 1, `${date}: puzzle numbers count from launch`);
    assert.deepEqual(Object.keys(sold.home).sort(), ['county', 'sold', 'sqft', 'street', 'town', 'unit', 'year_built'], `${date}: Sold! sends only the public facts`);
    assert.ok(!/^\d/.test(sold.home.street) && !/\b(?:UNIT|APT)\b/i.test(sold.home.street), `${date}: no house number or unit in "${sold.home.street}"`);
    const price = Number(decodeAnswer(sold.k));
    assert.ok(price >= 125000 && price <= 3000000, `${date}: sale price in range`);
    assert.ok(!Object.values(sold.home).concat(Object.values(sold)).includes(price), `${date}: price never travels as a plain field`);

    const shape = townShapesPuzzle(date);
    const code = decodeAnswer(shape.k);
    assert.ok(townByCode.has(code), `${date}: answer is a real municipality`);
    assert.ok(!shapeCodes.has(code), `${date}: Town Shapes does not repeat a town`);
    shapeCodes.add(code);
    assert.match(shape.path, /^M[\d. LMZ]+$/, `${date}: outline is a plain SVG path`);
  }

  // Pin Drop: one real home a day, no repeats for over a year, no house numbers.
  const pin = pinDropPuzzle(date);
  const spot = decodeData(pin.k);
  assert.ok(!pinHomes.has(spot.pin), `${date}: Pin Drop does not repeat a home`);
  pinHomes.add(spot.pin);
  assert.ok(spot.lat > 38.9 && spot.lat < 41.36 && spot.lon > -75.57 && spot.lon < -73.88, `${date}: the home is in New Jersey`);
  assert.deepEqual(Object.keys(pin.home).sort(), ['kind', 'sold', 'sqft', 'year_built'], `${date}: Pin Drop's free facts never name the place`);
  const paid = decodeData(pin.paid);
  assert.deepEqual(paid.map((c) => c.id), ['county', 'size', 'shape', 'town', 'street'], `${date}: five paid clues in order`);
  assert.ok(!/^\d/.test(paid[4].value), `${date}: the street clue has no house number`);
  assert.ok(!JSON.stringify(pin).includes(spot.pin) && !JSON.stringify(pin.free).includes(paid[3].value), `${date}: the answer never travels as a plain field`);
  assert.equal(engine.scorePlay('pin-drop', date, { lat: spot.lat, lon: spot.lon, pin: spot.pin, clues: 0 }).points, 100, `${date}: the exact parcel scores 100`);

  // Lineup: five towns, clear gaps, starting order is not already solved.
  const lineup = lineupPuzzle(date);
  const order = decodeData(lineup.k).order;
  assert.equal(lineup.towns.length, 5, `${date}: five towns`);
  assert.equal(new Set(order).size, 5, `${date}: five different towns`);
  assert.ok(order.every((c) => townByCode.get(c).k === lineup.county), `${date}: all five are in ${lineup.county} County`);
  assert.ok(lineup.towns.filter((t, j) => t.c === order[j]).length <= 1, `${date}: the starting order is shuffled`);
  assert.equal(engine.scorePlay('lineup', date, { orders: [order] }).points, 100, `${date}: a first-try lineup scores 100`);

  // Fair or Unfair: the call follows from the shown numbers and the official range.
  const fair = fairPuzzle(date);
  const calls = decodeData(fair.k);
  assert.equal(fair.homes.length, 5, `${date}: five homes`);
  assert.equal(new Set(fair.homes.map((h) => h.town + '|' + h.county)).size, 5, `${date}: five different towns`);
  assert.ok(['over', 'fair', 'under'].every((c) => calls.some((x) => x.call === c)), `${date}: each call appears at least once`);
  fair.homes.forEach((h, j) => {
    const pct = h.assessed / h.price * 100;
    assert.equal(I.fairCall(pct, h.lower, h.upper), calls[j].call, `${date}: home ${j + 1} call matches its numbers`);
    assert.ok(Math.min(Math.abs(pct - h.lower), Math.abs(pct - h.upper)) >= 3, `${date}: home ${j + 1} is clear of the range edges`);
    assert.ok(!/^\d/.test(h.street), `${date}: no house number`);
  });
  assert.equal(engine.scorePlay('fair-or-unfair', date, { picks: calls.map((c) => c.call) }).points, 100, `${date}: five right calls score 100`);

  // Blocks: four groups, sixteen different tiles, exactly one solution.
  const blocks = blocksPuzzle(date);
  const answer = decodeData(blocks.k);
  assert.equal(blocks.tiles.length, 16, `${date}: sixteen tiles`);
  assert.equal(new Set(blocks.tiles).size, 16, `${date}: no repeated tile`);
  assert.deepEqual(answer.map((g) => g.tier), [1, 2, 3, 4], `${date}: one group from each tier`);
  const chosen = answer.map((g) => groups.find((x) => x.label === g.label));
  assert.equal(I.blocksSolutions(blocks.tiles, chosen), 1, `${date}: exactly one way to solve the board`);
  assert.equal(engine.scorePlay('blocks', date, { guesses: answer.map((g) => g.tiles) }).points, 100, `${date}: a clean solve scores 100`);
}

// ---------- scoring replays plays and rejects bad ones ----------
const d0 = day(0);
const price = Number(decodeAnswer(soldPuzzle(d0).k));
assert.equal(engine.scorePlay('sold', d0, { guesses: [price * 0.5, price] }).points, 85, 'Sold! in two scores 85');
assert.equal(engine.scorePlay('sold', d0, { guesses: [1, 2, 3, 4, 5, 6].map((j) => Math.round(price * 3) + j) }).points, 0, 'a missed Sold! scores 0');
assert.throws(() => engine.scorePlay('sold', d0, { guesses: [price, price] }), /continued after a win/);
assert.throws(() => engine.scorePlay('sold', d0, { guesses: [price * 0.5] }), /unfinished/);
assert.throws(() => engine.scorePlay('lineup', d0, { orders: [['x', 'y']] }), /bad orders/);
assert.throws(() => engine.scorePlay('fair-or-unfair', d0, { picks: ['over'] }), /bad picks/);
assert.throws(() => engine.scorePlay('pin-drop', d0, { lat: 0, lon: 0, clues: 0 }), /bad pin/);
const b0 = decodeData(blocksPuzzle(d0).k);
const wrong = [b0[0].tiles[0], b0[0].tiles[1], b0[0].tiles[2], b0[1].tiles[0]];
assert.equal(engine.scorePlay('blocks', d0, { guesses: [wrong].concat(b0.map((g) => g.tiles)) }).points, 80, 'Blocks with one mistake scores 80');
assert.equal(engine.scorePlay('blocks', d0, { guesses: [wrong, wrong, wrong, wrong] }).points, 0, 'four mistakes and no groups scores 0');
assert.equal(I.pinDropPoints(1, false, 0), 86, 'Pin Drop: a mile away is about 86');
assert.equal(I.pinDropPoints(0, true, 3), 85, 'Pin Drop: each extra clue costs 5');

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
for (const g of GAME_IDS) assert.equal(call({ game: g }).statusCode, 200, `today's ${g} puzzle loads`);
assert.equal(call({ game: 'sold', date: '2099-01-01' }).statusCode, 404, 'future puzzles are never served');
assert.equal(call({ game: 'blocks', date: '2026-09-30' }).statusCode, 404, 'nothing before launch');
assert.equal(call({ game: 'chess' }).statusCode, 400, 'unknown games are rejected');
assert.equal(call({ game: 'sold', date: 'tomorrow' }).statusCode, 400, 'dates are validated');

// ---------- leaderboard ----------
const { cleanNickname, weekStart } = board._internals;
assert.equal(cleanNickname('Pine Barrens Pro').name, 'Pine Barrens Pro');
assert.ok(cleanNickname('ab').error, 'names need three characters');
assert.ok(cleanNickname('Watchdog Staff').error, 'reserved names are refused');
assert.ok(cleanNickname('a@b.com').error, 'email addresses are refused');
assert.equal(weekStart('2026-10-01'), '2026-09-28', 'weeks start on Monday');
const boardSrc = read('api/watchdog-games-board.js');
assert.match(boardSrc, /\/auth\/v1\/user/, 'writes check the player\'s Watchdog session');
assert.match(boardSrc, /engine\.scorePlay\(/, 'scores are recomputed on the server');
assert.match(boardSrc, /date !== today/, 'only today\'s puzzle counts');
assert.match(boardSrc, /consume_public_request_budget/, 'writes are rate limited');
assert.ok(!/Access-Control-Allow-Origin['"]\s*,\s*['"]\*/.test(boardSrc), 'no wildcard CORS on an authenticated endpoint');
const migration = read('supabase/migrations/20261001200000_watchdog_games_leaderboard.sql');
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.watchdog_game_players from public, anon, authenticated/i, 'player names are server-only');
assert.match(migration, /revoke all on table public\.watchdog_game_scores from public, anon, authenticated/i, 'scores are server-only');
assert.match(migration, /unique \(user_id, game, puzzle_date\)/i, 'one score per player, game and day');
const client = read('property/js/games/games-board.js');
assert.match(client, /onboarding\/\?next=/, 'sign in goes through Watchdog onboarding and comes back');
assert.match(client, /sb-' \+ project\.ref \+ '-auth-token/, 'the board shares the site\'s Watchdog session');

// ---------- deployment wiring ----------
const vercel = JSON.parse(read('vercel.json'));
for (const fnName of ['api/watchdog-games.js', 'api/watchdog-games-board.js']) {
  const fn = vercel.functions[fnName];
  assert.ok(fn && /property\/sales-\*\.json/.test(fn.includeFiles) && /property\/data\/games\/private\/\*\.json/.test(fn.includeFiles) && /chapter123-ratios-2026\.json/.test(fn.includeFiles), `${fnName} bundles its data`);
}
assert.match(read('middleware.js'), /GAMES_PRIVATE_FILE = \/\^\\\/property\\\/data\\\/games\\\/private\\\/\/i/, 'answer banks are blocked at the edge');
const sitemap = read('api/watchdog-index-sitemap.js');
for (const p of ['/games', '/games/sold', '/games/town-shapes', '/games/pin-drop', '/games/blocks', '/games/lineup', '/games/fair-or-unfair', '/games/leaderboard']) assert.ok(sitemap.includes(`path: '${p}'`), `sitemap lists ${p}`);

// ---------- pages and copy ----------
const pages = {
  'property/games/index.html': 'https://www.watchdogindex.com/games',
  'property/games/sold/index.html': 'https://www.watchdogindex.com/games/sold',
  'property/games/town-shapes/index.html': 'https://www.watchdogindex.com/games/town-shapes',
  'property/games/pin-drop/index.html': 'https://www.watchdogindex.com/games/pin-drop',
  'property/games/blocks/index.html': 'https://www.watchdogindex.com/games/blocks',
  'property/games/lineup/index.html': 'https://www.watchdogindex.com/games/lineup',
  'property/games/fair-or-unfair/index.html': 'https://www.watchdogindex.com/games/fair-or-unfair',
  'property/games/leaderboard/index.html': 'https://www.watchdogindex.com/games/leaderboard'
};
const scripts = ['games-core', 'games-board', 'hub', 'sold', 'town-shapes', 'pin-drop', 'blocks', 'lineup', 'fair-or-unfair', 'leaderboard'].map((n) => `property/js/games/${n}.js`);
const copyFiles = Object.keys(pages).concat(scripts, ['property/css/watchdog-games.css', 'api/_watchdog-games-engine.js', 'api/watchdog-games-board.js', 'property/data/games/private/blocks.json']);
for (const [file, canonical] of Object.entries(pages)) {
  const html = read(file);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${file}: canonical is the clean Watchdog URL`);
  assert.ok(!/href="\/property\/(?!css\/|js\/)/.test(html), `${file}: links never expose /property/`);
  assert.match(html, /games-core\.js/, `${file}: loads the shared games runtime`);
  assert.match(html, /<meta name="description" content="[^"]{70,}">/, `${file}: has a real description`);
  for (const src of html.match(/src="https:\/\/[^"]+"/g) || []) assert.match(src, /^src="https:\/\/cdnjs\.cloudflare\.com\//, `${file}: third-party scripts come from cdnjs only (${src})`);
  if (file !== 'property/games/index.html' && file !== 'property/games/leaderboard/index.html') assert.match(html, /id="gm-board"/, `${file}: results show the leaderboard panel`);
}
for (const file of copyFiles) {
  const text = read(file);
  assert.ok(!/[–\u2014]/.test(text), `${file}: no em or en dashes`);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), `${file}: no emoji`);
  assert.ok(!/ROBUST Score|Watchdog Intel\b/.test(text), `${file}: brand names are correct`);
}
assert.match(read('property/css/watchdog-games.css'), /prefers-reduced-motion/, 'games respect reduced motion');
assert.ok(!/cartocdn/.test(read('property/js/games/pin-drop.js')), 'Pin Drop uses tiles that do not need an API key');

console.log(`Watchdog games contract passed (${DAYS} days of all six games checked).`);
