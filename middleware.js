import { next, rewrite } from '@vercel/functions';

const WATCHDOG_HOST = 'www.watchdogindex.com';
const LEGACY_NJPTR_HOSTS = new Set(['njpropertytaxrelief.com', 'www.njpropertytaxrelief.com']);
const INDEXNOW_KEY_PATH = '/c04eb5246cd74475b86188f12c31e21b.txt';
const RESERVED_ROOT_PREFIXES = ['/api', '/towns', '/.well-known', '/_vercel'];
const STATIC_FILE = /\.[A-Za-z0-9]{1,10}$/;
const TYPED_SITEMAP_FILE = /^\/sitemap-[a-z0-9-]+\.xml$/i;
const BULK_SALES_FILE = /^\/property\/sales-[a-z-]+\.json$/i;
const SALES_API_PATH = '/api/sales-by-district';
const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const ROOT_STATIC_PAGES = new Set(['/move', '/contact', '/developer/communications']);
const ROOT_COMPAT_REDIRECTS = new Map([
  ['/contact.html', '/contact']
]);
const LEGACY_FAQ_PATHS = new Set([
  '/property/faq',
  '/property/faq/',
  '/property/faq.html',
  '/property/faq/index.html'
]);
const LEGACY_PUBLIC_REDIRECTS = new Map([
  ['/property/privacy', '/privacy'],
  ['/property/privacy/', '/privacy'],
  ['/property/privacy/index.html', '/privacy'],
  ['/property/terms', '/terms'],
  ['/property/terms/', '/terms'],
  ['/property/terms/index.html', '/terms'],
  ['/property/refunds', '/refunds'],
  ['/property/refunds/', '/refunds'],
  ['/property/refunds/index.html', '/refunds'],
  ['/property/support', '/support'],
  ['/property/support/', '/support'],
  ['/property/support/index.html', '/support'],
  ['/property/data-deletion', '/data-deletion'],
  ['/property/data-deletion/', '/data-deletion'],
  ['/property/data-deletion/index.html', '/data-deletion']
]);

function isReservedRootPath(pathname) {
  return RESERVED_ROOT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function cleanPublicPath(pathname) {
  let path = String(pathname || '/').replace(/\/{2,}/g, '/');
  path = path.replace(/\/index\.html$/i, '');
  path = path.replace(/\.html$/i, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

function legacyWatchdogPath(pathname) {
  const raw = String(pathname || '/');
  if (raw === '/property' || raw === '/property/') return '/';

  const remainder = raw.slice('/property'.length) || '/';

  // Browser-facing legacy Watchdog pages move to the clean canonical route on
  // watchdogindex.com. Static implementation assets keep /property/ on the new
  // host so old NJPTR pages cannot accidentally break while the asset tree is
  // still physically stored under property/ in this shared deployment.
  if (STATIC_FILE.test(remainder) && !/\.html$/i.test(remainder)) {
    return '/property' + remainder;
  }

  return cleanPublicPath(remainder);
}

function redirectLegacyWatchdogHost(url) {
  const destination = new URL(legacyWatchdogPath(url.pathname), `https://${WATCHDOG_HOST}`);
  destination.search = url.search;
  return Response.redirect(destination, 308);
}

function rewriteCleanPage(request, publicPath) {
  const destination = new URL('/api/watchdog-index-page-contact-safe', request.url);
  destination.searchParams.set('path', publicPath);
  return rewrite(destination);
}

function rewriteWatchdogSystemFile(request, apiPath) {
  return rewrite(new URL(apiPath, request.url));
}

function redirectCanonical(request, url, pathname) {
  const destination = new URL(pathname, request.url);
  destination.search = url.search;
  return Response.redirect(destination, 308);
}

function blockedDataResponse(status, message, cacheControl) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Watchdog-Data-Access': 'scoped-only'
    }
  });
}

export default function middleware(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const userAgent = request.headers.get('user-agent') || '';

  // NJPropertyTaxRelief is no longer a serving host for Watchdog. Every legacy
  // /property route leaves the old domain before any static file, rewrite or
  // compatibility route can serve it. Query strings are preserved so report,
  // search, auth and campaign links survive the domain cutover.
  if (
    LEGACY_NJPTR_HOSTS.has(host) &&
    (url.pathname === '/property' || url.pathname === '/property/' || url.pathname.startsWith('/property/'))
  ) {
    return redirectLegacyWatchdogHost(url);
  }

  // Bulk county sales files remain server-readable for the municipality-scoped
  // function, but are never delivered as static assets. This applies to every
  // alias on the deployment, not only the canonical Watchdog host.
  if (BULK_SALES_FILE.test(url.pathname)) {
    console.warn('watchdog-data-edge', JSON.stringify({ event: 'bulk_sales_blocked', path: url.pathname }));
    return blockedDataResponse(404, 'Bulk sales files are not a public delivery surface.', 'public, max-age=300, s-maxage=86400');
  }

  // Obvious non-browser extraction clients are stopped before function compute.
  // This is deliberately narrow: normal browsers and legitimate crawlers are not
  // challenged merely because the underlying records are public.
  if (url.pathname === SALES_API_PATH && AUTOMATION_UA.test(userAgent)) {
    console.warn('watchdog-data-edge', JSON.stringify({ event: 'automation_client_blocked', path: url.pathname }));
    return blockedDataResponse(403, 'Automated bulk extraction is not permitted on this endpoint.', 'no-store');
  }

  if (host !== WATCHDOG_HOST) return next();

  // WatchdogIndex has its own canonical crawl contract. Keep the legacy
  // NJPropertyTaxRelief robots/sitemaps untouched for the separate legacy site.
  if (url.pathname === INDEXNOW_KEY_PATH) {
    return rewriteWatchdogSystemFile(request, '/api/watchdog-index-indexnow-key');
  }
  if (url.pathname === '/robots.txt') {
    return rewriteWatchdogSystemFile(request, '/api/watchdog-index-robots');
  }
  // The primary sitemap is dynamically normalized/aggregated. Typed sitemap
  // files must pass through unchanged so Search Console can measure each
  // public cluster independently instead of receiving the aggregate feed.
  if (url.pathname === '/sitemap.xml') {
    return rewriteWatchdogSystemFile(request, '/api/watchdog-index-sitemap');
  }
  if (TYPED_SITEMAP_FILE.test(url.pathname)) return next();

  // Retire old root-level browser redirects in favor of real HTTP canonical
  // redirects so search engines and assistive technology see one clean route.
  if (ROOT_COMPAT_REDIRECTS.has(url.pathname)) {
    return redirectCanonical(request, url, ROOT_COMPAT_REDIRECTS.get(url.pathname));
  }

  // Retire compatibility URLs for public Watchdog pages on the canonical host.
  // These redirects prevent old /property/* copies from exposing stale contact
  // details and keep one authoritative customer-facing route for each surface.
  if (LEGACY_FAQ_PATHS.has(url.pathname)) {
    return redirectCanonical(request, url, '/faq');
  }
  if (LEGACY_PUBLIC_REDIRECTS.has(url.pathname)) {
    return redirectCanonical(request, url, LEGACY_PUBLIC_REDIRECTS.get(url.pathname));
  }

  const publicPath = cleanPublicPath(url.pathname);

  // A small set of modern Watchdog pages intentionally live at the repository
  // root rather than under /property. Let Vercel serve their directory indexes
  // directly so the canonical clean URL remains /contact, /move, etc.
  if (ROOT_STATIC_PAGES.has(publicPath)) return next();

  // Keep the proven legacy Watchdog entry available while clean routes are staged.
  if (url.pathname === '/property' || url.pathname === '/property/') {
    return rewrite(new URL('/api/watchdog-index-entry', request.url));
  }

  // Existing /property/* implementation and compatibility paths remain untouched
  // unless explicitly canonicalized above. Assets and internal fragments rely on them.
  if (url.pathname.startsWith('/property/')) return next();

  // Preserve the legacy tax-relief site's root assets, town pages and API endpoints.
  if (isReservedRootPath(url.pathname) || STATIC_FILE.test(url.pathname)) return next();

  // On the dedicated Watchdog domain, extensionless root paths are Watchdog pages.
  // The contact-safe loader rejects Vercel authentication/error HTML, strips direct
  // staff contact data and returns Watchdog's branded 404 for missing routes.
  return rewriteCleanPage(request, publicPath);
}

export const config = {
  matcher: ['/', '/:path*']
};
