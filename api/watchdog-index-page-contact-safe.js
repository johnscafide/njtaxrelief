const WATCHDOG_ORIGIN = 'https://www.watchdogindex.com';
const VERCEL_AUTH_MARKERS = [
  /log in to vercel/i,
  /continue with (?:email|google|github|chatgpt)/i,
  /continue with saml sso/i,
  /continue with passkey/i,
  /_vercel\/sso/i,
  /vercel\.com\/(?:login|sso)/i
];
const CONTACT_POLICY_SCRIPT = '<script src="/property/js/contact-routing-policy.js" data-watchdog-contact-policy-runtime="1"></script>';
const AI_REFERRAL_SCRIPT = '<script src="/property/js/ai-referral-analytics.js" data-watchdog-ai-referral-runtime="1" defer></script>';
const AI_REFERRAL_PRIVATE_PREFIXES = ['/account','/agent-control','/agent-desk','/analytics','/backoffice','/compare','/dashboard','/data-center','/data-workbench','/developer','/developer-data','/diagnostics','/farm-builder','/growth','/home','/insights/admin','/integrations','/intelligence','/logs','/marketing-studio','/newsletter-studio','/onboarding','/report-builder','/watchlist','/whitepapers','/workbench'];
const ENTITY_GRAPH_ID = 'watchdog-entity-graph';
const ENTITY_GRAPH = `<script type="application/ld+json" id="${ENTITY_GRAPH_ID}">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.watchdogindex.com/#organization",
      "name": "Watchdog",
      "alternateName": "Watchdog Property Intelligence",
      "url": "https://www.watchdogindex.com/",
      "description": "New Jersey property intelligence for homeowners and real-estate professionals, combining public-source property evidence with Watchdog-derived decision intelligence.",
      "areaServed": { "@type": "State", "name": "New Jersey" }
    },
    {
      "@type": "WebSite",
      "@id": "https://www.watchdogindex.com/#website",
      "url": "https://www.watchdogindex.com/",
      "name": "Watchdog",
      "publisher": { "@id": "https://www.watchdogindex.com/#organization" },
      "inLanguage": "en-US"
    }
  ]
}
</script>`;

const WATCHDOG_404 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Page not found | Watchdog</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8f8;color:#10294b;font-family:Arial,sans-serif}.c{max-width:680px;padding:48px 28px;text-align:center;background:#fff;border-radius:24px;box-shadow:0 20px 60px rgba(16,41,75,.1)}h1{font-size:clamp(2rem,7vw,4rem);margin:.3em 0}p{color:#687887;line-height:1.6}a{display:inline-block;margin:8px;padding:13px 18px;border-radius:12px;background:#10294b;color:#fff;text-decoration:none;font-weight:700}</style></head><body><main class="c"><strong>404</strong><h1>That page isn’t here.</h1><p>The link may be outdated or the page may have moved.</p><a href="/">Go to Watchdog</a><a href="/contact">Contact Watchdog</a></main></body></html>`;

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

function isPrivateAppPath(pathname) {
  return AI_REFERRAL_PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAiReferralPublicPath(pathname) {
  return !isPrivateAppPath(pathname);
}

function privateRouteRevision() {
  const deploy = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_URL || 'private-app');
  return `${deploy}-${Date.now().toString(36)}`;
}

function looksLikeVercelAuth(body) {
  const sample = String(body || '').slice(0, 240000);
  return VERCEL_AUTH_MARKERS.some((pattern) => pattern.test(sample));
}

function installEntityGraph(input) {
  let html = String(input || '');
  if (html.includes(`id="${ENTITY_GRAPH_ID}"`)) return html;
  if (!/<\/head>/i.test(html)) return html;
  return html.replace(/<\/head>/i, `${ENTITY_GRAPH}\n</head>`);
}

/* Canonical Watchdog pages are already route-normalized by the server adapter.
   Do not add a second browser MutationObserver to re-normalize every injected
   profile/menu node. On the canonical root we also drop the historical global
   `/scripts.js` runtime; lookup.js and the explicit Watchdog runtimes own this
   surface now. This is the first bounded Index asset-diet step. */
function applyCanonicalRuntimeDiet(input, publicPath) {
  let html = String(input || '');
  html = html.replace(
    /<script\b[^>]*\bid=["']watchdog-clean-route-runtime["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    ''
  );
  if (publicPath === '/') {
    html = html.replace(
      /<script\b[^>]*\bsrc=["']\/scripts\.js["'][^>]*>\s*<\/script>\s*/gi,
      ''
    );
  }
  return html;
}

function sanitizeContactHtml(input, publicPath) {
  let html = String(input || '');

  html = html.replace(
    /<a\b([^>]*?)href=(["'])mailto:(?!\?)[^"']*\2([^>]*)>[\s\S]*?<\/a>/gi,
    '<a$1href="https://www.watchdogindex.com/contact"$3>Contact Watchdog</a>'
  );
  html = html.replace(
    /<a\b([^>]*?)href=(["'])tel:[^"']*\2([^>]*)>[\s\S]*?<\/a>/gi,
    '<a$1href="https://www.watchdogindex.com/contact"$3>Contact Watchdog</a>'
  );
  html = html.replace(
    /href=(["'])(?:https?:\/\/(?:www\.)?njpropertytaxrelief\.com)?\/?(?:index\.html)?#contact\1/gi,
    'href="https://www.watchdogindex.com/contact"'
  );
  html = html.replace(
    /href=(["'])(?:https?:\/\/(?:www\.)?njpropertytaxrelief\.com\/)?contact\.html\1/gi,
    'href="https://www.watchdogindex.com/contact"'
  );
  html = html.replace(
    /href=(["'])https?:\/\/(?:www\.)?johnscafide\.com\/?[^"']*\1/gi,
    'href="https://www.watchdogindex.com/contact?topic=real-estate"'
  );
  html = html.replace(
    /For full sales information on this and other properties, visit\s*<a\b[^>]*href=(["'])https?:\/\/johnscafide\.opuselitesj\.com[^"']*\1[^>]*>[^<]*<\/a>\./gi,
    'For full sales information on this and other properties, <a href="https://www.watchdogindex.com/contact?topic=real-estate">contact Watchdog</a>.'
  );

  html = html
    .replace(/is operated by John Scafide, a licensed New Jersey real estate agent \(License #2079591\) with The McKenty Team at Opus Elite Real Estate, and a tax professional\./gi, 'is operated by Watchdog Property Intelligence. Real-estate services are handled by licensed New Jersey real-estate professionals affiliated with Opus Elite Real Estate.')
    .replace(/John Scafide,\s*NJ License #2079591/gi, 'Licensed NJ real-estate professional')
    .replace(/john@johnscafide\.com/gi, 'Contact Watchdog')
    .replace(/heather@heatherscafide\.com/gi, 'Contact Watchdog')
    .replace(/(?:\+?1[\s.-]*)?\(?856\)?[\s.-]*404[\s.-]*1098/g, 'Contact Watchdog')
    .replace(/(?:\+?1[\s.-]*)?\(?856\)?[\s.-]*310[\s.-]*6746/g, 'Contact Watchdog')
    .replace(/(?:\+?1[\s.-]*)?\(?609\)?[\s.-]*540[\s.-]*5505/g, 'Contact Watchdog')
    .replace(/\bJohn Scafide\b/g, 'Watchdog')
    .replace(/\bJohn or Heather\b/gi, 'the Watchdog team')
    .replace(/\bEmail Agent\b/gi, 'Contact Watchdog')
    .replace(/\bEmail John\b/gi, 'Contact Watchdog')
    .replace(/\bEmail Heather\b/gi, 'Contact Watchdog')
    .replace(/\bSend to John\b/gi, 'Send to Watchdog')
    .replace(/\bSend to Heather\b/gi, 'Send to Watchdog')
    .replace(/Watchdog,\s*NJ License #2079591/gi, 'Licensed NJ real-estate professional')
    .replace(/by emailing\s+(<a[^>]*>Contact Watchdog<\/a>)/gi, 'through $1')
    .replace(/For anything else, email\s+(<a[^>]*>Contact Watchdog<\/a>)/gi, 'For anything else, use $1')
    .replace(/<p><strong>Watchdog<\/strong><br>Licensed New Jersey Real Estate Agent #2079591<br>The McKenty Team at Opus Elite Real Estate<br>Email:\s*<a[^>]*>Contact Watchdog<\/a><br>Phone:\s*<a[^>]*>Contact Watchdog<\/a><\/p>/gi, '<p>Use <a href="https://www.watchdogindex.com/contact?topic=privacy">Contact Watchdog</a> for privacy requests, or <a href="https://www.watchdogindex.com/support">Account Support</a> when you are signed in.</p>');

  if (!/contact-routing-policy\.js/i.test(html)) {
    html = html.replace(/<\/body>/i, `${CONTACT_POLICY_SCRIPT}\n</body>`);
  }
  if (isAiReferralPublicPath(publicPath) && !/ai-referral-analytics\.js/i.test(html)) {
    html = html.replace(/<\/body>/i, `${AI_REFERRAL_SCRIPT}\n</body>`);
  }
  return html;
}

function copySafeHeaders(upstream, res, publicPath) {
  const contentType = upstream.headers.get('content-type');
  const cacheControl = upstream.headers.get('cache-control');
  const contentLanguage = upstream.headers.get('content-language');
  if (contentType) res.setHeader('Content-Type', contentType);
  else res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (isPrivateAppPath(publicPath)) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  } else if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }
  if (contentLanguage) res.setHeader('Content-Language', contentLanguage);
  res.setHeader('X-Watchdog-Route-Guard', 'canonical-contact-policy');
}

function render404(req, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow,noarchive');
  res.setHeader('X-Watchdog-Route-Guard', 'branded-404');
  if (req.method === 'HEAD') return res.end();
  return res.end(WATCHDOG_404);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }

  const publicPath = cleanPath(first(req.query && req.query.path));
  if (publicPath === '/404') return render404(req, res);

  const upstreamUrl = new URL('/api/watchdog-index-page', WATCHDOG_ORIGIN);
  upstreamUrl.searchParams.set('path', publicPath);
  if (isPrivateAppPath(publicPath)) {
    upstreamUrl.searchParams.set('route_rev', privateRouteRevision());
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'user-agent': 'WatchdogContactRouteGuard/1.0',
        'x-watchdog-internal-route': 'canonical-contact-policy',
        ...(isPrivateAppPath(publicPath) ? { 'cache-control': 'no-cache', pragma: 'no-cache' } : {})
      },
      cache: isPrivateAppPath(publicPath) ? 'no-store' : 'default',
      redirect: 'follow'
    });
    const body = await upstream.text();
    const rejected = !upstream.ok || looksLikeVercelAuth(body) || /^\s*not found\s*$/i.test(body);
    if (rejected) return render404(req, res);

    res.statusCode = upstream.status;
    copySafeHeaders(upstream, res, publicPath);
    if (req.method === 'HEAD') return res.end();
    let safeBody = sanitizeContactHtml(body, publicPath);
    safeBody = applyCanonicalRuntimeDiet(safeBody, publicPath);
    if (publicPath === '/') safeBody = installEntityGraph(safeBody);
    return res.end(safeBody);
  } catch (error) {
    console.error('[watchdog-contact-route-guard]', publicPath, error && error.message || error);
    return render404(req, res);
  }
};
