const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const REVIEW_SELECT = 'id,rating,review_comment,public_comment_approved,public_comment_approved_at,submitted_at,updated_at';

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function allowedHost(host) {
  return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1';
}

function bearer(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function safeReview(row) {
  return {
    id: row && row.id,
    rating: Math.max(1, Math.min(5, Number(row && row.rating) || 0)),
    comment: String(row && row.review_comment || '').trim(),
    approved: row && row.public_comment_approved === true,
    approved_at: row && row.public_comment_approved_at || null,
    submitted_at: row && row.submitted_at || null,
    updated_at: row && row.updated_at || null,
  };
}

async function requireDeveloper(token) {
  if (!token) return { ok: false, status: 401, error: 'Developer sign-in is required.' };

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!userResponse.ok) return { ok: false, status: 401, error: 'Developer sign-in is required.' };

  const developerResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_watchdog_developer`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
    cache: 'no-store',
  });
  if (!developerResponse.ok) return { ok: false, status: 403, error: 'Developer access is required.' };
  const isDeveloper = await developerResponse.json().catch(() => false);
  if (isDeveloper !== true) return { ok: false, status: 403, error: 'Developer access is required.' };
  return { ok: true };
}

function serviceHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Accept: 'application/json',
  }, extra || {});
}

async function countPending() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/anchor_application_reviews`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('public_comment_approved', 'eq.false');
  url.searchParams.set('review_comment', 'not.is.null');
  const response = await fetch(url, {
    method: 'HEAD',
    headers: serviceHeaders({ Prefer: 'count=exact', Range: '0-0' }),
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 206) throw new Error('Could not count pending reviews.');
  const range = String(response.headers.get('content-range') || '');
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function listReviews(approved) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/anchor_application_reviews`);
  url.searchParams.set('select', REVIEW_SELECT);
  url.searchParams.set('public_comment_approved', approved ? 'eq.true' : 'eq.false');
  url.searchParams.set('review_comment', 'not.is.null');
  url.searchParams.set('order', approved ? 'public_comment_approved_at.desc' : 'submitted_at.desc');
  url.searchParams.set('limit', '100');
  const response = await fetch(url, { headers: serviceHeaders(), cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load application reviews.');
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map(safeReview).filter((row) => row.comment);
}

async function moderate(reviewId, approved) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/anchor_application_reviews`);
  url.searchParams.set('id', `eq.${reviewId}`);
  url.searchParams.set('select', REVIEW_SELECT);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({
      public_comment_approved: approved,
      public_comment_approved_at: approved ? new Date().toISOString() : null,
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Could not update review approval.');
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error('Review not found.');
  return safeReview(rows[0]);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowedHost(requestHost(req))) return res.status(403).json({ error: 'Backoffice is available only on Watchdog.' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Review moderation service is unavailable.' });

  const access = await requireDeveloper(bearer(req)).catch(() => ({ ok: false, status: 503, error: 'Developer verification is unavailable.' }));
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const action = String(body.action || 'list').trim().toLowerCase();

  try {
    if (action === 'count') {
      return res.status(200).json({ ok: true, pending_count: await countPending() });
    }

    if (action === 'list') {
      const [pendingCount, pending, approved] = await Promise.all([
        countPending(),
        listReviews(false),
        listReviews(true),
      ]);
      return res.status(200).json({ ok: true, pending_count: pendingCount, pending, approved });
    }

    if (action === 'approve' || action === 'unpublish') {
      const reviewId = String(body.review_id || '').trim();
      if (!isUuid(reviewId)) return res.status(422).json({ error: 'A valid review_id is required.' });
      const review = await moderate(reviewId, action === 'approve');
      return res.status(200).json({ ok: true, review, pending_count: await countPending() });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('watchdog-backoffice-reviews', error);
    return res.status(500).json({ error: error && error.message || 'Review moderation request failed.' });
  }
}
