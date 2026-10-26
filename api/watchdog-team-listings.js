// Backoffice API for team listings (/backoffice/team-listings).
// Who can use it:
//   * the owner: a signed-in Watchdog developer who is also a Backoffice operator. Can change any
//     listing and add or remove team members.
//   * a team member: a Watchdog account in team_listing_members. Sees every team listing, changes
//     only the ones they added.
// The Bright MLS printout is read in the browser (team-listings.js); only the public fields it
// finds are sent here. The PDF itself is never uploaded or kept.
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const BUCKET = 'team-listing-photos';
const PHOTO_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PHOTOS = 40;
const STATUSES = new Set(['coming_soon', 'active', 'under_contract', 'sold', 'off_market']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = 'id,slug,mls_number,status,address,unit,city,state,zip,county,price,beds,baths_full,baths_half,sqft,lot,year_built,property_type,style,annual_tax,school_district,subdivision,remarks,features,photos,list_date,agent_user_id,agent_name,brokerage,published,created_at,updated_at';

function requestHost(req) { return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''); }
function allowedHost(host) { return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'; }
function bearer(req) { const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i); return m ? m[1] : ''; }
function text(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
function longText(v, n) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n); }
function int(v, min, max) {
  const n = Math.round(Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')));
  return String(v == null ? '' : v).trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}
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
    rest('team_listing_members?select=user_id,display_name&user_id=eq.' + user.id)
  ]);
  const owner = dev === true && Array.isArray(op) && op.length > 0;
  const row = Array.isArray(member) ? member[0] : null;
  if (!owner && !row) return { ok: false, status: 403, error: 'Your account isn’t on the team list yet. Ask John to add you.' };
  const profile = await rest('profiles?select=full_name,display_name&id=eq.' + user.id).catch(() => []);
  const p = Array.isArray(profile) && profile[0] || {};
  const name = (row && row.display_name) || p.display_name || p.full_name || String(user.email || '').split('@')[0];
  return { ok: true, user, owner, name };
}

function slugify(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100); }

function cleanFeatures(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).map((f) => ({ label: text(f && f.label, 60), value: text(f && f.value, 300) })).filter((f) => f.label && f.value);
}
function cleanPhotos(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.map((u) => text(u, 400)).filter((u) => u.startsWith(PHOTO_PREFIX) && /^[a-z0-9/_.-]+$/i.test(u.slice(PHOTO_PREFIX.length)) && !seen.has(u) && seen.add(u)).slice(0, MAX_PHOTOS);
}
function cleanDate(v) {
  const s = text(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

// Everything a listing can hold, checked. Returns { row } or { error }.
function cleanListing(input) {
  const l = input && typeof input === 'object' ? input : {};
  const mls = text(l.mls_number, 20).toUpperCase().replace(/\s+/g, '');
  const zip = text(l.zip, 10).slice(0, 5);
  const row = {
    mls_number: mls || null,
    status: STATUSES.has(text(l.status, 20)) ? text(l.status, 20) : 'active',
    address: text(l.address, 200),
    unit: text(l.unit, 40) || null,
    city: text(l.city, 80),
    state: 'NJ',
    zip: /^\d{5}$/.test(zip) ? zip : null,
    county: text(l.county, 60) || null,
    price: int(l.price, 0, 1000000000),
    beds: int(l.beds, 0, 99),
    baths_full: int(l.baths_full, 0, 99),
    baths_half: int(l.baths_half, 0, 99),
    sqft: int(l.sqft, 0, 1000000),
    lot: text(l.lot, 80) || null,
    year_built: int(l.year_built, 1600, 2100),
    property_type: text(l.property_type, 80) || null,
    style: text(l.style, 80) || null,
    annual_tax: int(l.annual_tax, 0, 10000000),
    school_district: text(l.school_district, 120) || null,
    subdivision: text(l.subdivision, 120) || null,
    remarks: longText(l.remarks, 6000) || null,
    features: cleanFeatures(l.features),
    photos: cleanPhotos(l.photos),
    list_date: cleanDate(l.list_date),
    agent_name: text(l.agent_name, 120) || null,
    brokerage: text(l.brokerage, 120) || 'Opus Elite Real Estate of NJ, LLC',
    published: l.published !== false
  };
  if (mls && !/^[A-Z0-9-]{4,20}$/.test(mls)) return { error: 'That MLS number doesn’t look right.' };
  if (row.address.length < 3) return { error: 'Add the street address.' };
  if (!row.city) return { error: 'Add the town.' };
  return { row };
}

async function uniqueSlug(base, id) {
  const root = base || 'listing';
  for (let i = 0; i < 20; i += 1) {
    const slug = i ? `${root}-${i + 1}` : root;
    const hit = await rest(`team_listings?select=id&slug=eq.${encodeURIComponent(slug)}`);
    if (!hit.length || hit[0].id === id) return slug;
  }
  return `${root}-${crypto.randomBytes(3).toString('hex')}`;
}

async function removePhotos(urls) {
  const prefixes = (urls || []).filter((u) => typeof u === 'string' && u.startsWith(PHOTO_PREFIX)).map((u) => u.slice(PHOTO_PREFIX.length));
  if (!prefixes.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: service({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes }) }).catch(() => {});
}

function canEdit(access, row) { return access.owner || (row && row.agent_user_id === access.user.id); }
function withFlags(access, rows) { return rows.map((r) => Object.assign(r, { can_edit: canEdit(access, r) })); }

async function save(access, body) {
  const checked = cleanListing(body.listing);
  if (checked.error) return [422, { error: checked.error }];
  const row = checked.row;
  const id = text(body.listing && body.listing.id, 40);
  let existing = null;
  if (id) {
    if (!UUID.test(id)) return [422, { error: 'Unknown listing.' }];
    existing = (await rest(`team_listings?select=${FIELDS}&id=eq.${id}`))[0];
    if (!existing) return [404, { error: 'That listing was removed.' }];
    if (!canEdit(access, existing)) return [403, { error: 'Only the agent who added this listing can change it.' }];
  }
  if (row.mls_number) {
    const dupe = await rest(`team_listings?select=id,address&mls_number=eq.${encodeURIComponent(row.mls_number)}`);
    if (dupe.length && dupe[0].id !== id) return [409, { error: `MLS# ${row.mls_number} is already on the team list (${dupe[0].address}).` }];
  }
  if (!row.agent_name) row.agent_name = existing ? existing.agent_name : access.name;
  row.slug = await uniqueSlug(slugify([row.address, row.unit, row.city, row.zip].filter(Boolean).join(' ')), id);
  row.updated_at = new Date().toISOString();
  let saved;
  if (existing) {
    saved = (await rest(`team_listings?id=eq.${id}&select=${FIELDS}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))[0];
    const dropped = (existing.photos || []).filter((u) => !row.photos.includes(u));
    await removePhotos(dropped);
  } else {
    row.agent_user_id = access.user.id;
    saved = (await rest(`team_listings?select=${FIELDS}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }))[0];
  }
  return [existing ? 200 : 201, { ok: true, listing: withFlags(access, [saved])[0] }];
}

async function remove(access, body) {
  const id = text(body.id, 40);
  if (!UUID.test(id)) return [422, { error: 'Unknown listing.' }];
  const row = (await rest(`team_listings?select=id,agent_user_id,photos&id=eq.${id}`))[0];
  if (!row) return [200, { ok: true }];
  if (!canEdit(access, row)) return [403, { error: 'Only the agent who added this listing can remove it.' }];
  await rest(`team_listings?id=eq.${id}`, { method: 'DELETE' });
  await removePhotos(row.photos);
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

async function addMember(access, body) {
  const email = text(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return [422, { error: 'Enter their Watchdog email.' }];
  const found = await rest(`profiles?select=id,email,full_name,display_name&email=ilike.${encodeURIComponent(email.replace(/[%_*]/g, ''))}&limit=2`);
  if (!found.length) return [404, { error: 'No Watchdog account uses that email yet. Have them sign up first (it’s free), then add them.' }];
  const p = found[0];
  const name = text(body.name, 120) || p.display_name || p.full_name || email.split('@')[0];
  await rest('team_listing_members?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: p.id, email: p.email || email, display_name: name, added_by: access.user.id }) });
  return [200, { ok: true, members: await rest('team_listing_members?select=user_id,email,display_name,created_at&order=display_name.asc') }];
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!allowedHost(requestHost(req))) return res.status(403).json({ error: 'Not allowed.' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Team listings aren’t set up yet.' });
  try {
    const access = await whoIs(bearer(req));
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = text(body.action, 20);
    let out;
    if (action === 'me') out = [200, { ok: true, owner: access.owner, name: access.name }];
    else if (action === 'list') out = [200, { ok: true, owner: access.owner, name: access.name, user_id: access.user.id, listings: withFlags(access, await rest(`team_listings?select=${FIELDS}&order=created_at.desc&limit=500`)) }];
    else if (action === 'save') out = await save(access, body);
    else if (action === 'remove') out = await remove(access, body);
    else if (action === 'photo_upload') out = await photoUpload(access, body);
    else if (['members', 'add_member', 'remove_member'].includes(action)) {
      if (!access.owner) out = [403, { error: 'Only John can change the team list.' }];
      else if (action === 'members') out = [200, { ok: true, members: await rest('team_listing_members?select=user_id,email,display_name,created_at&order=display_name.asc') }];
      else if (action === 'add_member') out = await addMember(access, body);
      else {
        const id = text(body.user_id, 40);
        if (!UUID.test(id)) out = [422, { error: 'Unknown team member.' }];
        else {
          await rest(`team_listing_members?user_id=eq.${id}`, { method: 'DELETE' });
          out = [200, { ok: true, members: await rest('team_listing_members?select=user_id,email,display_name,created_at&order=display_name.asc') }];
        }
      }
    } else out = [400, { error: 'Unknown action.' }];
    return res.status(out[0]).json(out[1]);
  } catch (error) {
    console.error('watchdog-team-listings', error && error.message, error && error.detail);
    if (error && error.status === 404) return res.status(503).json({ error: 'Team listings aren’t set up yet. The database step still needs to run.' });
    return res.status(500).json({ error: 'Something went wrong saving that. Please try again.' });
  }
};
module.exports._test = { cleanListing, slugify, cleanPhotos, PHOTO_PREFIX };
