import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REVIEW_URL = 'https://www.watchdogindex.com/property/review/';

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ratingFrom(req) {
  const value = Number(first(req.query && req.query.rating));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

async function recordClick(token, rating) {
  if (!SERVICE_KEY || token.length < 20 || token.length > 180) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_anchor_review_outreach_event_v1`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_token_digest: digest(token), p_event: 'click', p_rating: rating }),
    cache: 'no-store',
  }).catch(() => null);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const token = String(first(req.query && req.query.t) || '').trim();
  const rating = ratingFrom(req);
  await recordClick(token, rating);

  const destination = new URL(REVIEW_URL);
  if (rating) destination.searchParams.set('rating', String(rating));
  return res.redirect(302, destination.toString());
}
