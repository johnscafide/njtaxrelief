import fs from 'node:fs/promises';
import path from 'node:path';

const CANONICAL_HOST = 'www.watchdogindex.com';
const LEGACY_PROPERTY_ORIGIN = 'https://njpropertytaxrelief.com/property/';
const WATCHDOG_PROPERTY_ORIGIN = 'https://www.watchdogindex.com/property/';
const FOOTER_PATH = '/property/partials/footer.html';

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
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
    if (!host || seen.has(host)) continue;
    seen.add(host);
    origins.push(`https://${host}`);
  }
  return origins;
}

async function fetchSharedFooter() {
  for (const origin of deploymentOrigins()) {
    try {
      const response = await fetch(`${origin}${FOOTER_PATH}`, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'WatchdogSharedFooter/1.0', Accept: 'text/html,*/*;q=0.2' },
        signal: AbortSignal.timeout(4000)
      });
      if (response.ok) return await response.text();
    } catch (error) {
      console.warn('WATCHDOG_SHARED_FOOTER_FETCH_FAILED', origin, String(error?.message || error));
    }
  }
  return '';
}

function useSharedFooter(source, footer) {
  if (!footer) return source;
  const footerStart = source.indexOf('<div\n    id="wd-property-footer"');
  const scriptsStart = source.indexOf('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet', footerStart);
  if (footerStart < 0 || scriptsStart < 0) {
    console.warn('WATCHDOG_SHARED_FOOTER_MARKERS_MISSING');
    return source;
  }
  return `${source.slice(0, footerStart)}${footer.trim()}\n\n${source.slice(scriptsStart)}`;
}

function canonicalizeWatchdogHtml(source) {
  return source
    .split(LEGACY_PROPERTY_ORIGIN).join(WATCHDOG_PROPERTY_ORIGIN)
    .replace(
      '<meta property="og:site_name" content="NJ Property Tax Relief Guide">',
      '<meta property="og:site_name" content="Watchdog">'
    )
    .replace(
      '"item": "https://njpropertytaxrelief.com/"',
      '"item": "https://www.watchdogindex.com/"'
    );
}

export default async function handler(req, res) {
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

  try {
    const sourcePath = path.join(process.cwd(), 'property', 'index.html');
    const [source, sharedFooter] = await Promise.all([
      fs.readFile(sourcePath, 'utf8'),
      fetchSharedFooter()
    ]);
    const html = canonicalizeWatchdogHtml(useSharedFooter(source, sharedFooter));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Link', '<https://www.watchdogindex.com/property/>; rel="canonical"');
    res.setHeader('Vary', 'Host');

    if (req.method === 'HEAD') return res.end();
    return res.end(html);
  } catch (error) {
    console.error('WATCHDOG_INDEX_ENTRY_ERROR', error);
    res.statusCode = 500;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Watchdog is temporarily unavailable.');
  }
}