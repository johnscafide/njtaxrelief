// Town Needs submissions (/town-needs). Anyone with the link can send what they know about a
// red-flag town's CO or fire certificate rules. Every submission needs a document or an official
// https link; a typed answer alone is not accepted. Uploads go straight to a private Storage
// bucket through a one-time signed upload URL, then `finish` checks the file really is a PDF or an
// image. Nothing here is shown to agents: the owner reviews each submission in Backoffice
// (api/watchdog-backoffice-town-needs.js) and approved info goes through the usual publish step.
const crypto = require('crypto');
const NEEDS = require('../property/data/municipal-requirements/town-needs.json');

const BUCKET = 'town-info-submissions';
const MAX_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const BUDGETS = [
  { bucket: 'town_needs_minute', seconds: 60, limit: 4 },
  { bucket: 'town_needs_hour', seconds: 3600, limit: 12 },
  { bucket: 'town_needs_day', seconds: 86400, limit: 30 }
];
// One shared cap across everyone, so a flood of uploads can't run up storage.
const GLOBAL_BUDGET = { bucket: 'town_needs_all_day', seconds: 86400, limit: 100 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOWNS = new Map((NEEDS.towns || []).map((t) => [t.code, t]));
// The /co lookup lets visitors add CO requirements for any NJ town, including towns not
// researched yet. Those aren't in town-needs.json, so every need is open for them.
const ALL_TOWNS = new Map((require('../co/towns.json').towns || []).map((t) => [t.c, { code: t.c, town: t.n, needs: Object.keys(NEEDS.needs || {}) }]));

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key };
}
function headers(c, extra) { return Object.assign({ apikey: c.key, Authorization: `Bearer ${c.key}`, Accept: 'application/json' }, extra || {}); }
function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function sameOrigin(req, host) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  try { return new URL(origin).hostname.toLowerCase() === host; } catch (_) { return false; }
}
function clientHash(req, key) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return ip ? crypto.createHmac('sha256', key).update(ip).digest('hex') : '';
}
async function rpc(c, name, body) {
  const r = await fetch(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(c, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${name} http ${r.status} ${t.slice(0, 160)}`);
  return t ? JSON.parse(t) : null;
}
async function securityEvent(c, type, hash, detail) {
  try {
    await rpc(c, 'record_public_request_security_event', { p_event_type: type, p_client_hash: hash || null, p_route: '/api/watchdog-town-needs', p_scope: null, p_automation_hint: type === 'automation_client_blocked', p_detail: detail || {} });
  } catch (e) { console.error('watchdog-town-needs security-event', e.message); }
}
async function allowed(c, hash, budgets) {
  for (const b of budgets) {
    const rows = await rpc(c, 'consume_public_request_budget', { p_client_hash: b === GLOBAL_BUDGET ? crypto.createHash('sha256').update('town-needs-all').digest('hex') : hash, p_bucket: b.bucket, p_window_seconds: b.seconds, p_limit: b.limit });
    const row = Array.isArray(rows) ? rows[0] || {} : rows || {};
    if (row.allowed !== true) return false;
  }
  return true;
}
function safeFileName(name, type) {
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[type];
  const base = String(name || 'document').replace(/\.[A-Za-z0-9]{1,5}$/, '').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'document';
  return `${base}.${ext}`;
}
function httpsUrl(v) {
  const s = clean(v, 1000);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.username || u.password) return null;
    return u.toString();
  } catch (_) { return null; }
}
// The first bytes of the file decide whether it really is a PDF or an image.
function sniff(bytes) {
  const b = Buffer.from(bytes);
  const ascii = b.toString('latin1');
  if (ascii.slice(0, 1024).includes('%PDF-')) return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (ascii.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii.slice(8, 12))) return 'image/heic';
  return '';
}
function sameFamily(declared, found) {
  if (!found) return false;
  if (found === 'image/heic') return declared === 'image/heic' || declared === 'image/heif';
  return declared === found;
}

async function start(req, res, c, hash, body) {
  if (clean(body.website, 200)) return res.status(200).json({ ok: true, id: crypto.randomUUID() });
  if (Number(body.elapsed_ms) < 3000) return res.status(422).json({ error: 'Please take a moment to fill in the form, then send it again.' });
  const code = clean(body.code, 4);
  const town = TOWNS.get(code) || ALL_TOWNS.get(code);
  if (!town) return res.status(422).json({ error: 'Pick a town from the list.' });
  const needKeys = Array.from(new Set((Array.isArray(body.needs) ? body.needs : []).map((k) => clean(k, 20)))).filter((k) => town.needs.includes(k));
  if (!needKeys.length) return res.status(422).json({ error: 'Pick at least one item you can help with.' });
  const answer = String(body.answer == null ? '' : body.answer).trim().slice(0, 2000);
  const sourceUrl = httpsUrl(body.source_url);
  if (sourceUrl === null) return res.status(422).json({ error: 'The link must be a full web address that starts with https://.' });
  let file = null;
  if (body.file && typeof body.file === 'object') {
    const type = clean(body.file.type, 40).toLowerCase();
    const size = Number(body.file.size);
    if (!FILE_TYPES.has(type)) return res.status(422).json({ error: 'Upload a PDF or a photo (JPG, PNG, WebP or HEIC).' });
    if (!Number.isFinite(size) || size < 1 || size > MAX_BYTES) return res.status(422).json({ error: 'The file must be 10 MB or smaller.' });
    file = { type, size: Math.round(size), name: clean(body.file.name, 200) || 'document' };
  }
  if (!file && !sourceUrl) return res.status(422).json({ error: 'Add the town’s document or a link to the town’s page. A typed answer alone isn’t enough.' });
  const email = clean(body.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: 'Check the email address.' });
  const id = crypto.randomUUID();
  const path = file ? `pending/${id}/${safeFileName(file.name, file.type)}` : null;
  const row = {
    id, municipality_code: code, municipality_name: town.town, need_keys: needKeys, answer,
    source_url: sourceUrl || null, file_path: path, file_name: file ? file.name : null, file_type: file ? file.type : null,
    file_size: file ? file.size : null, file_status: file ? 'awaiting_upload' : 'none',
    submitter_name: clean(body.name, 120) || null, submitter_email: email || null, submitter_role: clean(body.role, 80) || null,
    client_hash: hash
  };
  const ins = await fetch(`${c.url}/rest/v1/town_info_submissions`, { method: 'POST', headers: headers(c, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(row) });
  if (!ins.ok) { console.error('watchdog-town-needs insert', ins.status, (await ins.text()).slice(0, 200)); return res.status(500).json({ error: 'Watchdog couldn’t save this right now. Please try again.' }); }
  if (!file) return res.status(201).json({ ok: true, id });
  const sign = await fetch(`${c.url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: headers(c, { 'Content-Type': 'application/json' }), body: '{}' });
  const signed = await sign.json().catch(() => ({}));
  if (!sign.ok || !signed.url) { console.error('watchdog-town-needs sign', sign.status, JSON.stringify(signed).slice(0, 200)); return res.status(500).json({ error: 'Watchdog couldn’t get the upload ready. Please try again.' }); }
  return res.status(201).json({ ok: true, id, upload_url: `${c.url}/storage/v1${signed.url}` });
}

async function finish(req, res, c, body) {
  const id = clean(body.id, 40);
  if (!UUID.test(id)) return res.status(422).json({ error: 'Unknown submission.' });
  const q = await fetch(`${c.url}/rest/v1/town_info_submissions?id=eq.${id}&select=id,file_path,file_type,file_status,source_url`, { headers: headers(c) });
  const row = (await q.json().catch(() => []))[0];
  if (!row || !row.file_path) return res.status(404).json({ error: 'Unknown submission.' });
  if (row.file_status !== 'awaiting_upload') return res.status(200).json({ ok: row.file_status === 'uploaded' });
  const obj = await fetch(`${c.url}/storage/v1/object/authenticated/${BUCKET}/${row.file_path}`, { headers: headers(c, { Range: 'bytes=0-1023' }) });
  if (!obj.ok && obj.status !== 206) return res.status(409).json({ error: 'The upload didn’t arrive. Please try again.' });
  const head = new Uint8Array(await obj.arrayBuffer()).slice(0, 1024);
  const good = sameFamily(row.file_type, sniff(head));
  if (!good) {
    await fetch(`${c.url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: headers(c, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [row.file_path] }) });
  }
  const patch = good ? { file_status: 'uploaded' } : Object.assign({ file_status: 'rejected_type' }, row.source_url ? {} : { status: 'rejected', review_note: 'The file was not a PDF or a photo.' });
  await fetch(`${c.url}/rest/v1/town_info_submissions?id=eq.${id}`, { method: 'PATCH', headers: headers(c, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(patch) });
  if (!good) return res.status(422).json({ error: 'That file isn’t a PDF or a photo, so it wasn’t kept.' });
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const host = requestHost(req);
  if (!allowedHost(host) || !sameOrigin(req, host)) return res.status(403).json({ error: 'Not allowed.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = clean(body.action, 20);
  let c, hash;
  try {
    c = backend();
    hash = clientHash(req, c.key);
    if (!hash) return res.status(400).json({ error: 'Request not accepted.' });
    if (AUTOMATION_UA.test(String(req.headers['user-agent'] || ''))) { await securityEvent(c, 'automation_client_blocked', hash); return res.status(403).json({ error: 'Not allowed.' }); }
    const budgets = action === 'start' ? BUDGETS.concat([GLOBAL_BUDGET]) : BUDGETS.slice(0, 1);
    if (!(await allowed(c, hash, budgets))) { await securityEvent(c, 'rate_limited', hash, { action }); res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Too many submissions for now. Please try again later.' }); }
    if (action === 'start') return await start(req, res, c, hash, body);
    if (action === 'finish') return await finish(req, res, c, body);
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (error) {
    console.error('watchdog-town-needs', error && error.message);
    return res.status(500).json({ error: 'Watchdog couldn’t save this right now. Please try again.' });
  }
};
module.exports._test = { sniff, sameFamily, safeFileName, httpsUrl };
