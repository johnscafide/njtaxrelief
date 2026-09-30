// Backoffice review queue for Town Needs submissions (/backoffice/town-info).
// Only a signed-in Watchdog developer who is also a Backoffice operator can use it.
// Approving copies the file (if any) to the public evidence bucket so it can be shown to agents
// as the source once the info is published through the checked-requirements step. Rejecting
// deletes the private upload. Nothing here changes what agents see on its own.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const PRIVATE_BUCKET = 'town-info-submissions';
const EVIDENCE_BUCKET = 'town-info-evidence';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = 'id,created_at,municipality_code,municipality_name,need_keys,answer,source_url,file_path,file_name,file_type,file_size,file_status,submitter_name,submitter_email,submitter_role,status,review_note,reviewed_at,evidence_url';

function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function bearer(req) { const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i); return m ? m[1] : ''; }
function text(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function service(extra) { return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Accept: 'application/json' }, extra || {}); }

async function requireReviewer(token) {
  if (!token) return { ok: false, status: 401, error: 'Sign in to Watchdog first.' };
  const ur = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + token }, cache: 'no-store' });
  if (!ur.ok) return { ok: false, status: 401, error: 'Sign in to Watchdog first.' };
  const user = await ur.json();
  const dr = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_watchdog_developer', { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}', cache: 'no-store' });
  const developer = dr.ok ? await dr.json().catch(() => false) : false;
  if (developer !== true || !UUID.test(String(user && user.id || ''))) return { ok: false, status: 403, error: 'Only the Backoffice owner can review town info.' };
  const op = await fetch(SUPABASE_URL + '/rest/v1/backoffice_operators?select=user_id&user_id=eq.' + user.id, { headers: service(), cache: 'no-store' });
  const rows = op.ok ? await op.json().catch(() => []) : [];
  if (!Array.isArray(rows) || !rows.length) return { ok: false, status: 403, error: 'Only the Backoffice owner can review town info.' };
  return { ok: true, user };
}
async function rows(query) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/town_info_submissions?' + query, { headers: service(), cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load town info submissions.');
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}
// Waiting for review: pending, and either link-only or with a checked upload.
const QUEUE = 'status=eq.pending&or=(file_status.eq.none,file_status.eq.uploaded)';
async function pendingCount() {
  const r = await fetch(SUPABASE_URL + '/rest/v1/town_info_submissions?select=id&' + QUEUE, { method: 'HEAD', headers: service({ Prefer: 'count=exact', Range: '0-0' }), cache: 'no-store' });
  if (!r.ok) throw new Error('Could not count town info submissions.');
  const total = Number(String(r.headers.get('content-range') || '').split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}
async function viewUrl(path) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${PRIVATE_BUCKET}/${path}`, { method: 'POST', headers: service({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 900 }) });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.signedURL ? `${SUPABASE_URL}/storage/v1${j.signedURL}` : '';
}
async function patch(id, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/town_info_submissions?id=eq.' + id + '&status=eq.pending', { method: 'PATCH', headers: service({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(body) });
  const out = await r.json().catch(() => []);
  if (!r.ok || !Array.isArray(out) || !out.length) throw new Error('This submission was already reviewed.');
  return out[0];
}
async function copyToEvidence(row) {
  const src = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${PRIVATE_BUCKET}/${row.file_path}`, { headers: service() });
  if (!src.ok) throw new Error('The uploaded file could not be read.');
  const bytes = Buffer.from(await src.arrayBuffer());
  const name = row.file_path.split('/').pop();
  const dest = `${row.municipality_code}/${row.id}/${name}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${EVIDENCE_BUCKET}/${dest}`, { method: 'POST', headers: service({ 'Content-Type': row.file_type, 'x-upsert': 'true', 'cache-control': '3600' }), body: bytes });
  if (!up.ok) throw new Error('The file could not be copied for publishing.');
  return `${SUPABASE_URL}/storage/v1/object/public/${EVIDENCE_BUCKET}/${dest}`;
}
async function removePrivate(path) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${PRIVATE_BUCKET}`, { method: 'DELETE', headers: service({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [path] }) });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!allowedHost(requestHost(req))) return res.status(403).json({ error: 'Not allowed.' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Town info review is not configured.' });
  try {
    const access = await requireReviewer(bearer(req));
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = text(body.action, 20);
    if (action === 'count') return res.status(200).json({ ok: true, pending_count: await pendingCount() });
    if (action === 'list') {
      const [pending, recent] = await Promise.all([
        rows(`select=${FIELDS}&${QUEUE}&order=created_at.asc&limit=100`),
        rows(`select=${FIELDS}&status=in.(approved,rejected,published)&order=reviewed_at.desc.nullslast&limit=40`)
      ]);
      for (const r of pending) r.view_url = r.file_path && r.file_status === 'uploaded' ? await viewUrl(r.file_path) : '';
      return res.status(200).json({ ok: true, pending, recent, pending_count: pending.length });
    }
    if (action === 'review') {
      const id = text(body.id, 40), status = text(body.status, 20), note = text(body.note, 1000);
      if (!UUID.test(id)) return res.status(422).json({ error: 'Unknown submission.' });
      if (!['approved', 'rejected'].includes(status)) return res.status(422).json({ error: 'Choose approve or reject.' });
      const row = (await rows(`select=${FIELDS}&id=eq.${id}&status=eq.pending`))[0];
      if (!row) return res.status(409).json({ error: 'This submission was already reviewed.' });
      let evidence = null;
      if (status === 'approved') evidence = row.file_path && row.file_status === 'uploaded' ? await copyToEvidence(row) : row.source_url;
      const updated = await patch(id, { status, review_note: note || null, reviewed_at: new Date().toISOString(), reviewed_by: access.user.id, evidence_url: evidence });
      if (row.file_path) await removePrivate(row.file_path);
      return res.status(200).json({ ok: true, submission: updated, pending_count: await pendingCount() });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (error) {
    console.error('watchdog-backoffice-town-needs', error && error.message);
    return res.status(500).json({ error: error && error.message || 'Town info review failed.' });
  }
}
