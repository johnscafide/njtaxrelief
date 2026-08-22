import { next, rewrite } from '@vercel/functions';

const WATCHDOG_HOST = 'www.watchdogindex.com';
const RESERVED_ROOT_PREFIXES = ['/api', '/towns', '/.well-known', '/_vercel'];
const STATIC_FILE = /\.[A-Za-z0-9]{1,10}$/;

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

function rewriteCleanPage(request, publicPath) {
  const destination = new URL('/api/watchdog-index-page', request.url);
  destination.searchParams.set('path', publicPath);
  return rewrite(destination);
}

function rewriteWatchdogSystemFile(request, apiPath) {
  return rewrite(new URL(apiPath, request.url));
}

export default function middleware(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  if (host !== WATCHDOG_HOST) return next();

  // WatchdogIndex has its own canonical crawl contract. Keep the legacy
  // NJPropertyTaxRelief robots/sitemaps untouched for the separate legacy site.
  if (url.pathname === '/robots.txt') {
    return rewriteWatchdogSystemFile(request, '/api/watchdog-index-robots');
  }
  if (url.pathname === '/sitemap.xml') {
    return rewriteWatchdogSystemFile(request, '/api/watchdog-index-sitemap');
  }

  // Keep the proven legacy Watchdog entry available while clean routes are staged.
  if (url.pathname === '/property' || url.pathname === '/property/') {
    return rewrite(new URL('/api/watchdog-index-entry', request.url));
  }

  // Existing /property/* implementation and compatibility paths remain untouched
  // until clean-route acceptance passes. Assets and internal fragments rely on them.
  if (url.pathname.startsWith('/property/')) return next();

  // Preserve the legacy tax-relief site's root assets, town pages and API endpoints.
  if (isReservedRootPath(url.pathname) || STATIC_FILE.test(url.pathname)) return next();

  // On the dedicated Watchdog domain, extensionless root paths are Watchdog pages.
  return rewriteCleanPage(request, cleanPublicPath(url.pathname));
}

export const config = {
  matcher: ['/', '/:path*']
};
