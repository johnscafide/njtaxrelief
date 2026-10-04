// "Was this helpful?" votes on /co town pages (and the embedded lookup).
//   GET  /api/co-feedback?code=0713                     -> { up, down }
//   POST /api/co-feedback { code, vote: 1|-1|0, client } -> { up, down, vote }
// `client` is a random id the browser keeps in localStorage. The server stores only an HMAC of
// that id (supabase/migrations/20261004170000_co_town_votes.sql), so a vote can be changed or
// taken back from the same browser. The IP is used only, hashed, for the rate limit.
const crypto = require('crypto');

const CODE = /^\d{4}$/;
const CLIENT = /^[A-Za-z0-9-]{16,64}$/;
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const BUDGETS = [
  { bucket: 'co_vote_minute', seconds: 60, limit: 10 },
  { bucket: 'co_vote_hour', seconds: 3600, limit: 60 }
];

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key };
}
function headers(c) { return { apikey: c.key, Authorization: `Bearer ${c.key}`, Accept: 'application/json', 'Content-Type': 'application/json' }; }
function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function sameOrigin(req, host) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === host; } catch (_) { return false; }
}
function ip(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); }
function hmac(key, value) { return crypto.createHmac('sha256', key).update(value).digest('hex'); }
async function rpc(c, name, body) {
  const r = await fetch(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(c), body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name} http ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}
function tally(rows) {
  const row = Array.isArray(rows) ? rows[0] || {} : rows || {};
  return { up: Number(row.up) || 0, down: Number(row.down) || 0 };
}
async function allowed(c, hash) {
  for (const b of BUDGETS) {
    const rows = await rpc(c, 'consume_public_request_budget', { p_client_hash: hash, p_bucket: b.bucket, p_window_seconds: b.seconds, p_limit: b.limit });
    const row = Array.isArray(rows) ? rows[0] || {} : rows || {};
    if (row.allowed !== true) return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  const host = requestHost(req);
  if (!allowedHost(host)) { res.setHeader('Cache-Control', 'no-store'); return res.status(403).json({ error: 'Not allowed.' }); }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const code = String((req.query && req.query.code) || '').trim();
    if (!CODE.test(code)) { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'Invalid town.' }); }
    try {
      const counts = tally(await rpc(backend(), 'co_town_vote_tally', { p_code: code }));
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
      return res.status(200).json(counts);
    } catch (error) {
      console.error('co-feedback tally', error && error.message);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Not available right now.' });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!sameOrigin(req, host)) return res.status(403).json({ error: 'Not allowed.' });
  if (AUTOMATION_UA.test(String(req.headers['user-agent'] || ''))) return res.status(403).json({ error: 'Not allowed.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const code = String(body.code || '').trim();
  const client = String(body.client || '').trim();
  const vote = Number(body.vote);
  const addr = ip(req);
  if (!CODE.test(code) || !CLIENT.test(client) || ![-1, 0, 1].includes(vote) || !addr) return res.status(400).json({ error: 'Vote not accepted.' });
  try {
    const c = backend();
    if (!(await allowed(c, hmac(c.key, addr)))) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Too many votes for now. Please try again later.' }); }
    const counts = tally(await rpc(c, 'co_town_cast_vote', { p_code: code, p_voter: hmac(c.key, `co-vote|${client}`), p_vote: vote }));
    return res.status(200).json(Object.assign(counts, { vote }));
  } catch (error) {
    console.error('co-feedback vote', error && error.message);
    return res.status(500).json({ error: 'Watchdog couldn’t save that right now. Please try again.' });
  }
};
