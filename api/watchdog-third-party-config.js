const ALLOWED_HOSTS = new Set([
  'watchdogindex.com',
  'www.watchdogindex.com',
  'njpropertytaxrelief.com',
  'www.njpropertytaxrelief.com',
  'njtaxrelief.vercel.app'
]);

function allowedOrigin(req) {
  const raw = String(req.headers.origin || '');
  if (!raw) return 'https://www.watchdogindex.com';
  try {
    const url = new URL(raw);
    const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    const preview = url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
    if (local || preview || (url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname))) return raw;
  } catch {}
  return 'https://www.watchdogindex.com';
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const origin = allowedOrigin(req);
  if (req.headers.origin && origin !== req.headers.origin) return res.status(403).json({ error: 'Origin not allowed' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.status(200).json({
    turnstile_site_key: process.env.WATCHDOG_TURNSTILE_SITE_KEY || null,
    sentry_dsn: process.env.WATCHDOG_SENTRY_DSN || null,
    sentry_environment: process.env.VERCEL_ENV || 'production',
    sentry_release: process.env.VERCEL_GIT_COMMIT_SHA || null
  });
}
