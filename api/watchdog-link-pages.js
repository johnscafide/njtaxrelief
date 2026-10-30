// Backoffice API for link pages (/backoffice/link-pages).
// Who can use it:
//   * a Backoffice operator (John and Heather) or a team listing member: makes and changes
//     their own link pages.
//   * the owner (a Watchdog developer who is also an operator): can also change anyone's page.
// The page content is checked with cleanPage() from link-page-render.js, the same file the
// editor preview and the public page use.
const crypto = require('crypto');
const LP = require('../property/backoffice/link-pages/link-page-render.js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const BUCKET = 'link-page-photos';
const PHOTO_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = 'id,slug,owner_user_id,owner_name,published,content,created_at,updated_at';
const MAX_PAGES = 10;

function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function bearer(req) { const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i); return m ? m[1] : ''; }
function text(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
function service(extra) { return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Accept: 'application/json' }, extra || {}); }

async function rest(path, opts) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({ cache: 'no-store' }, opts || {}, { headers: service(Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers)) }));
  const body = await r.text();
  if (!r.ok) {
    const err = new Error(`rest ${r.status}`);
    err.status = r.status;
    err.detail = body.slice(0, 300);
    throw err;
  }
  return body ? JSON.parse(body) : null;
}

async function whoIs(token) {
  if (!token) return { ok: false, status: 401, error: 'Sign in to Watchdog first.' };
  const ur = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + token }, cache: 'no-store' });
  if (!ur.ok) return { ok: false, status: 401, error: 'Sign in to Watchdog first.' };
  const user = await ur.json();
  if (!UUID.test(String(user && user.id || ''))) return { ok: false, status: 401, error: 'Sign in to Watchdog first.' };
  const [dev, op, member] = await Promise.all([
    fetch(SUPABASE_URL + '/rest/v1/rpc/is_watchdog_developer', { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}', cache: 'no-store' }).then((r) => (r.ok ? r.json() : false)).catch(() => false),
    rest('backoffice_operators?select=user_id&user_id=eq.' + user.id),
    rest('team_listing_members?select=user_id,display_name&user_id=eq.' + user.id).catch(() => [])
  ]);
  const operator = Array.isArray(op) && op.length > 0;
  const row = Array.isArray(member) ? member[0] : null;
  if (!operator && !row) return { ok: false, status: 403, error: 'Your account can’t make link pages yet. Ask John to add you.' };
  const profile = await rest('profiles?select=full_name,display_name&id=eq.' + user.id).catch(() => []);
  const p = Array.isArray(profile) && profile[0] || {};
  const name = (row && row.display_name) || p.full_name || p.display_name || String(user.email || '').split('@')[0];
  return { ok: true, user, owner: dev === true && operator, name };
}

function photoOk(u) { const s = String(u || ''); return s.startsWith(PHOTO_PREFIX) && s.length <= 400 && /^[a-z0-9/_.-]+$/i.test(s.slice(PHOTO_PREFIX.length)); }
function photosIn(content) {
  const c = content || {};
  return [c.profile && c.profile.photo, c.theme && c.theme.bg_image, ...(Array.isArray(c.blocks) ? c.blocks.map((b) => b && b.image) : [])].filter(photoOk);
}
function canEdit(access, row) { return access.owner || (row && row.owner_user_id === access.user.id); }

async function removePhotos(urls) {
  const prefixes = (urls || []).filter(photoOk).map((u) => u.slice(PHOTO_PREFIX.length));
  if (!prefixes.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: service({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes }) }).catch(() => {});
}

function cleanSlug(v) { return text(v, 60).toLowerCase(); }

async function slugTaken(slug, id) {
  const hit = await rest(`link_pages?select=id&slug=eq.${encodeURIComponent(slug)}`);
  return hit.length > 0 && hit[0].id !== id;
}

// Views and taps for the last 30 days: { views, taps: { <item id>: count } }.
async function stats(ids) {
  const out = {};
  if (!ids.length) return out;
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const rows = await rest(`link_page_hits?select=page_id,item,hits&page_id=in.(${ids.join(',')})&day=gte.${since}`).catch(() => []);
  for (const r of rows || []) {
    const s = out[r.page_id] || (out[r.page_id] = { views: 0, taps: {} });
    if (r.item === '') s.views += r.hits;
    else s.taps[r.item] = (s.taps[r.item] || 0) + r.hits;
  }
  return out;
}

async function list(access) {
  const filter = access.owner ? '' : `&owner_user_id=eq.${access.user.id}`;
  const pages = await rest(`link_pages?select=${FIELDS}&order=created_at.asc${filter}`);
  const s = await stats(pages.map((p) => p.id));
  return pages.map((p) => Object.assign(p, { can_edit: canEdit(access, p), mine: p.owner_user_id === access.user.id, stats: s[p.id] || { views: 0, taps: {} } }));
}

async function save(access, body) {
  const input = body.page && typeof body.page === 'object' ? body.page : {};
  const slug = cleanSlug(input.slug);
  if (!LP.SLUG.test(slug)) return [422, { error: 'Your link can use lowercase letters, numbers and dashes (2 to 40).' }];
  const checked = LP.cleanPage(input.content, photoOk);
  if (checked.errors.length) return [422, { error: checked.errors[0], errors: checked.errors }];
  const id = text(input.id, 40);
  let existing = null;
  if (id) {
    if (!UUID.test(id)) return [422, { error: 'Unknown page.' }];
    existing = (await rest(`link_pages?select=${FIELDS}&id=eq.${id}`))[0];
    if (!existing) return [404, { error: 'That page was deleted.' }];
    if (!canEdit(access, existing)) return [403, { error: 'Only the person who made this page can change it.' }];
  } else {
    const count = await rest(`link_pages?select=id&owner_user_id=eq.${access.user.id}`);
    if (count.length >= MAX_PAGES) return [422, { error: `You can have up to ${MAX_PAGES} link pages.` }];
  }
  if (await slugTaken(slug, id)) return [409, { error: `watchdogindex.com/links/${slug} is taken. Try another.` }];
  const row = { slug, published: input.published !== false, content: checked.page, updated_at: new Date().toISOString() };
  let saved;
  if (existing) {
    saved = (await rest(`link_pages?id=eq.${id}&select=${FIELDS}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))[0];
    const keep = new Set(photosIn(checked.page));
    await removePhotos(photosIn(existing.content).filter((u) => !keep.has(u)));
  } else {
    row.owner_user_id = access.user.id;
    row.owner_name = access.name;
    saved = (await rest(`link_pages?select=${FIELDS}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))[0];
  }
  const s = await stats([saved.id]);
  return [existing ? 200 : 201, { ok: true, page: Object.assign(saved, { can_edit: true, mine: saved.owner_user_id === access.user.id, stats: s[saved.id] || { views: 0, taps: {} } }) }];
}

async function remove(access, body) {
  const id = text(body.id, 40);
  if (!UUID.test(id)) return [422, { error: 'Unknown page.' }];
  const row = (await rest(`link_pages?select=id,owner_user_id,content&id=eq.${id}`))[0];
  if (!row) return [200, { ok: true }];
  if (!canEdit(access, row)) return [403, { error: 'Only the person who made this page can delete it.' }];
  await rest(`link_pages?id=eq.${id}`, { method: 'DELETE' });
  await removePhotos(photosIn(row.content));
  return [200, { ok: true }];
}

async function photoUpload(access, body) {
  const ext = PHOTO_TYPES[text(body.type, 40)];
  if (!ext) return [422, { error: 'Photos need to be JPG, PNG or WebP.' }];
  const path = `${access.user.id}/${crypto.randomUUID()}.${ext}`;
  const sign = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: service({ 'Content-Type': 'application/json' }), body: '{}' });
  const signed = await sign.json().catch(() => ({}));
  if (!sign.ok || !signed.url) return [500, { error: 'The photo upload couldn’t start. Please try again.' }];
  return [200, { ok: true, upload_url: `${SUPABASE_URL}/storage/v1${signed.url}`, public_url: PHOTO_PREFIX + path }];
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!allowedHost(requestHost(req))) return res.status(403).json({ error: 'Not allowed.' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Link pages aren’t set up yet.' });
  try {
    const access = await whoIs(bearer(req));
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = text(body.action, 20);
    let out;
    if (action === 'list') out = [200, { ok: true, owner: access.owner, name: access.name, user_id: access.user.id, photo_prefix: PHOTO_PREFIX, pages: await list(access) }];
    else if (action === 'check_slug') {
      const slug = cleanSlug(body.slug);
      out = [200, { ok: true, slug, valid: LP.SLUG.test(slug), available: LP.SLUG.test(slug) && !(await slugTaken(slug, text(body.id, 40))) }];
    } else if (action === 'save') out = await save(access, body);
    else if (action === 'remove') out = await remove(access, body);
    else if (action === 'photo_upload') out = await photoUpload(access, body);
    else out = [400, { error: 'Unknown action.' }];
    return res.status(out[0]).json(out[1]);
  } catch (error) {
    console.error('watchdog-link-pages', error && error.message, error && error.detail);
    if (error && error.status === 404) return res.status(503).json({ error: 'Link pages aren’t set up yet. The database step still needs to run.' });
    return res.status(500).json({ error: 'Something went wrong saving that. Please try again.' });
  }
};
module.exports._test = { photoOk, photosIn, PHOTO_PREFIX };
