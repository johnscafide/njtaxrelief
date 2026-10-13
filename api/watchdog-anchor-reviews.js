const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);

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

function serviceHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: 'application/json' };
}

async function fetchApproved(withReplies) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/anchor_application_reviews`);
  url.searchParams.set('select', withReplies ? 'rating,review_comment,submitted_at,owner_reply,owner_reply_at' : 'rating,review_comment,submitted_at');
  url.searchParams.set('public_comment_approved', 'eq.true');
  url.searchParams.set('review_comment', 'not.is.null');
  url.searchParams.set('withdrawn_at', 'is.null');
  url.searchParams.set('order', 'submitted_at.desc');
  url.searchParams.set('limit', '50');
  return fetch(url, { headers: serviceHeaders(), cache: 'no-store' });
}

async function ratingSummary() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/anchor_application_rating_public`);
  url.searchParams.set('select', 'average_rating,rating_count');
  url.searchParams.set('singleton', 'eq.true');
  const response = await fetch(url, { headers: serviceHeaders(), cache: 'no-store' });
  if (!response.ok) return {};
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : {};
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowedHost(requestHost(req))) return res.status(403).json({ error: 'This endpoint is available only to Watchdog.' });
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Reviews are unavailable.' });

  try {
    let response = await fetchApproved(true);
    if (!response.ok) response = await fetchApproved(false);
    if (!response.ok) throw new Error('Could not load reviews.');
    const [rows, summary] = await Promise.all([response.json(), ratingSummary()]);
    const reviews = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        rating: Math.max(1, Math.min(5, Number(row.rating) || 0)),
        comment: String(row.review_comment || '').trim(),
        submitted_at: row.submitted_at || null,
        reply: String(row.owner_reply || '').trim(),
        reply_at: row.owner_reply_at || null,
      }))
      .filter((row) => row.comment);

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      average_rating: Number(summary.average_rating) || 0,
      rating_count: Number(summary.rating_count) || 0,
      reviews,
    });
  } catch (error) {
    console.error('watchdog-anchor-reviews', error);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(502).json({ error: 'Reviews could not be loaded.' });
  }
}
