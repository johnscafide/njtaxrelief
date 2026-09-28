// Public property pages: /nj/<town>/<address>/<pams_pin>.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const page = require(new URL('api/watchdog-property-page.js', root).pathname);
const middleware = read('middleware.js');
const lookup = read('property/js/lookup.js');
const index = read('property/index.html');
const sql = read('supabase/migrations/20260928230000_public_property_page.sql');

// URLs
assert.equal(page.townName('WOODBRIDGE TWP'), 'Woodbridge Township');
assert.equal(page.townName('SEA GIRT BORO'), 'Sea Girt Borough');
assert.equal(page.propertyPath({ town: 'WOODBRIDGE TWP', address: '46 FIAT AVE', pams_pin: '1225_446.04_38' }), '/nj/woodbridge-township/46-fiat-ave/1225_446.04_38');
assert.equal(page.propertyPath({ town: 'X CITY', address: '1 A & B ST', pams_pin: '0101_1_1_C&1' }), '/nj/x-city/1-a-and-b-st/0101_1_1_C%261');
assert.deepEqual(page.parsePath('/nj/property/0904_9_20'), { pin: '0904_9_20', path: '/nj/property/0904_9_20' });
assert.equal(page.parsePath('/nj/woodbridge-township/46-fiat-ave/1225_446.04_38/').pin, '1225_446.04_38');
for (const bad of ['/nj/x', '/nj/a/b/c/d/e', '/nj/a/b/not-a-pin', '/nj/a/b/%E0%A4%A', '/property/nj/a/b/0904_9_20']) assert.equal(page.parsePath(bad), null, bad);

// Rendering
const row = {
  pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN', county: 'HUDSON', zip: null,
  block: '9', lot: '20', qualifier: null, prop_class: '2', year_built: 1900, acres: 0.0574, dwelling_units: 2,
  building_desc: '2 SF 2 FAM', land_value: 180000, improvement_value: 244300, assessed_value: 424300, last_year_tax: 9954.08,
  last_sale_price: null, sale_flagged_non_market: false, source_synced_at: '2026-09-28T15:15:28Z',
  score: { score: 78, verdict: 'Favorable tax position', confidence: 'high', evidence_coverage: 85, components: { recourse: 60, fairness: { score: 100 }, burden: 86, uniformity: 69, stability: null, trajectory: 45 } },
  town_compare: { peers: 1964, median_tax: 10828, share_paying_less: 39 },
  neighbors: [{ pams_pin: '0904_9_1', address: '140 GRANT AVE', town: 'HARRISON TOWN', last_year_tax: 10655.53 }, { pams_pin: '0904_9_99', address: 'GRANT AVE', town: 'HARRISON TOWN', last_year_tax: 0 }]
};
const html = page.renderPage(row);
assert.match(html, /<title>102 Grant Ave, Harrison Town, NJ \| Property Tax &amp; Watchdog Score<\/title>/);
assert.match(html, /<link rel="canonical" href="https:\/\/www\.watchdogindex\.com\/nj\/harrison-town\/102-grant-ave\/0904_9_20">/, 'canonical is the clean www.watchdogindex.com URL');
assert.match(html, /<meta name="robots" content="noindex, follow">/, 'pages are noindex until their county is released');
assert.match(page.renderPage(row, { indexable: true }), /<meta name="robots" content="index, follow">/);
assert.match(html, /The Watchdog Score, powered by the ROBUST Framework\./, 'brand methodology phrase');
assert.doesNotMatch(html, /ROBUST Score/, 'never "ROBUST Score"');
assert.match(html, /This bill is lower than about 61% of them\./, 'town comparison wording');
assert.match(html, /href="\/robust\/overassessment-position"/, 'ROBUST parts link to their explainers');
assert.match(html, /<b>100<\/b>/, 'object-shaped component scores render');
assert.match(html, /href="\/nj\/harrison-town\/140-grant-ave\/0904_9_1"/, 'block neighbors link to their pages');
assert.doesNotMatch(html, /0904_9_99/, 'unnumbered, untaxed lots are left out');
assert.match(html, /href="\/\?address=102%20Grant%20Ave%2C%20Harrison%20Town%2C%20NJ"/, 'main button opens the full popup analysis');
assert.doesNotMatch(html, /\/property\//, 'no /property/ paths in public links');
assert.doesNotMatch(html.replace('Watchdog does not show owner names.', ''), /owner|mailing/i, 'no owner or mailing data');
assert.match(page.renderPage({ ...row, score: null }), /still being calculated/);
assert.equal(page.INDEXABLE_COUNTIES.size, 0, 'pilot: no county released to search engines yet');

// Handler: redirect, 404, cache
function call(path, data) {
  const res = { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, end(b) { this.body = b; return this; } };
  const realFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => data });
  return page({ method: 'GET', query: { path } }, res).then(() => { global.fetch = realFetch; return res; });
}
let res = await call('/nj/property/0904_9_20', row);
assert.equal(res.statusCode, 308);
assert.equal(res.headers.location, '/nj/harrison-town/102-grant-ave/0904_9_20');
res = await call('/nj/harrison-town/102-grant-ave/0904_9_20', row);
assert.equal(res.statusCode, 200);
assert.match(res.headers['cache-control'], /s-maxage=86400/);
assert.equal(res.headers['x-robots-tag'], 'noindex, follow');
res = await call('/nj/harrison-town/102-grant-ave/0904_9_21', null);
assert.equal(res.statusCode, 404);

// Routing and popup link
assert.match(middleware, /const PROPERTY_PAGE_PATH = /);
assert.ok(middleware.indexOf('PROPERTY_PAGE_PATH.test(url.pathname)') < middleware.indexOf("STATIC_FILE.test(url.pathname))return next();"), 'property route runs before the static-file check (PINs contain dots)');
assert.match(lookup, /location\.origin \+ '\/nj\/property\/' \+ encodeURIComponent\(current\.pin\)/, 'popup share link points at the property page');
assert.match(lookup, /location\.hostname !== 'www\.watchdogindex\.com'/, 'property page links only on the Watchdog host');
assert.match(index, /onclick="plFullPage\(\)"/, 'popup menu opens the full property page');

// Data function stays server-only
assert.match(sql, /revoke all on function public\.get_public_property_page\(text\) from public, anon, authenticated;/);
assert.match(sql, /grant execute on function public\.get_public_property_page\(text\) to service_role;/);
assert.match(sql, /cron\.schedule\('watchdog-town-class-stats', '29 6 4 \* \*'/, 'town stats refresh monthly after the parcel sync');

console.log('Property page contract passed.');
