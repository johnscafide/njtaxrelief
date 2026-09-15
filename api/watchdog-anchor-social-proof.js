const SUPABASE_FUNCTION = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/anchor-usage';
const PUBLISHABLE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);
const ACTIONS = new Set(['social_proof', 'record']);

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!allowedHost(requestHost(req))) {
    return res.status(403).json({ error: 'This endpoint is available only to Watchdog.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const action = String(body.action || '').trim();
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid action.' });

  try {
    const response = await fetch(SUPABASE_FUNCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action }),
    });
    const text = await response.text();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.status(response.status).send(text);
  } catch (error) {
    console.error('watchdog-anchor-social-proof', error);
    return res.status(502).json({ error: 'Social proof service could not be reached.' });
  }
}
