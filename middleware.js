import { next, rewrite } from '@vercel/functions';

const WATCHDOG_HOST = 'www.watchdogindex.com';
const RESERVED_ROOT_PREFIXES = ['/api', '/towns', '/.well-known', '/_vercel'];
const STATIC_FILE = /\.[A-Za-z0-9]{1,10}$/;
const SITEMAP_FILE = /^\/sitemap(?:-[a-z0-9-]+)?\.xml$/i;
const LEGACY_FAQ_PATHS = new Set([
  '/property/faq',
  '/property/faq/',
  '/property/faq.html',
  '/property/faq/index.html'
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

function rewriteCleanPage(request, publicPath) {
  const destination = new URL('/api/watchdog-index-page', request.url);
  destination.searchParams.set('path', publicPath);
  return rewrite(destination);
}

function rewriteWatchdogSystemFile(request, apiPath) {
  return rewrite(new URL(apiPath, request.url));
}

function redirectLegacyFaq(request, url) {
  const destination = new URL('/faq', request.url);
  destination.search = url.search;
  return Response.redirect(destination, 308);
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
  if (SITEMAP_FILE.test(url.pathname)) {
    return rewriteWatchdogSystemFile(request, '/api/watchdog-index-sitemap');
  }

  // Retire the former Watchdog FAQ compatibility files on the canonical host.
  // Preserve query strings and leave the separate legacy host untouched.
  if (LEGACY_FAQ_PATHS.has(url.pathname)) {
    return redirectLegacyFaq(request, url);
  }

  // Watchdog Move is intentionally staged as a root-level, unlinked study surface.
  // Serve its static index directly instead of sending it through the /property/*
  // clean-route source loader, which has no /property/move source counterpart.
  if (url.pathname === '/move' || url.pathname === '/move/') return next();

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
