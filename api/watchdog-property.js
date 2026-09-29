'use strict';

// Property JSON for the Watchdog Android app.
//   GET /api/watchdog-property?pin=<pams_pin>
//   GET /api/watchdog-property?address=<listing address>[&lat=&lon=][&price=]
//   with Authorization: Bearer <Supabase access token>.
// Returns the same public-record row the property page renders, plus the
// derived numbers the page and the true-cost/checkup cards already compute,
// so the app never re-implements them. There is no plan gate: the HTML page
// serves this data to anyone. Every call is tied to the signed-in account and
// capped per UTC day, so the route cannot be used as a bulk feed.
// Owner names and mailing addresses are never stored. The owner mailing ZIP
// (property_lookups.zip) and the private photo storage key are never returned;
// the response is built field by field, never by spreading the database row.

const crypto = require('crypto');
const page = require('./watchdog-property-page');
const ext = require('./watchdog-extension');
const tc = require('./watchdog-true-cost');
const ck = require('./watchdog-checkup');

const H = page.helpers;
const PIN = /^\d{4}_[0-9A-Za-z.&_-]{1,70}$/;
const METRIC = 'app_property_lookup';
const DAILY_LIMIT = 2000;
const enc = encodeURIComponent;
const num = ext.toNumber;

// One place for headers. Success is cacheable only by the caller (the token
// is per user); everything else is not cached. HEAD gets headers only.
function send(req, res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
}

// Start of the current UTC day and the seconds left until the next one.
function utcDay(now) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { since: new Date(start).toISOString(), resetIn: Math.max(1, Math.ceil((start + 86400000 - now.getTime()) / 1000)) };
}

// Same meter as the browser extension (usage_events), under its own metric
// key so app lookups never eat into the extension allowance. One row per call,
// written before the lookup so misses count too.
async function usedToday(b, userId, since) {
  const used = await ext.rest(b, `usage_events?select=id&user_id=eq.${enc(userId)}&metric_key=eq.${METRIC}&occurred_at=gte.${enc(since)}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
  return Number(String(used.headers.get('content-range') || '').split('/')[1]) || 0;
}

function recordUse(b, userId, how) {
  return ext.rest(b, 'usage_events', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, metric_key: METRIC, quantity: 1, request_key: crypto.randomUUID(), metadata: { lookup: how } })
  });
}

// One score shape for the app: the cached ROBUST row when there is one,
// otherwise the fresh public score. Components become bare 0-100 integers
// (or null) whatever shape the cache stored them in.
function scoreBlock(row, fresh) {
  const cached = row.score && row.score.score != null ? row.score : null;
  const s = cached || fresh;
  if (!s || s.score == null) return null;
  const parts = s.components && typeof s.components === 'object' ? s.components : {};
  const components = {};
  for (const d of H.DIMENSIONS) components[d.key] = H.componentScore(parts[d.key]);
  return {
    score: Math.round(Number(s.score)),
    verdict: s.verdict || null,
    confidence: s.confidence || null,
    evidence_coverage: num(s.evidence_coverage),
    model_version: s.model_version || null,
    computed_at: s.computed_at || null,
    source: s.source || (cached ? 'robust_public_cache' : 'robust_on_demand'),
    components
  };
}

// The public-record row, field by field. Numbers are numbers or null.
function propertyBlock(row, geo, score) {
  const tcmp = row.town_compare || null;
  const sum = row.sales_summary || null;
  const neighbors = Array.isArray(row.neighbors) ? row.neighbors : [];
  const sales = Array.isArray(row.recent_sales) ? row.recent_sales : [];
  return {
    pams_pin: row.pams_pin,
    address: row.address || null, town: row.town || null, county: row.county || null,
    block: row.block || null, lot: row.lot || null, qualifier: row.qualifier || null, prop_class: row.prop_class || null,
    year_built: num(row.year_built), acres: num(row.acres), dwelling_units: num(row.dwelling_units), building_desc: row.building_desc || null,
    land_value: num(row.land_value), improvement_value: num(row.improvement_value), assessed_value: num(row.assessed_value), last_year_tax: num(row.last_year_tax),
    last_sale_price: num(row.last_sale_price), last_sale_date: row.last_sale_date || null, last_sale_year: num(row.last_sale_year),
    source_synced_at: row.source_synced_at || null,
    lat: geo ? geo.lat : null, lon: geo ? geo.lon : null,
    score,
    town_compare: tcmp ? { peers: num(tcmp.peers), median_tax: num(tcmp.median_tax), median_assessed: num(tcmp.median_assessed), share_paying_less: num(tcmp.share_paying_less), refreshed_at: tcmp.refreshed_at || null } : null,
    neighbors: neighbors.filter((x) => x && x.pams_pin).map((x) => ({ pams_pin: x.pams_pin, address: x.address || null, town: x.town || row.town || null, assessed_value: num(x.assessed_value), last_year_tax: num(x.last_year_tax) })),
    recent_sales: sales.filter((x) => x && x.pams_pin).map((x) => ({ pams_pin: x.pams_pin, address: x.address || null, town: x.town || row.town || null, price: num(x.price), date: x.date || null, year_built: num(x.year_built), assessed_value: num(x.assessed_value), same_street: Boolean(x.same_street) })),
    sales_summary: { count: num(sum && sum.count) || 0, median: num(sum && sum.median), first_date: (sum && sum.first_date) || null, last_date: (sum && sum.last_date) || null },
    alerts_enabled: row.alerts_enabled === true
  };
}

// The true-cost card's verdict for a listing price, from the same numbers the
// card uses: the bill moved to the newest rate when its year is known.
function priceCheckBlock(row, v, f, by, price) {
  if (!(price > 0)) return null;
  const assessed = num(row.assessed_value) || 0;
  const listed = num(row.last_year_tax) || 0;
  const bill = listed > 0 ? listed : (assessed && f.rate ? assessed * f.rate / 100 : 0);
  const tax = by.current && !by.current.generalRateOnly ? by.current.amount : bill;
  const check = tc.priceCheck({ price, assessed, tax, ratio: f.ratio, upper: f.upper, rate: f.rate });
  const verdict = tc.verdictText(check, v.town);
  return { verdict: verdict.title, expected_tax: check && check.typical > 0 ? Math.round(check.typical) : null, text: verdict.body };
}

// Everything the page, true-cost and checkup work out from the row. Each
// block is null exactly when its helper has nothing (no town rate table, no
// certified ratio, no assessment).
function derivedBlock(row, v, f, price, slug) {
  const ts = H.taxStats(row, H.money);
  const by = ts.by;
  const rc = tc.rateChange(f.trend);
  const hu = ck.holdsUp(num(row.assessed_value) || 0, f.ratio, f.upper);
  const agent = slug ? `&agent=${enc(slug)}` : '';
  return {
    display: { address: v.address, town: v.town, county: v.county, class_label: v.cls ? v.cls[0] : null, property_path: v.path },
    bill: { year: by.year, label: ts.label, current: by.current ? { year: by.current.year, amount: by.current.amount, general_rate_only: Boolean(by.current.generalRateOnly) } : null },
    rate_trend: f.trend ? { points: f.trend.points, latest: f.trend.latest, first: f.trend.first, cut_at_reval: Boolean(f.trend.cutAtReval) } : null,
    rate_change: rc ? { from_year: rc.from.year, to_year: rc.to.year, per_year_pct: Math.round(rc.perYear * 10) / 10 } : null,
    chapter123: f.ratio != null ? { district: f.district, tax_year: f.ratioYear, ratio: f.ratio, lower: f.lower, upper: f.upper } : null,
    revalued_2026: Boolean(f.revalued2026),
    holds_up: hu ? { floor: Math.round(hu.floor), implied: Math.round(hu.implied), limit: hu.limit, ratio: hu.ratio } : null,
    town_compare_text: H.townCompareText(row, v) || null,
    next_deadline: ck.nextDeadline(new Date(), f.revalued2026),
    price_check: priceCheckBlock(row, v, f, by, price),
    links: {
      property: H.CANONICAL_ORIGIN + v.path,
      true_cost: `${H.CANONICAL_ORIGIN}/true-cost?pin=${enc(row.pams_pin)}${agent}`,
      checkup: `${H.CANONICAL_ORIGIN}/checkup?pin=${enc(row.pams_pin)}${agent}`
    }
  };
}

async function lookup(req, res, query) {
  // Cheap checks first (no backend call): a token must be present, and the
  // request must name a property.
  if (!/^Bearer\s+\S/i.test(String(req.headers.authorization || ''))) return send(req, res, 401, { error: 'Sign in again.' });
  const pinQuery = String(query.pin || '').trim();
  const address = String(query.address || '').trim();
  if (!pinQuery && !address) return send(req, res, 400, { error: 'Unknown property.' });
  if (pinQuery && !PIN.test(pinQuery)) return send(req, res, 400, { error: 'Unknown property.' });
  const parsed = pinQuery ? null : ext.parseAddress(address);
  if (!pinQuery && !parsed) return send(req, res, 400, { error: 'Not a New Jersey street address.' });

  // Who is asking. Same session check as the extension key API; the plan is
  // read only for the agent link slug and the developer exemption from the cap.
  const b = ext.backend();
  const user = await ext.sessionUser(b, req);
  if (!user) return send(req, res, 401, { error: 'Sign in again.' });
  const access = await ext.agentAccess(b, user.id);
  const day = utcDay(new Date());
  if (!access.developer && (await usedToday(b, user.id, day.since)) >= DAILY_LIMIT) {
    res.setHeader('Retry-After', String(day.resetIn));
    return send(req, res, 429, { error: 'Daily lookup limit reached. It resets at midnight UTC.' });
  }
  await recordUse(b, user.id, pinQuery ? 'pin' : 'address');

  // Which property. An address goes through the extension's matcher, with
  // the listing's map location (when the app has one) breaking ties.
  let pin = pinQuery, match = null;
  if (!pin) {
    match = await ext.resolveAddress(b, parsed, num(query.lat), num(query.lon));
    if (!match.pin) return send(req, res, 404, { error: 'Not found on the New Jersey tax list.', alternatives: match.alternatives });
    pin = match.pin;
  }
  const row = await page.fetchProperty(pin);
  if (!row) return send(req, res, 404, { error: 'Not found on the New Jersey tax list.' });

  // Score when the cache has none, the parcel's coordinates (not in the row)
  // and a signed photo link, in parallel. Coordinates and photo are extras,
  // so their failure never fails the row.
  const [fresh, coords, photoUrl] = await Promise.all([
    row.score && row.score.score != null ? null : ext.scoreOnDemand(row),
    ext.parcelCoords(b, [pin]).catch((err) => { console.warn('watchdog-property coords', err && err.message || err); return {}; }),
    page.signPhoto(row.photo_path)
  ]);
  const v = H.view(row);
  const f = tc.townFacts(row, v);
  const body = {
    ok: true,
    property: propertyBlock(row, coords[pin] || null, scoreBlock(row, fresh)),
    photo_url: photoUrl || null,
    derived: derivedBlock(row, v, f, tc.readInputs(query).price, access.ok ? access.slug : null)
  };
  if (match) {
    body.confident = match.confident;
    body.alternatives = match.alternatives;
  }
  return send(req, res, 200, body, 'private, max-age=300');
}

async function handler(req, res) {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') return await lookup(req, res, req.query || {});
    res.setHeader('Allow', 'GET, HEAD');
    return send(req, res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('watchdog-property', err && err.message || err);
    res.setHeader('Retry-After', '60');
    return send(req, res, 503, { error: 'Watchdog is unavailable right now. Try again in a minute.' }, 'no-store');
  }
}

module.exports = handler;
module.exports.scoreBlock = scoreBlock;
module.exports.METRIC = METRIC;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
