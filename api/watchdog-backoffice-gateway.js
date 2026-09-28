const SUPABASE_FUNCTIONS = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1';
const ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com']);

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function isAllowedHost(host) {
  return ALLOWED_HOSTS.has(host) || host.endsWith('.vercel.app');
}

// The upstream Edge Functions fingerprint sessions and sign-in attempts by IP and
// user agent. Forward the browser's values; otherwise every fingerprint would
// describe this Vercel function instead of the operator's device. Vercel sets
// x-vercel-forwarded-for / x-forwarded-for / x-real-ip itself, so a browser
// cannot choose them.
function clientIp(req) {
  for (const name of ['x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip']) {
    const value = String(req.headers[name] || '').split(',')[0].trim();
    if (value) return value.slice(0, 64);
  }
  return '';
}

function targetUrl(target) {
  if (target === 'login') return `${SUPABASE_FUNCTIONS}/backoffice-dev-login`;
  if (target === 'api') return `${SUPABASE_FUNCTIONS}/backoffice-api`;
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const host = requestHost(req);
  if (!isAllowedHost(host)) {
    return res.status(403).json({ error: 'Backoffice is available only on WatchdogIndex.com.' });
  }

  const target = String(req.query?.target || '').toLowerCase();
  const upstream = targetUrl(target);
  if (!upstream) return res.status(400).json({ error: 'Invalid backoffice gateway target.' });

  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  const ip = clientIp(req);
  if (ip) {
    headers['X-Forwarded-For'] = ip;
    headers['X-Real-IP'] = ip;
  }
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
  if (userAgent) headers['User-Agent'] = userAgent;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    return res.status(response.status).send(text);
  } catch (error) {
    console.error('watchdog-backoffice-gateway', error);
    return res.status(502).json({ error: 'Backoffice service could not be reached.' });
  }
}
