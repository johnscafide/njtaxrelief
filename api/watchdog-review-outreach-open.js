import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

function tokenFrom(req) {
  const value = Array.isArray(req.query && req.query.t) ? req.query.t[0] : req.query && req.query.t;
  return String(value || '').trim();
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function recordOpen(token) {
  if (!SERVICE_KEY || token.length < 20 || token.length > 180) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_anchor_review_outreach_event_v1`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_token_digest: digest(token), p_event: 'open', p_rating: null }),
    cache: 'no-store',
  }).catch(() => null);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(PIXEL.length));
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.method === 'GET') await recordOpen(tokenFrom(req));
    return res.status(200).end(req.method === 'HEAD' ? undefined : PIXEL);
  }

  res.setHeader('Allow', 'GET, HEAD');
  return res.status(405).end(PIXEL);
}
