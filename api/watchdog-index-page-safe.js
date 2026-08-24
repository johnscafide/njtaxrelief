const WATCHDOG_ORIGIN = 'https://www.watchdogindex.com';
const VERCEL_AUTH_MARKERS = [
  /log in to vercel/i,
  /continue with (?:email|google|github|chatgpt)/i,
  /continue with saml sso/i,
  /continue with passkey/i,
  /_vercel\/sso/i,
  /vercel\.com\/(?:login|sso)/i
];
const OWNERSHIP_TAG = '<script src="/property/js/ownership-verification.js"></script>';
const FREE_GRID_TAG = '<script src="/property/js/free-imagery-grid-runtime.js"></script>\n';

const WATCHDOG_404 = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#10294b">
  <title>Page not found | Watchdog</title>
  <meta name="description" content="The Watchdog page you requested could not be found.">
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--navy:#10294b;--teal:#078486;--teal-dark:#056b6d;--ink:#172332;--muted:#687887;--paper:#f4f8f8;--white:#fff;--line:#dfe8e9;--shadow:0 24px 70px rgba(16,41,75,.10)}
    *{box-sizing:border-box}html,body{min-height:100%}body{margin:0;background:radial-gradient(circle at 15% 8%,rgba(7,132,134,.12),transparent 28%),radial-gradient(circle at 92% 4%,rgba(184,149,24,.08),transparent 24%),linear-gradient(180deg,#f8fbfb 0%,#eef4f4 100%);color:var(--ink);font-family:"Source Sans 3",Arial,sans-serif}.shell{min-height:100vh;display:flex;flex-direction:column}.topbar{height:72px;display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:1180px;width:100%;margin:0 auto;padding:0 24px}.brand{display:inline-flex;align-items:center;gap:10px;color:var(--navy);text-decoration:none;font:800 18px/1 "Plus Jakarta Sans",Arial,sans-serif;letter-spacing:-.02em}.mark{width:38px;height:38px;border-radius:12px;background:var(--navy);color:#fff;display:grid;place-items:center;font:800 17px "Plus Jakarta Sans",Arial,sans-serif;box-shadow:0 9px 25px rgba(16,41,75,.16)}.top-link{color:var(--navy);text-decoration:none;font-weight:700;font-size:14px}.main{flex:1;display:grid;place-items:center;padding:50px 20px 90px}.card{width:min(760px,100%);background:rgba(255,255,255,.96);border:1px solid rgba(223,232,233,.9);border-radius:30px;box-shadow:var(--shadow);padding:54px 48px;text-align:center}.code{display:inline-flex;align-items:center;justify-content:center;min-width:72px;height:34px;border-radius:999px;background:#e8f5f3;color:var(--teal-dark);font:800 12px "Plus Jakarta Sans",Arial,sans-serif;letter-spacing:.12em}.card h1{margin:20px 0 14px;color:var(--navy);font:800 clamp(2.4rem,7vw,4.7rem)/.98 "Plus Jakarta Sans",Arial,sans-serif;letter-spacing:-.055em}.card p{max-width:590px;margin:0 auto;color:var(--muted);font-size:17px;line-height:1.6}.actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:30px}.btn{min-height:48px;border-radius:13px;padding:0 18px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font:800 14px "Plus Jakarta Sans",Arial,sans-serif}.btn.primary{background:var(--navy);color:#fff}.btn.secondary{background:#edf4f4;color:var(--navy)}.help{margin-top:32px;padding-top:25px;border-top:1px solid var(--line);display:flex;justify-content:center;gap:22px;flex-wrap:wrap}.help a{color:var(--teal-dark);font-weight:700;text-decoration:none;font-size:14px}.help a:hover,.top-link:hover{text-decoration:underline;text-underline-offset:3px}@media(max-width:620px){.topbar{height:64px;padding:0 16px}.card{padding:38px 20px;border-radius:22px}.main{padding:32px 13px 60px}.card p{font-size:16px}.actions{display:grid}.btn{width:100%}.help{gap:14px 20px}}
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="Watchdog home"><span class="mark" aria-hidden="true">W</span><span>Watchdog</span></a>
      <a class="top-link" href="/contact">Contact Watchdog</a>
    </header>
    <main class="main">
      <section class="card" aria-labelledby="not-found-title">
        <span class="code">404</span>
        <h1 id="not-found-title">That page isn’t here.</h1>
        <p>The link may be outdated, the page may have moved, or the address may have been typed incorrectly. You can return to Watchdog or jump straight back into property intelligence.</p>
        <div class="actions">
          <a class="btn primary" href="/">Go to Watchdog</a>
          <a class="btn secondary" href="/?focus=search">Property lookup</a>
        </div>
        <nav class="help" aria-label="Helpful links">
          <a href="/faq">FAQ</a>
          <a href="/contact">Contact Watchdog</a>
          <a href="/dashboard">My properties</a>
        </nav>
      </section>
    </main>
  </div>
</body>
</html>`;

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

function installFreeGridImagery(body) {
  const html = String(body || '');
  if (html.includes('/property/js/free-imagery-grid-runtime.js')) return html;
  if (!html.includes(OWNERSHIP_TAG)) return html;
  return html.replace(OWNERSHIP_TAG, FREE_GRID_TAG + OWNERSHIP_TAG);
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

function render404(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Watchdog-Route-Guard', 'branded-404');
  if (req.method === 'HEAD') return res.end();
  return res.end(WATCHDOG_404);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }

  const publicPath = cleanPath(first(req.query && req.query.path));

  // /404 is a first-class Watchdog route. Do not call back through the public
  // deployment to render it; that can surface Vercel Authentication HTML.
  if (publicPath === '/404') return render404(req, res);

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
    const body = installFreeGridImagery(await upstream.text());
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
