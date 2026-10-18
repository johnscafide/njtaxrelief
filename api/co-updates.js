// "Get updates" on the /co town pages: email me when this town's CO requirements change.
//   POST /api/co-updates { code, email, role: homeowner|professional }  -> sign up (no confirm step)
//   GET|POST /co/updates/unsubscribe?t=...                             -> the link in every email
//   POST /api/co-updates?action=scan (x-co-updates-token)              -> hourly, from pg_cron
// The scan compares every published town on the live site with the last snapshot in Supabase and
// queues one email per subscriber of each town that changed. The co-update-sender edge function
// sends them. Tables and RPCs: supabase/migrations/20261018010000_co_town_updates.sql.
const crypto = require('crypto');
const T = require('./_co-town');
const P = require('./_co-pages');

const { ORIGIN, esc, countyLabel } = T;
const CODE = /^\d{4}$/;
const TOKEN = /^[0-9a-f]{32,96}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = new Set(['homeowner', 'professional']);
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const MAILING_ADDRESS = 'Watchdog, c/o Opus Elite Real Estate, 5001 Rt 42, Turnersville, NJ 08012';
const LOGO_PNG = `${ORIGIN}/property/images/watchdognewsletterlogo.png`;

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key };
}
async function rpc(b, name, args) {
  const r = await fetch(`${b.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: b.key, Authorization: `Bearer ${b.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name} http ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}
function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function sameOrigin(req, host) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === host; } catch (_) { return false; }
}
function clientHash(req, key) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  return ip ? crypto.createHmac('sha256', key).update(ip).digest('hex') : null;
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : await new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 4000) { s = ''; req.destroy(); } });
    req.on('end', () => resolve(s));
    req.on('error', () => resolve(''));
  });
  raw = String(raw || '');
  if (/^\s*\{/.test(raw)) { try { return JSON.parse(raw); } catch (_) { return null; } }
  return Object.fromEntries(new URLSearchParams(raw));
}
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function sendPage(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(html);
}

// ---------- what counts as a change ----------
// Only what the town page shows. "Last checked" dates, sources and the how-to-apply notes
// can move on every re-check without anything changing for a seller.
function feeList(fees) { return (fees || []).map((f) => ({ label: f.label, amount: f.amount })); }
function watched(d) {
  return {
    co: {
      status: d.co.status, name: d.co.name, issued_by: d.co.issued_by, lead_time: d.co.lead_time, valid_for: d.co.valid_for,
      requirements: d.co.requirements, fees: feeList(d.co.fees), phone: d.co.phone,
      application_url: d.co.application_url, department_url: d.co.department_url
    },
    fire: {
      requirements: d.fire.requirements,
      authorities: d.fire.authorities.map((a) => ({
        name: a.name, area_served: a.area_served, lead_time: a.lead_time, fees: feeList(a.fees), phone: a.phone,
        application_url: a.application_url, department_url: a.department_url
      }))
    }
  };
}
function fingerprint(snap) { return crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex'); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function feeText(fees) { return fees.length ? fees.map((f) => [f.label, f.amount].filter(Boolean).join(': ')).join('; ') : 'none listed'; }
const STATUS_LINE = {
  required: 'A resale CO is now required.',
  not_required: 'A resale CO is no longer required.',
  not_found: 'The resale CO rules are being checked again.'
};

// Plain lines for the email, newest values only.
function changeLines(before, now) {
  const lines = [];
  const b = before.co || {}, n = now.co;
  if (b.status !== n.status) lines.push(STATUS_LINE[n.status]);
  if (!same(b.fees, n.fees)) lines.push(`CO fees: ${feeText(n.fees)}`);
  if (!same(b.requirements, n.requirements)) lines.push('CO requirements changed.');
  if (b.lead_time !== n.lead_time && n.lead_time) lines.push(`CO timing: ${n.lead_time}`);
  if (b.valid_for !== n.valid_for && n.valid_for) lines.push(`CO good for: ${n.valid_for}`);
  if (b.issued_by !== n.issued_by && n.issued_by) lines.push(`CO issued by: ${n.issued_by}`);
  if (b.phone !== n.phone && n.phone) lines.push(`CO office phone: ${n.phone}`);
  if (b.application_url !== n.application_url && n.application_url) lines.push('New CO application link.');

  const bf = before.fire || {}, nf = now.fire;
  if (!same(bf.requirements, nf.requirements)) lines.push('Smoke and CO alarm requirements changed.');
  const old = new Map((bf.authorities || []).map((a) => [a.name, a]));
  const many = nf.authorities.length > 1;
  nf.authorities.forEach((a) => {
    const o = old.get(a.name);
    const who = many ? ` (${a.name})` : '';
    if (!o) { lines.push(`Smoke and CO alarm certificates now come from ${a.name}.`); return; }
    if (!same(o.fees, a.fees)) lines.push(`Smoke and CO alarm fees${who}: ${feeText(a.fees)}`);
    if (o.lead_time !== a.lead_time && a.lead_time) lines.push(`Smoke and CO alarm timing${who}: ${a.lead_time}`);
    if (o.phone !== a.phone && a.phone) lines.push(`Smoke and CO alarm office phone${who}: ${a.phone}`);
  });
  if (!lines.length) lines.push('Some details on the page changed.');
  return lines.slice(0, 10);
}

// ---------- the email ----------
const NAVY = '#0e2248', MUTED = '#5d6877', LINE = '#e3e7ec', BLUE = '#0d3dbe';
function townLink(t) {
  const q = new URLSearchParams({ utm_source: 'co_updates', utm_medium: 'email', utm_campaign: 'co_town_change' });
  return `${ORIGIN}${t.path}?${q}`;
}
function changeEmail(t, lines, isNew) {
  const where = `${esc(t.name)} (${esc(countyLabel(t.county))})`;
  const subject = isNew ? `${t.name} CO requirements are now on Watchdog` : `${t.name} CO requirements changed`;
  const intro = isNew ? `The resale CO requirements for <b>${where}</b> are now on Watchdog.` : `The resale CO requirements for <b>${where}</b> changed.`;
  const list = isNew ? '' : `<ul style="margin:0 0 20px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:${NAVY};font-size:15px;line-height:1.55;max-width:560px">
<p style="margin:0 0 20px"><img src="${LOGO_PNG}" alt="Watchdog" width="150" style="display:block;width:150px;height:auto;border:0"></p>
<p style="margin:0 0 14px">${intro}</p>
${list}<p style="margin:0 0 20px"><a href="${esc(townLink(t))}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${BLUE};color:#ffffff;font-weight:600;text-decoration:none">${isNew ? 'See the requirements' : 'See what changed'}</a></p>
<p style="margin:0;color:${MUTED};font-size:13px">Requirements can change. Confirm with the town before closing.</p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED}">You get this email because you asked Watchdog for CO updates for ${esc(t.name)}. ${esc(MAILING_ADDRESS)}. <a href="{{unsubscribe_url}}" style="color:${MUTED}">Unsubscribe</a></p>
</div>`;
  return { subject, html };
}

// ---------- hourly scan ----------
async function scan(b) {
  const towns = T.towns();
  const live = towns.all.filter((t) => t.published).map((t) => {
    const d = T.townData(t.code, towns.approvals);
    if (!d) return null;
    const snap = watched(d);
    return { t, snap, fp: fingerprint(snap) };
  }).filter(Boolean);
  const stored = new Map((await rpc(b, 'co_town_fingerprints', {}) || []).map((r) => [r.municipality_code, r.fingerprint]));
  const seeding = stored.size === 0;
  const moved = live.filter((x) => stored.get(x.t.code) !== x.fp);
  const known = moved.filter((x) => stored.has(x.t.code)).map((x) => x.t.code);
  const before = new Map();
  for (let i = 0; i < known.length; i += 100) {
    (await rpc(b, 'co_town_snapshots_for', { p_codes: known.slice(i, i + 100) }) || []).forEach((r) => before.set(r.municipality_code, r.snapshot));
  }
  let queued = 0, enabled = false;
  for (let i = 0; i < moved.length; i += 50) {
    const rows = moved.slice(i, i + 50).map((x) => {
      const row = { code: x.t.code, fingerprint: x.fp, snapshot: x.snap, notify: !seeding };
      if (!seeding) {
        const prev = before.get(x.t.code);
        Object.assign(row, changeEmail(x.t, prev ? changeLines(prev, x.snap) : [], !prev));
      }
      return row;
    });
    const out = await rpc(b, 'record_co_town_changes', { p_rows: rows }) || {};
    queued += Number(out.queued) || 0;
    enabled = out.enabled === true;
  }
  return { ok: true, towns: live.length, changed: moved.length, seeding, queued, enabled };
}

// ---------- sign up ----------
const SIGNUP_ERRORS = {
  invalid_email: [400, 'Please enter a valid email.'],
  invalid_role: [400, 'Pick homeowner or agent or pro.'],
  unknown_town: [404, 'We couldn’t find that town.'],
  rate_limited: [429, 'Too many sign-ups from this connection. Please try again in an hour.']
};
async function subscribe(req, res) {
  const host = requestHost(req);
  if (!allowedHost(host) || !sameOrigin(req, host) || AUTOMATION_UA.test(String(req.headers['user-agent'] || ''))) return json(res, 403, { error: 'Not allowed.' });
  const body = await readBody(req);
  if (!body) return json(res, 400, { error: 'Invalid request.' });
  const code = String(body.code || '').trim();
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const role = String(body.role || '').trim();
  if (!CODE.test(code) || !T.towns().byCode.has(code)) return json(res, 404, { error: SIGNUP_ERRORS.unknown_town[1] });
  if (!EMAIL.test(email)) return json(res, 400, { error: SIGNUP_ERRORS.invalid_email[1] });
  if (!ROLES.has(role)) return json(res, 400, { error: SIGNUP_ERRORS.invalid_role[1] });
  if (String(body.website || '').trim()) return json(res, 200, { ok: true });
  let b;
  try { b = backend(); } catch (_) { return json(res, 503, { error: 'Updates aren’t available right now.' }); }
  try {
    const source = ['page', 'embed'].includes(body.source) ? body.source : 'page';
    const out = await rpc(b, 'subscribe_co_updates', { p_code: code, p_email: email, p_role: role, p_source: source, p_client_hash: clientHash(req, b.key) });
    if (out && out.ok) return json(res, 200, { ok: true });
    const [status, error] = SIGNUP_ERRORS[out && out.error] || [500, 'Something went wrong. Please try again.'];
    return json(res, status, { error });
  } catch (err) {
    console.error('co-updates subscribe', err && err.message);
    return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}

// ---------- unsubscribe ----------
// The email link opens a page with a button; mail scanners follow links on their own.
async function unsubscribe(req, res) {
  const body = req.method === 'POST' ? await readBody(req) : null;
  const token = String((body && body.t) || (req.query && req.query.t) || '').trim().toLowerCase();
  if (!TOKEN.test(token)) return sendPage(res, 400, P.messagePage('That link didn’t work', 'It may be missing part of the address. Try the link in the email again.'));
  if (req.method !== 'POST') {
    const form = `<form method="post" action="/co/updates/unsubscribe"><input type="hidden" name="t" value="${esc(token)}"><button class="go" type="submit">Unsubscribe</button></form>`;
    return sendPage(res, 200, P.messagePage('Stop CO update emails?', 'Press the button and we’ll stop emailing you about this town.', form));
  }
  let b;
  try { b = backend(); } catch (_) { return sendPage(res, 503, P.messagePage('Please try again later', 'Updates aren’t available right now.')); }
  try {
    const out = await rpc(b, 'unsubscribe_co_updates', { p_token: token });
    if (!out || !out.ok) return sendPage(res, 410, P.messagePage('That link didn’t work', 'It may already have been used.'));
    const t = T.towns().byCode.get(out.municipality_code);
    const back = t ? `<p class="more"><a href="${esc(t.path)}">Back to ${esc(t.name)}</a></p>` : '';
    return sendPage(res, 200, P.messagePage('You’re unsubscribed', t ? `You won’t get any more CO update emails for ${esc(t.name)}.` : 'You won’t get any more CO update emails for this town.', back));
  } catch (err) {
    console.error('co-updates unsubscribe', err && err.message);
    return sendPage(res, 500, P.messagePage('Something went wrong', 'Please try the link again in a minute.'));
  }
}

async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const action = String((req.query && req.query.action) || '');
  if (action === 'unsubscribe') {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, POST'); return sendPage(res, 405, 'Method not allowed'); }
    return unsubscribe(req, res);
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'POST required' }); }
  if (action === 'scan') {
    const token = String(req.headers['x-co-updates-token'] || '');
    let b;
    try { b = backend(); } catch (_) { return json(res, 503, { error: 'Unavailable' }); }
    try {
      if (token.length < 32 || (await rpc(b, 'verify_co_updates_worker', { p_token: token })) !== true) return json(res, 401, { error: 'Unauthorized' });
      return json(res, 200, await scan(b));
    } catch (err) {
      console.error('co-updates scan', err && err.message);
      return json(res, 500, { error: 'Scan failed' });
    }
  }
  return subscribe(req, res);
}

module.exports = handler;
module.exports.watched = watched;
module.exports.fingerprint = fingerprint;
module.exports.changeLines = changeLines;
module.exports.changeEmail = changeEmail;
module.exports.scan = scan;
