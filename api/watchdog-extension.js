'use strict';

// Watchdog browser extension API.
//   POST {action:'create_key'|'revoke'} with Authorization: Bearer <Supabase
//     access token>: an agent creates (or revokes) their personal extension
//     key. One active key per agent; creating a new one revokes the old.
//   GET ?address=<listing address> with x-watchdog-key: <key>: the Watchdog
//     summary for that address. Only for agents on an active Agent plan, and
//     capped per day, so the key cannot be used as a bulk data feed.
// Keys are stored hashed in integration_api_keys (provider browser_extension,
// prefix wdg_ext_), separate from Zapier keys (wdg_zap_, provider zapier).

const crypto = require('crypto');
const page = require('./watchdog-property-page');
const tc = require('./watchdog-true-cost');
const ck = require('./watchdog-checkup');

const H = page.helpers;
const PROVIDER = 'browser_extension';
const PREFIX = 'wdg_ext_';
const DAILY_LIMIT = 600;
const AGENT_TIERS = new Set(['agent', 'pro', 'pro_plus', 'pro+', 'teams']);
const ACTIVE = new Set(['active', 'trialing', 'past_due', 'cancel_scheduled']);

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key };
}

// `timeoutMs` (default 6 s) lets a caller give a small bookkeeping call less
// time than a lookup, so a slow table cannot eat the whole request budget.
async function rest(b, pathname, init = {}) {
  const { timeoutMs = 6000, ...options } = init;
  const r = await fetch(`${b.url}/rest/v1/${pathname}`, {
    ...options,
    headers: { apikey: b.key, Authorization: `Bearer ${b.key}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error(`${pathname.split('?')[0]} http ${r.status}`);
  const text = await r.text();
  return { data: text ? JSON.parse(text) : null, headers: r.headers };
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const enc = encodeURIComponent;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(JSON.stringify(body));
}

async function agentAccess(b, userId) {
  const [profile, ent] = await Promise.all([
    rest(b, `profiles?select=account_role,vanity_slug&id=eq.${enc(userId)}`),
    rest(b, `account_entitlements?select=plan_tier,billing_tier,subscription_status&user_id=eq.${enc(userId)}`)
  ]);
  const p = (profile.data || [])[0] || {};
  const e = (ent.data || [])[0] || {};
  const tier = String(e.billing_tier || e.plan_tier || '').toLowerCase();
  const ok = p.account_role === 'developer' || (ACTIVE.has(String(e.subscription_status || '')) && AGENT_TIERS.has(tier));
  return { ok, slug: p.vanity_slug || null, developer: p.account_role === 'developer' };
}

async function sessionUser(b, req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 4000) return null;
  const r = await fetch(`${b.url}/auth/v1/user`, { headers: { apikey: b.key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u : null;
}

async function manageKey(req, res, body) {
  const b = backend();
  const user = await sessionUser(b, req);
  if (!user) return json(res, 401, { error: 'Sign in again to manage your extension key.' });
  const access = await agentAccess(b, user.id);
  const now = new Date().toISOString();
  await rest(b, `integration_api_keys?user_id=eq.${enc(user.id)}&provider=eq.${PROVIDER}&status=eq.active`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'revoked', revoked_at: now })
  });
  if (body.action === 'revoke') return json(res, 200, { ok: true });
  if (!access.ok) return json(res, 403, { error: 'The browser extension is part of the Agent plan.' });
  const key = PREFIX + crypto.randomBytes(24).toString('hex');
  await rest(b, 'integration_api_keys', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: user.id, provider: PROVIDER, label: 'Browser extension', key_prefix: key.slice(0, 16), key_hash: sha256(key), scopes: ['extension.property.read'], status: 'active' })
  });
  return json(res, 200, { ok: true, key });
}

// Listing sites write "102 Grant Ave, Harrison, NJ 07029"; the state list
// writes "102 GRANT AVE". Postal towns often differ from the tax
// municipality, and listing sites write "2nd"/"N"/"Apt 2" where the state list
// has "SECOND"/"NORTH"/nothing, so a few spellings are tried in turn.
function parseAddress(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const m = s.match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+[^,]+?),\s*([^,]+?),\s*(?:NJ|New Jersey)\b/i);
  if (m) return { street: m[1], city: m[2], query: `${m[1]}, ${m[2]}, NJ` };
  return /^\d/.test(s) ? { street: s.replace(/,?\s*(NJ|New Jersey)\b.*$/i, ''), city: '', query: s } : null;
}

const ORDINALS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH'];
const DIRS = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };
function streetVariants(street) {
  const base = String(street || '').toUpperCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
  const noUnit = base.replace(/\s+(APT|APARTMENT|UNIT|STE|SUITE|FL|FLOOR|BLDG|NO)\b.*$/, '').replace(/\s+\d+[A-Z]?$/, (m) => (base.split(' ').length > 3 ? '' : m)).trim();
  const out = [base];
  const add = (v) => { if (v && !out.includes(v)) out.push(v); };
  add(noUnit);
  for (const b of [base, noUnit]) {
    add(b.replace(/\b(\d{1,2})(ST|ND|RD|TH)\b/g, (m, n) => ORDINALS[Number(n) - 1] || m));
    add(b.replace(new RegExp('\\b(' + ORDINALS.join('|') + ')\\b', 'g'), (m) => { const n = ORDINALS.indexOf(m) + 1; return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }));
    add(b.replace(/^(\S+) (N|S|E|W) /, (m, h, d) => `${h} ${DIRS[d]} `));
    add(b.replace(/^(\S+) (NORTH|SOUTH|EAST|WEST) /, (m, h, d) => `${h} ${d[0]} `));
  }
  return out.slice(0, 6);
}

const townMatches = (town, city) => {
  const c = String(city || '').toUpperCase().replace(/[^A-Z ]/g, '').trim();
  return Boolean(c) && String(town || '').toUpperCase().startsWith(c);
};
const distance = (a, b) => {
  const k = Math.PI / 180, x = (b.lon - a.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
};
// Same suffix spelling as the database's parcel_search_norm.
const SUFFIX = { AVENUE: 'AVE', STREET: 'ST', DRIVE: 'DR', ROAD: 'RD', LANE: 'LN', COURT: 'CT', PLACE: 'PL', BOULEVARD: 'BLVD', TERRACE: 'TER', CIRCLE: 'CIR', PARKWAY: 'PKWY', HIGHWAY: 'HWY' };
function normStreet(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] || w).join(' ');
}

// Candidates are only those whose street is an exact match for one of the
// spellings. Among them: right map location (within 250 m), then right town,
// then a single statewide match (postal towns often differ from the tax town). Anything else comes
// back as "check" with the other matches so the agent can pick.
function pickMatch(candidates, city, geo, coords) {
  const exact = candidates.filter((c) => c.exact);
  if (!exact.length) return null;
  if (geo && coords) {
    const near = exact.map((c) => ({ c, d: coords[c.row.pams_pin] ? distance(geo, coords[c.row.pams_pin]) : Infinity })).sort((a, b) => a.d - b.d);
    if (near[0].d <= 250) return { row: near[0].c.row, confident: true };
  }
  const inTown = exact.filter((c) => townMatches(c.row.town, city || c.cityHint));
  if (inTown.length === 1) return { row: inTown[0].row, confident: true };
  if (exact.length === 1) return { row: exact[0].row, confident: true };
  return { row: (inTown[0] || exact[0]).row, confident: false };
}

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Asks workbench-score for a fresh public score. Three outcomes, kept apart
// so callers never cache a service failure as "this home has no score":
//   the score object   the function scored the parcel
//   null               the function answered and found nothing to score
//   { unavailable }    the function could not answer (error, rate limit,
//                      timeout, unreadable body)
// `client` is the x-client-info label the function logs, so app and
// extension traffic can be told apart when the shared rate limit trips.
const SCORE_UNAVAILABLE = Object.freeze({ unavailable: true });
async function scoreOnDemand(row, client = 'watchdog-extension/1.1') {
  try {
    const b = backend();
    const r = await fetch(`${b.url}/functions/v1/workbench-score`, {
      method: 'POST',
      headers: { apikey: b.key, 'Content-Type': 'application/json', Origin: H.CANONICAL_ORIGIN, 'x-client-info': client },
      body: JSON.stringify({ mode: 'public_score', rows: [{ pams_pin: row.pams_pin, town: row.town, county: row.county, block: row.block, lot: row.lot, qualifier: row.qualifier, assessed_value: row.assessed_value, last_year_tax: row.last_year_tax }] }),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return SCORE_UNAVAILABLE;
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.rows)) return SCORE_UNAVAILABLE;
    const s = j.rows.find((x) => x && x.pams_pin);
    if (!s || s.watchdog_score == null) return null;
    // The extension summary reads score/verdict/confidence; the app's JSON
    // route (watchdog-property) also needs the ROBUST parts and the source.
    return {
      score: s.watchdog_score, verdict: s.verdict || null, confidence: s.confidence || null,
      evidence_coverage: s.evidence_coverage != null ? s.evidence_coverage : null, model_version: s.model_version || null,
      components: s.components && typeof s.components === 'object' ? s.components : null,
      computed_at: s.observed_at || null, source: s.source || 'robust_on_demand'
    };
  } catch (_) {
    return SCORE_UNAVAILABLE;
  }
}

function summary(row, slug, score) {
  const v = H.view(row);
  const f = tc.townFacts(row, v);
  const assessed = n(row.assessed_value);
  const hu = ck.holdsUp(assessed || 0, f.ratio, f.upper);
  const by = H.billYear(row);
  const rc = tc.rateChange(f.trend);
  const agent = slug ? `&agent=${enc(slug)}` : '';
  const tcmp = row.town_compare || {};
  const sales = row.sales_summary || {};
  const s = score || row.score || null;
  return {
    pin: row.pams_pin, address: v.address, town: v.town, county: v.county,
    block: row.block || null, lot: row.lot || null, qualifier: row.qualifier || null,
    score: s && s.score != null ? Math.round(Number(s.score)) : null,
    score_verdict: s ? s.verdict || null : null, score_confidence: s ? s.confidence || null : null,
    tax: n(row.last_year_tax), tax_year: by.year,
    tax_current: by.current ? { year: by.current.year, amount: by.current.amount, general_rate_only: Boolean(by.current.generalRateOnly) } : null,
    assessed, land: n(row.land_value), improvement: n(row.improvement_value),
    town_median_tax: n(tcmp.median_tax), town_peers: n(tcmp.peers),
    share_paying_less: n(tcmp.share_paying_less),
    ratio: f.ratio, upper: f.upper, rate: f.rate, rate_year: f.rateYear,
    rate_trend: rc ? { from_year: rc.from.year, to_year: rc.to.year, per_year_pct: Math.round(rc.perYear * 10) / 10 } : null,
    implied_value: hu ? Math.round(hu.implied) : null,
    assessment_floor: hu ? Math.round(hu.floor) : null,
    revalued_2026: f.revalued2026,
    last_sale: n(row.last_sale_price) ? { price: n(row.last_sale_price), date: row.last_sale_date || null, year: row.last_sale_year || null } : null,
    nearby_sales: { count: n(sales.count), median: n(sales.median), since: sales.first_date || null,
      recent: (Array.isArray(row.recent_sales) ? row.recent_sales : []).slice(0, 3).map((x) => ({ address: H.titleCase(x.address), price: n(x.price), date: x.date || null })) },
    facts: { class: v.cls ? v.cls[0] : null, year_built: n(row.year_built), units: n(row.dwelling_units), acres: n(row.acres), building: row.building_desc || null },
    links: {
      property: H.CANONICAL_ORIGIN + v.path,
      true_cost: `${H.CANONICAL_ORIGIN}/true-cost?pin=${enc(row.pams_pin)}${agent}`,
      checkup: `${H.CANONICAL_ORIGIN}/checkup?pin=${enc(row.pams_pin)}${agent}`
    }
  };
}

async function findCandidates(b, parsed) {
  const tail = parsed.city ? `, ${parsed.city}, NJ` : ' NJ';
  const seen = new Map();
  for (const street of streetVariants(parsed.street)) {
    const found = await rest(b, 'rpc/search_parcels', { method: 'POST', body: JSON.stringify({ p_query: street + tail, p_limit: 8 }) });
    for (const row of Array.isArray(found.data) ? found.data : []) {
      const full = normStreet(street), own = normStreet(row.address);
      // URL-style addresses run the town into the street ("102 GRANT AVE HARRISON").
      const townPart = !parsed.city && full.startsWith(own + ' ') ? full.slice(own.length + 1) : '';
      const exact = own === full || Boolean(townPart);
      const prior = seen.get(row.pams_pin);
      if (!prior || (exact && !prior.exact)) seen.set(row.pams_pin, { row, exact, cityHint: townPart });
    }
    const list = [...seen.values()];
    if (list.some((c) => c.exact && townMatches(c.row.town, parsed.city || c.cityHint))) break;
  }
  return [...seen.values()];
}

// Map location of a few parcels, to tell apart exact street matches in
// different towns (the listing's own coordinates decide within 250 m). Only
// the pin and the coordinates are read; never the owner mailing ZIP.
async function parcelCoords(b, pins) {
  const list = pins.map((p) => `"${String(p).replace(/"/g, '')}"`).join(',');
  const c = await rest(b, `property_lookups?select=pams_pin,lat,lon&pams_pin=in.(${list})`);
  return Object.fromEntries((c.data || []).filter((r) => n(r.lat) != null && n(r.lon) != null).map((r) => [r.pams_pin, { lat: Number(r.lat), lon: Number(r.lon) }]));
}

const brief = (r) => ({ pin: r.pams_pin, address: H.titleCase(r.address), town: page.townName(r.town) });

// A parsed listing address to one parcel: street spellings, then the
// listing's map location, then the town. Gives the pin, whether the match is
// certain and up to 4 other candidates; with no match, no pin and the closest
// listings so the caller can offer a choice. Shared with the app's JSON route.
async function resolveAddress(b, parsed, lat, lon) {
  const candidates = await findCandidates(b, parsed);
  const geo = lat != null && lon != null && Math.abs(lat - 40) < 2 && Math.abs(lon + 74.5) < 2 ? { lat, lon } : null;
  const exact = candidates.filter((c) => c.exact);
  const coords = geo && exact.length > 1 ? await parcelCoords(b, exact.map((x) => x.row.pams_pin)) : null;
  const pick = pickMatch(candidates, parsed.city, geo, coords);
  const others = (exact.length ? exact : candidates).map((c) => c.row);
  if (!pick) return { pin: null, confident: false, alternatives: others.slice(0, 4).map(brief) };
  const pin = pick.row.pams_pin;
  return { pin, confident: pick.confident, alternatives: pick.confident ? [] : others.filter((r) => r.pams_pin !== pin).slice(0, 4).map(brief) };
}

async function lookup(req, res, query) {
  const supplied = String(req.headers['x-watchdog-key'] || '').trim();
  if (!supplied.startsWith(PREFIX) || supplied.length > 100) return json(res, 401, { error: 'Add your Watchdog extension key.' });
  const pinQuery = String(query.pin || '').trim();
  const parsed = pinQuery ? null : parseAddress(query.address);
  if (!pinQuery && !parsed) return json(res, 400, { error: 'Not a New Jersey street address.' });
  if (pinQuery && !/^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(pinQuery)) return json(res, 400, { error: 'Unknown property.' });
  const b = backend();
  const keys = await rest(b, `integration_api_keys?select=id,user_id&key_hash=eq.${sha256(supplied)}&provider=eq.${PROVIDER}&status=eq.active`);
  const key = (keys.data || [])[0];
  if (!key) return json(res, 401, { error: 'This key was replaced or revoked. Create a new one in the Agent Desk.' });
  const access = await agentAccess(b, key.user_id);
  if (!access.ok) return json(res, 403, { error: 'The browser extension is part of the Agent plan.' });
  if (!access.developer) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const used = await rest(b, `usage_events?select=id&user_id=eq.${enc(key.user_id)}&metric_key=eq.extension_lookup&occurred_at=gte.${enc(since)}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    const count = Number(String(used.headers.get('content-range') || '').split('/')[1]) || 0;
    if (count >= DAILY_LIMIT) return json(res, 429, { error: 'Daily lookup limit reached. It resets within 24 hours.' });
  }
  await Promise.all([
    rest(b, 'usage_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: key.user_id, metric_key: 'extension_lookup', quantity: 1, request_key: crypto.randomUUID(), metadata: {} }) }),
    rest(b, `integration_api_keys?id=eq.${enc(key.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) })
  ]);
  let pin = pinQuery, confident = true, alternatives = [];
  if (!pin) {
    const found = await resolveAddress(b, parsed, n(query.lat), n(query.lon));
    if (!found.pin) return json(res, 404, { error: 'Not found on the New Jersey tax list. New construction and some condos are not listed yet.', alternatives: found.alternatives });
    pin = found.pin;
    confident = found.confident;
    alternatives = found.alternatives;
  }
  const row = await page.fetchProperty(pin);
  if (!row) return json(res, 404, { error: 'Not found on the New Jersey tax list.' });
  // The extension summary shows no score when the scorer is unavailable; its
  // answers are never cached, so the next lookup asks again.
  const fresh = row.score && row.score.score != null ? null : await scoreOnDemand(row);
  const score = fresh && !fresh.unavailable ? fresh : null;
  return json(res, 200, { ok: true, confident, alternatives, property: summary(row, access.slug, score) });
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(typeof req.body === 'string' ? req.body : '{}'); } catch (_) { return {}; }
}

async function handler(req, res) {
  try {
    if (req.method === 'GET') return await lookup(req, res, req.query || {});
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.action !== 'create_key' && body.action !== 'revoke') return json(res, 400, { error: 'Unknown action.' });
      return await manageKey(req, res, body);
    }
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('watchdog-extension', err && err.message || err);
    return json(res, 503, { error: 'Watchdog is unavailable right now. Try again in a minute.' });
  }
}

module.exports = handler;
module.exports.parseAddress = parseAddress;
module.exports.pickMatch = pickMatch;
module.exports.streetVariants = streetVariants;
module.exports.normStreet = normStreet;
module.exports.findCandidates = findCandidates;
module.exports.summary = summary;
module.exports.PREFIX = PREFIX;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
// Shared with api/watchdog-property.js (the app's JSON route) so both routes
// verify sessions, meter usage, score and resolve addresses the same way.
module.exports.backend = backend;
module.exports.rest = rest;
module.exports.sessionUser = sessionUser;
module.exports.agentAccess = agentAccess;
module.exports.scoreOnDemand = scoreOnDemand;
module.exports.parcelCoords = parcelCoords;
module.exports.resolveAddress = resolveAddress;
module.exports.toNumber = n;
