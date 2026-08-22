const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

const NOINDEX_PATH_PREFIXES = [
  '/data-center',
  '/data-workbench',
  '/developer-data',
  '/diagnostics',
  '/growth',
  '/insights/admin',
  '/marketing-studio'
];

const IMPLEMENTATION_PREFIXES = [
  '/property/assets/',
  '/property/css/',
  '/property/data/',
  '/property/docs/',
  '/property/generated/',
  '/property/js/',
  '/property/logs/',
  '/property/partials/',
  '/property/scripts/',
  '/property/sql/',
  '/property/tests/'
];

const INTERNAL_PROPERTY_FILES = new Set([
  '/property/footer.html',
  '/property/nav.html',
  '/property/sidemenu.html',
  '/property/manifest.webmanifest'
]);

const NON_PAGE_EXTENSION = /\.(?:avif|bmp|csv|css|gif|geojson|ico|jpe?g|js|json|map|md|mjs|mp4|otf|pdf|png|py|sql|svg|ts|ttf|txt|webmanifest|webp|woff2?|xml|zip)$/i;

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
    const host = String(raw).trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
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

function isImplementationPropertyPath(value) {
  const { path } = splitSuffix(value);
  const lower = path.toLowerCase();
  if (INTERNAL_PROPERTY_FILES.has(lower)) return true;
  if (IMPLEMENTATION_PREFIXES.some(prefix => lower.startsWith(prefix))) return true;
  return NON_PAGE_EXTENSION.test(lower) && !/\.html$/i.test(lower);
}

function cleanPropertyPath(value) {
  if (isImplementationPropertyPath(value)) return value;
  const { path, suffix } = splitSuffix(value);
  let clean = path.replace(/^\/property(?=\/|$)/i, '') || '/';
  clean = normalizePagePath(clean) || clean;
  return `${clean}${suffix}`;
}

function rewriteAbsolutePropertyUrls(html) {
  return html.replace(
    /https:\/\/(?:www\.)?njpropertytaxrelief\.com\/property([^"'<>\s]*)/gi,
    (full, rest) => {
      const propertyPath = `/property${rest || '/'}`;
      if (isImplementationPropertyPath(propertyPath)) return full;
      return `${CANONICAL_ORIGIN}${cleanPropertyPath(propertyPath)}`;
    }
  );
}

function rewriteNavigationLinks(html) {
  return html
    .replace(/(<a\b[^>]*\bhref=["'])\/property([^"']*)(["'])/gi, (full, start, rest, end) => {
      const value = `/property${rest}`;
      return isImplementationPropertyPath(value) ? full : `${start}${cleanPropertyPath(value)}${end}`;
    })
    .replace(/(<form\b[^>]*\baction=["'])\/property([^"']*)(["'])/gi, (full, start, rest, end) => {
      const value = `/property${rest}`;
      return isImplementationPropertyPath(value) ? full : `${start}${cleanPropertyPath(value)}${end}`;
    });
}

function cleanRouteRuntime() {
  return `<script id="watchdog-clean-route-runtime">(function(){
'use strict';
var prefixes=['/property/assets/','/property/css/','/property/data/','/property/docs/','/property/generated/','/property/js/','/property/logs/','/property/partials/','/property/scripts/','/property/sql/','/property/tests/'];
var files={'/property/footer.html':1,'/property/nav.html':1,'/property/sidemenu.html':1,'/property/manifest.webmanifest':1};
var nonPage=/\\.(?:avif|bmp|csv|css|gif|geojson|ico|jpe?g|js|json|map|md|mjs|mp4|otf|pdf|png|py|sql|svg|ts|ttf|txt|webmanifest|webp|woff2?|xml|zip)$/i;
function internal(path){var lower=String(path||'').toLowerCase();if(files[lower])return true;for(var i=0;i<prefixes.length;i++)if(lower.indexOf(prefixes[i])===0)return true;return nonPage.test(lower)&&! /\\.html$/i.test(lower);}
function clean(value){try{var u=new URL(value,location.origin);if(u.origin!==location.origin)return null;if(u.pathname!=='/property'&&u.pathname.indexOf('/property/')!==0)return null;if(internal(u.pathname))return null;var p=u.pathname.slice(9)||'/';p=p.replace(/\\/index\\.html$/i,'/').replace(/\\.html$/i,'');if(p.length>1)p=p.replace(/\\/+$/,'');return p+u.search+u.hash;}catch(_){return null;}}
function normalize(root){var scope=root&&root.querySelectorAll?root:document;scope.querySelectorAll('a[href]').forEach(function(a){var v=clean(a.getAttribute('href'));if(v!==null)a.setAttribute('href',v);});scope.querySelectorAll('form[action]').forEach(function(f){var v=clean(f.getAttribute('action'));if(v!==null)f.setAttribute('action',v);});}
function boot(){normalize(document);if(!window.MutationObserver)return;new MutationObserver(function(records){records.forEach(function(r){r.addedNodes&&r.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.matches&&n.matches('a[href],form[action]'))normalize(n.parentNode||n);else normalize(n);}});});}).observe(document.documentElement,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`;
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

  return output.replace(/<\/body>/i, `${cleanRouteRuntime()}\n</body>`);
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
