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

async function rest(b, pathname, init = {}) {
  const r = await fetch(`${b.url}/rest/v1/${pathname}`, {
    ...init,
    headers: { apikey: b.key, Authorization: `Bearer ${b.key}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(6000)
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
  return { ok, slug: p.vanity_slug || null };
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

// Listing sites write "102 Grant Ave, Harrison, NJ 07029". Postal towns often
// differ from the tax municipality, so a town match is preferred, not required.
function pickMatch(rows, city) {
  if (!rows.length) return null;
  const c = String(city || '').toUpperCase().replace(/[^A-Z ]/g, '').trim();
  if (c) {
    const hit = rows.find((r) => String(r.town || '').toUpperCase().startsWith(c));
    if (hit) return hit;
  }
  return rows[0];
}

function parseAddress(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const m = s.match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+[^,]+?),\s*([^,]+?),\s*(?:NJ|New Jersey)\b/i);
  if (m) return { street: m[1], city: m[2], query: `${m[1]}, ${m[2]}, NJ` };
  return /^\d/.test(s) ? { street: s, city: '', query: s } : null;
}

function summary(row, slug) {
  const v = H.view(row);
  const f = tc.townFacts(row, v);
  const hu = ck.holdsUp(Number(row.assessed_value) || 0, f.ratio, f.upper);
  const agent = slug ? `&agent=${enc(slug)}` : '';
  const tcmp = row.town_compare || {};
  return {
    pin: row.pams_pin, address: v.address, town: v.town, county: v.county,
    tax: Number(row.last_year_tax) || null, assessed: Number(row.assessed_value) || null,
    score: row.score && row.score.score != null ? Math.round(Number(row.score.score)) : null,
    town_median_tax: tcmp.median_tax || null, town_peers: tcmp.peers || null,
    share_paying_less: tcmp.share_paying_less != null ? Number(tcmp.share_paying_less) : null,
    ratio: f.ratio, rate: f.rate, rate_year: f.rateYear,
    assessment_floor: hu ? Math.round(hu.floor) : null,
    revalued_2026: f.revalued2026,
    links: {
      property: H.CANONICAL_ORIGIN + v.path,
      true_cost: `${H.CANONICAL_ORIGIN}/true-cost?pin=${enc(row.pams_pin)}${agent}`,
      checkup: `${H.CANONICAL_ORIGIN}/checkup?pin=${enc(row.pams_pin)}${agent}`
    }
  };
}

async function lookup(req, res, query) {
  const supplied = String(req.headers['x-watchdog-key'] || '').trim();
  if (!supplied.startsWith(PREFIX) || supplied.length > 100) return json(res, 401, { error: 'Add your Watchdog extension key.' });
  const parsed = parseAddress(query.address);
  if (!parsed) return json(res, 400, { error: 'Not a New Jersey street address.' });
  const b = backend();
  const keys = await rest(b, `integration_api_keys?select=id,user_id&key_hash=eq.${sha256(supplied)}&provider=eq.${PROVIDER}&status=eq.active`);
  const key = (keys.data || [])[0];
  if (!key) return json(res, 401, { error: 'This key was replaced or revoked. Create a new one in the Agent Desk.' });
  const access = await agentAccess(b, key.user_id);
  if (!access.ok) return json(res, 403, { error: 'The browser extension is part of the Agent plan.' });
  const since = new Date(Date.now() - 86400000).toISOString();
  const used = await rest(b, `usage_events?select=id&user_id=eq.${enc(key.user_id)}&metric_key=eq.extension_lookup&occurred_at=gte.${enc(since)}`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
  const count = Number(String(used.headers.get('content-range') || '').split('/')[1]) || 0;
  if (count >= DAILY_LIMIT) return json(res, 429, { error: 'Daily lookup limit reached. It resets within 24 hours.' });
  await Promise.all([
    rest(b, 'usage_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: key.user_id, metric_key: 'extension_lookup', quantity: 1, request_key: crypto.randomUUID(), metadata: {} }) }),
    rest(b, `integration_api_keys?id=eq.${enc(key.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) })
  ]);
  const found = await rest(b, 'rpc/search_parcels', { method: 'POST', body: JSON.stringify({ p_query: parsed.query, p_limit: 5 }) });
  const match = pickMatch(Array.isArray(found.data) ? found.data : [], parsed.city);
  if (!match) return json(res, 404, { error: 'Not found on the New Jersey tax list.' });
  const row = await page.fetchProperty(match.pams_pin);
  if (!row) return json(res, 404, { error: 'Not found on the New Jersey tax list.' });
  return json(res, 200, { ok: true, property: summary(row, access.slug) });
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
module.exports.summary = summary;
module.exports.PREFIX = PREFIX;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
