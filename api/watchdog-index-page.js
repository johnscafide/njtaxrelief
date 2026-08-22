const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const LEGACY_PROPERTY_ORIGINS = [
  'https://njpropertytaxrelief.com/property/',
  'https://www.njpropertytaxrelief.com/property/'
];

const NOINDEX_PATH_PREFIXES = [
  '/data-center',
  '/data-workbench',
  '/developer-data',
  '/diagnostics',
  '/growth',
  '/insights/admin',
  '/marketing-studio'
];

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function normalizePagePath(input) {
  let pathname = String(input || '/').trim();
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.split('?')[0].split('#')[0];
  pathname = pathname.replace(/\\/g, '/').replace(/\/{2,}/g, '/');

  if (pathname.includes('\0') || pathname.split('/').includes('..')) return null;
  if (!/^\/[A-Za-z0-9._~!$&'()+,;=:@%/-]*$/.test(pathname)) return null;

  pathname = pathname.replace(/\/index\.html$/i, '');
  pathname = pathname.replace(/\.html$/i, '');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  return pathname || '/';
}

function pageSourceCandidates(publicPath) {
  if (publicPath === '/') return ['/property/'];

  const base = `/property${publicPath}`;
  return [
    base,
    `${base}/`,
    `${base}.html`,
    `${base}/index.html`
  ];
}

function deploymentOrigins() {
  const candidates = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    'njtaxrelief.vercel.app',
    process.env.VERCEL_URL
  ];
  const seen = new Set();
  const origins = [];

  for (const raw of candidates) {
    if (!raw) continue;
    let host = String(raw).trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!host || host.toLowerCase() === CANONICAL_HOST || seen.has(host)) continue;
    seen.add(host);
    origins.push(`https://${host}`);
  }
  return origins;
}

function splitSuffix(value) {
  const match = String(value || '').match(/^([^?#]*)([?#].*)?$/);
  return { path: match?.[1] || '/', suffix: match?.[2] || '' };
}

function cleanPropertyPath(value) {
  const { path, suffix } = splitSuffix(value);
  let clean = path.replace(/^\/property(?=\/|$)/i, '') || '/';
  clean = normalizePagePath(clean) || clean;
  return `${clean}${suffix}`;
}

function rewriteAbsolutePropertyUrls(html) {
  let output = html;
  for (const origin of LEGACY_PROPERTY_ORIGINS) {
    output = output.split(origin).join(`${CANONICAL_ORIGIN}/`);
  }
  return output;
}

function rewriteNavigationLinks(html) {
  return html
    .replace(/(<a\b[^>]*\bhref=["'])\/property([^"']*)(["'])/gi, (full, start, rest, end) => {
      return `${start}${cleanPropertyPath(`/property${rest}`)}${end}`;
    })
    .replace(/(<form\b[^>]*\baction=["'])\/property([^"']*)(["'])/gi, (full, start, rest, end) => {
      return `${start}${cleanPropertyPath(`/property${rest}`)}${end}`;
    });
}

function setCanonicalMetadata(html, canonicalUrl) {
  let output = rewriteNavigationLinks(rewriteAbsolutePropertyUrls(html));

  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}">`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(output)) {
    output = output.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonicalTag);
  } else {
    output = output.replace(/<\/head>/i, `  ${canonicalTag}\n</head>`);
  }

  const ogUrlTag = `<meta property="og:url" content="${canonicalUrl}">`;
  if (/<meta\s+property=["']og:url["'][^>]*>/i.test(output)) {
    output = output.replace(/<meta\s+property=["']og:url["'][^>]*>/i, ogUrlTag);
  } else {
    output = output.replace(/<\/head>/i, `  ${ogUrlTag}\n</head>`);
  }

  output = output
    .replace(
      /<meta\s+property=["']og:site_name["'][^>]*>/i,
      '<meta property="og:site_name" content="Watchdog">'
    )
    .replace(/"item"\s*:\s*"https:\/\/(?:www\.)?njpropertytaxrelief\.com\/"/g, `"item":"${CANONICAL_ORIGIN}/"`)
    .replace(/"url"\s*:\s*"https:\/\/(?:www\.)?njpropertytaxrelief\.com\/property\/"/g, `"url":"${CANONICAL_ORIGIN}/"`);

  return output;
}

async function fetchSource(publicPath) {
  const origins = deploymentOrigins();
  const candidates = pageSourceCandidates(publicPath);
  let lastStatus = 404;

  for (const origin of origins) {
    for (const candidate of candidates) {
      try {
        const response = await fetch(`${origin}${candidate}`, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'WatchdogIndexRouteAdapter/1.0',
            Accept: 'text/html,application/xhtml+xml'
          },
          signal: AbortSignal.timeout(6000)
        });
        lastStatus = response.status;
        if (!response.ok) continue;

        const type = String(response.headers.get('content-type') || '').toLowerCase();
        if (!type.includes('text/html')) continue;

        return { response, html: await response.text() };
      } catch (error) {
        console.warn('WATCHDOG_INDEX_SOURCE_FETCH_FAILED', origin, candidate, String(error?.message || error));
      }
    }
  }

  return { response: null, html: null, status: lastStatus };
}

module.exports = async function handler(req, res) {
  if (requestHost(req) !== CANONICAL_HOST) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Not found');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Method not allowed');
  }

  const publicPath = normalizePagePath(firstValue(req.query.path));
  if (!publicPath) {
    res.statusCode = 400;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Invalid path');
  }

  const source = await fetchSource(publicPath);
  if (!source.response || source.html == null) {
    res.statusCode = source.status === 503 ? 503 : 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(source.status === 503 ? 'Watchdog is temporarily unavailable.' : 'Not found');
  }

  const canonicalUrl = `${CANONICAL_ORIGIN}${publicPath === '/' ? '/' : publicPath}`;
  const html = setCanonicalMetadata(source.html, canonicalUrl);
  const upstreamCache = source.response.headers.get('cache-control');
  const upstreamRobots = source.response.headers.get('x-robots-tag');
  const forceNoIndex = NOINDEX_PATH_PREFIXES.some(prefix => publicPath === prefix || publicPath.startsWith(`${prefix}/`));

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', upstreamCache || 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Link', `<${canonicalUrl}>; rel="canonical"`);
  res.setHeader('Vary', 'Host');
  if (upstreamRobots) res.setHeader('X-Robots-Tag', upstreamRobots);
  else if (forceNoIndex) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method === 'HEAD') return res.end();
  return res.end(html);
};
