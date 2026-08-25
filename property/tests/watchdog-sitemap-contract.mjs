import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.VERCEL_URL = 'watchdog-sitemap-contract.invalid';
delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

const sourceXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://njpropertytaxrelief.com/property/towns/camden/</loc><lastmod>2026-08-20</lastmod></url>
  <url><loc>https://www.njpropertytaxrelief.com/property/towns/camden/index.html</loc><lastmod>2026-08-21</lastmod></url>
  <url><loc>https://www.watchdogindex.com/property/plays/appeal-window-farm.html</loc><lastmod>2026-08-22</lastmod></url>
  <url><loc>https://www.watchdogindex.com/property/growth/index.html</loc><lastmod>2026-08-22</lastmod></url>
  <url><loc>https://www.watchdogindex.com/property/dashboard.html</loc><lastmod>2026-08-22</lastmod></url>
  <url><loc>https://example.com/not-watchdog</loc><lastmod>2026-08-22</lastmod></url>
</urlset>`;

globalThis.fetch = async () => new Response(sourceXml, {
  status: 200,
  headers: { 'content-type': 'application/xml' }
});

const { default: handler } = await import('../../api/watchdog-index-sitemap.js');

function responseHarness() {
  let body = '';
  const headers = new Map();
  return {
    statusCode: 200,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    end(value = '') { body += String(value); },
    get body() { return body; },
    get headers() { return headers; }
  };
}

const res = responseHarness();
await handler({ method: 'GET', headers: { host: 'www.watchdogindex.com' } }, res);

assert.equal(res.statusCode, 200);
assert.match(res.headers.get('content-type') || '', /application\/xml/);
assert.match(res.body, /<loc>https:\/\/www\.watchdogindex\.com\/<\/loc>/);
assert.match(res.body, /<loc>https:\/\/www\.watchdogindex\.com\/towns\/camden<\/loc>/);
assert.match(res.body, /<loc>https:\/\/www\.watchdogindex\.com\/plays\/appeal-window-farm<\/loc>/);
assert.doesNotMatch(res.body, /njpropertytaxrelief\.com/);
assert.doesNotMatch(res.body, /example\.com/);
assert.doesNotMatch(res.body, /\/growth(?:<|\/)/);
assert.doesNotMatch(res.body, /\/dashboard(?:<|\/)/);
assert.doesNotMatch(res.body, /\/property\//);
assert.doesNotMatch(res.body, /\.html<\/loc>/);

const locs = [...res.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(locs.length, new Set(locs).size, 'canonical sitemap must not contain duplicate URLs');
assert.equal(locs.filter(loc => loc === 'https://www.watchdogindex.com/towns/camden').length, 1);

const camdenBlock = res.body.match(/<url>\s*<loc>https:\/\/www\.watchdogindex\.com\/towns\/camden<\/loc>[\s\S]*?<\/url>/)?.[0] || '';
assert.match(camdenBlock, /<lastmod>2026-08-21<\/lastmod>/, 'duplicate canonical URLs must retain the newest real lastmod');

const wrongHost = responseHarness();
await handler({ method: 'GET', headers: { host: 'njpropertytaxrelief.com' } }, wrongHost);
assert.equal(wrongHost.statusCode, 404, 'canonical Watchdog sitemap must not be served from a legacy host');

// Production routing contract: only the primary /sitemap.xml is rewritten to
// the dynamic aggregator. Typed feeds must remain real static files so search
// tools can measure the alternatives/calculators/statistics clusters separately.
const middleware = readFileSync(new URL('../../middleware.js', import.meta.url), 'utf8');
assert.match(
  middleware,
  /url\.pathname\s*===\s*['"]\/sitemap\.xml['"][\s\S]{0,300}watchdog-index-sitemap/,
  'primary sitemap must route through the canonical dynamic aggregator'
);
assert.match(
  middleware,
  /TYPED_SITEMAP_FILE\.test\(url\.pathname\)\)\s*return\s+next\(\)/,
  'typed sitemap files must bypass the aggregate sitemap rewrite'
);
assert.doesNotMatch(
  middleware,
  /if\s*\(\s*SITEMAP_FILE\.test\(url\.pathname\)\s*\)[\s\S]{0,300}watchdog-index-sitemap/,
  'broad sitemap wildcard routing would collapse typed feeds into the aggregate sitemap'
);

console.log(`Watchdog sitemap contract PASS (${locs.length} canonical URLs in fixture run + typed routing guard)`);
