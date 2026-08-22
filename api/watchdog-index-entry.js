import fs from 'node:fs/promises';
import path from 'node:path';

const CANONICAL_HOST = 'www.watchdogindex.com';
const LEGACY_PROPERTY_ORIGIN = 'https://njpropertytaxrelief.com/property/';
const WATCHDOG_PROPERTY_ORIGIN = 'https://www.watchdogindex.com/property/';

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
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
    const source = await fs.readFile(sourcePath, 'utf8');
    const html = canonicalizeWatchdogHtml(source);

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
