import { next, rewrite } from '@vercel/functions';

const WATCHDOG_HOST = 'www.watchdogindex.com';

export default function middleware(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  if (
    host === WATCHDOG_HOST &&
    (url.pathname === '/property' || url.pathname === '/property/')
  ) {
    const destination = new URL('/api/watchdog-index-entry', request.url);
    return rewrite(destination);
  }

  return next();
}

export const config = {
  matcher: '/property/:path*'
};
