const WATCHDOG_ORIGIN = 'https://www.watchdogindex.com';
const VERCEL_AUTH_MARKERS = [
  /log in to vercel/i,
  /continue with (?:email|google|github|chatgpt)/i,
  /continue with saml sso/i,
  /continue with passkey/i,
  /_vercel\/sso/i,
  /vercel\.com\/(?:login|sso)/i
];

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanPath(value) {
  let path = String(value || '/').trim();
  if (!path.startsWith('/')) path = '/' + path;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

function looksLikeVercelAuth(body) {
  const sample = String(body || '').slice(0, 240000);
  return VERCEL_AUTH_MARKERS.some((pattern) => pattern.test(sample));
}

function copySafeHeaders(upstream, res) {
  const contentType = upstream.headers.get('content-type');
  const cacheControl = upstream.headers.get('cache-control');
  const contentLanguage = upstream.headers.get('content-language');
  if (contentType) res.setHeader('Content-Type', contentType);
  else res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (cacheControl) res.setHeader('Cache-Control', cacheControl);
  if (contentLanguage) res.setHeader('Content-Language', contentLanguage);
  res.setHeader('X-Watchdog-Route-Guard', 'canonical-shell');
}

async function render404(req, res) {
  let body = '';
  try {
    const fallback = await fetch(WATCHDOG_ORIGIN + '/404.html', {
      method: 'GET',
      headers: { 'user-agent': 'WatchdogRouteGuard/1.0' },
      redirect: 'follow'
    });
    if (fallback.ok) body = await fallback.text();
  } catch (_error) {}

  if (!body) {
    body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not found | Watchdog</title></head><body style="margin:0;font:16px system-ui;background:#f4f8f8;color:#10294b;display:grid;min-height:100vh;place-items:center"><main style="max-width:680px;padding:42px;text-align:center"><strong>Watchdog</strong><h1 style="font-size:48px;margin:18px 0 10px">That page isn’t here.</h1><p>The link may be outdated or the page may have moved.</p><p><a href="/">Go to Watchdog</a> · <a href="/contact">Contact Watchdog</a></p></main></body></html>';
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Watchdog-Route-Guard', 'branded-404');
  if (req.method === 'HEAD') return res.end();
  return res.end(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }

  const publicPath = cleanPath(first(req.query && req.query.path));
  const upstreamUrl = new URL('/api/watchdog-index-page', WATCHDOG_ORIGIN);
  upstreamUrl.searchParams.set('path', publicPath);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'user-agent': 'WatchdogRouteGuard/1.0',
        'x-watchdog-internal-route': 'canonical-shell'
      },
      redirect: 'follow'
    });
    const body = await upstream.text();
    const rejected = !upstream.ok || looksLikeVercelAuth(body) || /^\s*not found\s*$/i.test(body);

    if (rejected) return render404(req, res);

    res.statusCode = upstream.status;
    copySafeHeaders(upstream, res);
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  } catch (error) {
    console.error('[watchdog-route-guard]', publicPath, error && error.message || error);
    return render404(req, res);
  }
}
