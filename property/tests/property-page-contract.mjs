// Public property pages: /nj/<town>/<address>-<zip> (published) and /nj/<town>/<address>/<pams_pin>.
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
const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
assert.ok(hrefs.length > 10);
assert.ok(hrefs.every((h) => !h.startsWith('/property/')), 'no /property/ paths in public links');
// Owner data never appears. The report form asks for the requester's own
// mailing address, so it is left out of this check.
const outsideForm = html.replace(/<section class="wdp-panel wdp-report"[\s\S]*?<\/section>/, '').replace(/<script>[\s\S]*?<\/script>/g, '');
const withoutPolicy = outsideForm.replace(/Watchdog does not show owner names( or mailing addresses)?\./g, '').replace(/Does Watchdog show who owns this property\?/g, '');
assert.doesNotMatch(withoutPolicy, /\bowners?\b|\bmailing\b/i, 'no owner or mailing data');

// Site chrome and the dashboard board look
assert.match(html, /<header class="wd-nav" id="wd-nav">/, 'standard Watchdog header');
assert.match(html, /id="wd-main-sheet"/, 'universal menu sheet');
assert.match(html, /<script src="\/property\/js\/public-nav\.js"><\/script>/, 'shared public navigation');
assert.match(html, /\/property\/partials\/footer\.html/, 'shared footer');
assert.match(html, /--b-bg:#f3f1ec/, 'dashboard board background');
for (const c of ['wdp-card--score', 'wdp-card--tax', 'wdp-card--sales', 'wdp-card--home']) assert.ok(html.includes(c), `summary card ${c}`);
assert.doesNotMatch(html, /tp-hero/, 'no dark banner hero');

// Sharing and homeowner tools
for (const s of ['data-wdp-copy', 'data-wdp-native', 'data-wdp-print', 'facebook.com/sharer', 'twitter.com/intent/tweet', 'linkedin.com/sharing', 'sms:?&amp;body=', 'mailto:?subject=']) assert.ok(html.includes(s), `share option ${s}`);
assert.match(html, /href="\/appeal-savings-estimator\/\?assessed=424300&amp;rate=2\.384/, 'appeal estimator prefilled with assessment and town rate');
assert.match(html, /\/nj-property-tax-calendar/, 'appeal deadlines');
assert.match(html, /\/senior-benefit-estimator/, 'relief programs');
assert.match(html, /\$2\.384<\/b><span>2025 rate<\/span>/, 'town tax rate from the state table');
assert.match(html, /Rates start in 2020, the first year after the last town-wide revaluation\./, 'rate trend starts after the last revaluation');
assert.match(html, /"@type":"FAQPage"/, 'FAQ structured data');
assert.match(html, /WatchdogPublicNav\.remember/, 'page is remembered in recent properties');
assert.equal(page.rateTrend({ town: 'WOODBRIDGE TWP', county: 'MIDDLESEX' }).cutAtReval, false);
assert.match(page.renderPage({ ...row, score: null }), /Still being calculated/);
assert.equal(page.INDEXABLE_COUNTIES.size, 0, 'only published pages are indexed');

// Claim, photo, recent sales, PDF report
assert.match(html, /href="\/home\?pin=0904_9_20">.*Claim this home/, 'claim this home');
assert.match(html, /href="\/home\?pin=0904_9_20#photo">.*Add a photo/, 'add a photo');
assert.doesNotMatch(html, /<figure class="wdp-photo">/, 'no photo block without an approved photo');
assert.match(page.renderPage(row, { photoUrl: 'https://x.supabase.co/storage/v1/object/sign/property-photos/a.jpg?token=t' }), /<figure class="wdp-photo"><img src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\/property-photos\/a\.jpg\?token=t"/, 'approved homeowner photo shows');
const withSales = page.renderPage({ ...row, recent_sales: [{ pams_pin: '0904_9_4', address: '134 GRANT AVE', town: 'HARRISON TOWN', price: 775000, date: '2024-08-18', year_built: 1960, same_street: true }], sales_summary: { count: 69, median: 700000, first_date: '2023-09-28' } });
assert.match(withSales, /id="wdp-sales"/, 'recent sales section');
assert.match(withSales, /134 Grant Ave<\/a><span class="wdp-tag">Same street<\/span>/);
assert.match(withSales, /\$775,000/);
assert.match(withSales, /Similar sales since 2023/);
assert.match(withSales, /can include sales between relatives or other non-market transfers/, 'honest about the sale data');
assert.doesNotMatch(html, /non-market transfer \(for example/, 'no per-sale non-market label from the unconfirmed sales code');
assert.match(html, /<form class="wdp-form" id="wdp-report-form" novalidate>/, 'PDF report form');
for (const f of ['name="name"', 'name="email"', 'name="phone"', 'name="address"', 'name="consent" type="checkbox" required']) assert.ok(html.includes(f), `report field ${f}`);
assert.match(html, /may contact me by phone, text or email about this property/, 'contact consent text');
assert.match(html, /fetch\('\/api\/watchdog-property-report'/, 'form posts to the report API');

// PDF report API
const report = require(new URL('api/watchdog-property-report.js', root).pathname);
const good = { pin: '0904_9_20', name: 'Pat Doe', email: 'pat@example.com', phone: '(856) 555-0100', address: '1 Main St, Trenton, NJ 08608', consent: true };
assert.ok(report.validate(good).value);
for (const [k, v] of [['name', 'P'], ['email', 'nope'], ['phone', '555-0100'], ['address', 'NJ'], ['consent', false], ['pin', 'x']]) assert.ok(report.validate({ ...good, [k]: v }).error, `rejects bad ${k}`);
assert.equal(report.pdfText('A – B · C ’s ☃'), "A - B - C 's ");
const pdf = await report.buildPdf({ ...row, recent_sales: [{ pams_pin: '0904_9_4', address: '134 GRANT AVE', price: 775000, date: '2024-08-18', same_street: true }] }, { name: 'Pat Doe' });
assert.ok(pdf.length > 3000 && Buffer.from(pdf.slice(0, 5)).toString() === '%PDF-', 'builds a PDF');
const reportSql = read('supabase/migrations/20260928234000_property_page_sales_reports.sql');
assert.match(reportSql, /revoke all on public\.property_report_requests from anon, authenticated;/, 'report requests are server-only');
assert.match(reportSql, /contact_consent boolean not null check \(contact_consent\)/, 'consent is required');
assert.match(reportSql, /cron\.schedule\('watchdog-recent-sales', '39 6 4 \* \*'/, 'recent sales refresh monthly');

// Handler: redirect, 404, cache. rpcs maps an RPC name to its response.
async function call(path, rpcs, req = {}) {
  const res = { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, end(b) { this.body = b; return this; } };
  const realFetch = global.fetch;
  const calls = [];
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  global.fetch = async (url, opts) => {
    const name = String(url).split('/rpc/')[1];
    calls.push({ name, body: opts && opts.body ? JSON.parse(opts.body) : null });
    return { ok: true, json: async () => (name in rpcs ? rpcs[name] : null) };
  };
  try { await page({ method: 'GET', query: { path }, headers: {}, ...req }, res); } finally { global.fetch = realFetch; }
  res.calls = calls;
  return res;
}
let res = await call('/nj/property/0904_9_20', { get_public_property_page: row });
assert.equal(res.statusCode, 308);
assert.equal(res.headers.location, '/nj/harrison-town/102-grant-ave/0904_9_20');
res = await call('/nj/harrison-town/102-grant-ave/0904_9_20', { get_public_property_page: row });
assert.equal(res.statusCode, 200);
assert.match(res.headers['cache-control'], /s-maxage=86400/);
assert.equal(res.headers['x-robots-tag'], 'noindex, follow', 'unpublished PIN pages stay noindex');
res = await call('/nj/harrison-town/102-grant-ave/0904_9_21', {});
assert.equal(res.statusCode, 404);

// Published pages: /nj/<town>/<address>-<zip>
const published = { pams_pin: '0904_9_20', path: '/nj/harrison-town/102-grant-avenue-07029', property_zip: '07029', postal_city: 'HARRISON' };
assert.equal(page.spelledAddress('11 DALTON PL'), '11 DALTON PLACE');
assert.equal(page.spelledAddress('5 MAIN ST UNIT 4'), '5 MAIN STREET UNIT 4');
assert.equal(page.spelledAddress('ROUTE 9'), 'ROUTE 9');
assert.equal(page.pageSlug({ address: '11 DALTON PL' }, '08081'), '11-dalton-place-08081');
assert.equal(page.pageSlug({ address: '11 DALTON PL' }, '19103'), '11-dalton-place', 'only NJ ZIPs go in the URL');
assert.deepEqual(page.parsePath('/nj/winslow-township/11-dalton-place-08081'), { town: 'winslow-township', slug: '11-dalton-place-08081', path: '/nj/winslow-township/11-dalton-place-08081' });
assert.equal(page.parsePath('/nj/property/0904_9_20').pin, '0904_9_20', 'short PIN links still parse');
res = await call('/nj/harrison-town/102-grant-avenue-07029', { get_public_property_page_slug: published, get_public_property_page: row });
assert.equal(res.statusCode, 200);
assert.equal(res.headers['x-robots-tag'], undefined, 'published pages are indexable');
assert.equal(res.headers.link, '<https://www.watchdogindex.com/nj/harrison-town/102-grant-avenue-07029>; rel="canonical"');
const shell = res.body;
assert.match(shell, /<title>102 Grant Ave, Harrison, NJ 07029 \| Property Tax &amp; Watchdog Score<\/title>/, 'title uses the postal town and property ZIP');
assert.match(shell, /<meta name="robots" content="index, follow/);
assert.match(shell, /<link rel="canonical" href="https:\/\/www\.watchdogindex\.com\/nj\/harrison-town\/102-grant-avenue-07029">/);
assert.equal((shell.match(/<link rel="canonical"/g) || []).length, 1, 'one canonical');
assert.equal((shell.match(/<title>/g) || []).length, 1, 'one title');
assert.match(shell, /<div class="plm open" id="plm"/, 'popup is open on load');
assert.match(shell, /<div class="plm-backdrop open" id="plm-backdrop"/);
assert.match(shell, /<body[^>]*class="plm-locked/);
assert.match(shell, /id="pl-addr"/, 'it is the home search page underneath');
assert.match(shell, /<div class="wdp" id="plm-ssr">/, 'server-rendered property record inside the popup');
assert.match(shell, /The Watchdog Score, powered by the ROBUST Framework\./);
assert.match(shell, /window\.WD_PROPERTY_PAGE=\{"pin":"0904_9_20","path":"\/nj\/harrison-town\/102-grant-avenue-07029","published":true/);
assert.ok(shell.indexOf('window.WD_PROPERTY_PAGE') < shell.indexOf('/property/js/lookup.js'), 'boot data comes before lookup.js');
assert.match(shell, /"@type":"FAQPage"/);
assert.doesNotMatch(shell.replace(/<!--[\s\S]*?Hi There[\s\S]*?-->/g, '').replace(/<!--[\s\S]*?OH[\s\S]*?-->/g, ''), /<!--/, 'no new HTML comments');
const shellOutsideForm = shell.slice(shell.indexOf('id="plm-ssr"'), shell.indexOf('<section class="wdp-panel wdp-report"'));
assert.doesNotMatch(shellOutsideForm.replace(/Watchdog does not show owner names( or mailing addresses)?\./g, ''), /\bowners?\b|\bmailing\b/i, 'no owner or mailing data in the popup record');
res = await call('/nj/harrison-town/102-grant-avenue-07028', { get_public_property_page_slug: null });
assert.equal(res.statusCode, 404, 'unknown slugs 404');
res = await call('/nj/harrison-town/102-grant-ave/0904_9_20', { get_public_property_page: row, get_public_property_page_by_pin: published });
assert.equal(res.statusCode, 308, 'PIN links to a published property redirect to it');
assert.equal(res.headers.location, '/nj/harrison-town/102-grant-avenue-07029');
res = await call('/nj/property/0904_9_20', { get_public_property_page: row, get_public_property_page_by_pin: published });
assert.equal(res.headers.location, '/nj/harrison-town/102-grant-avenue-07029');

// Publishing on first search
const browser = { host: 'www.watchdogindex.com', origin: 'https://www.watchdogindex.com', 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605.1.15' };
res = await call('', { get_public_property_page: row, publish_public_property_page: '/nj/harrison-town/102-grant-avenue-07029' }, { method: 'POST', headers: browser, body: { pin: '0904_9_20', zip: '07029', city: 'Harrison' } });
assert.equal(res.statusCode, 200);
assert.deepEqual(JSON.parse(res.body), { path: '/nj/harrison-town/102-grant-avenue-07029' });
assert.deepEqual(res.calls.find((c) => c.name === 'publish_public_property_page').body, { p_pin: '0904_9_20', p_town_slug: 'harrison-town', p_page_slug: '102-grant-avenue-07029', p_zip: '07029', p_city: 'Harrison' });
res = await call('', {}, { method: 'POST', headers: { ...browser, origin: 'https://evil.example' }, body: { pin: '0904_9_20' } });
assert.equal(res.statusCode, 403, 'other sites cannot publish');
res = await call('', {}, { method: 'POST', headers: { ...browser, 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, body: { pin: '0904_9_20' } });
assert.equal(res.statusCode, 403, 'crawlers do not publish');
res = await call('', {}, { method: 'POST', headers: browser, body: { pin: 'nope' } });
assert.equal(res.statusCode, 400);
res = await call('', { get_public_property_page: row, publish_public_property_page: '/nj/x/y' }, { method: 'POST', headers: browser, body: { pin: '0904_9_20', zip: '<b>' } });
assert.equal(res.calls.find((c) => c.name === 'publish_public_property_page').body.p_zip, null, 'bad ZIPs are dropped');

// Property sitemap
const sitemap = require(new URL('api/watchdog-property-sitemap.js', root).pathname);
const xml = sitemap.renderXml([{ path: '/nj/harrison-town/102-grant-avenue-07029', lastmod: '2026-10-07T13:00:00Z' }, { path: '/nj/bad path/<x>' }]);
assert.match(xml, /<loc>https:\/\/www\.watchdogindex\.com\/nj\/harrison-town\/102-grant-avenue-07029<\/loc>\n    <lastmod>2026-10-07<\/lastmod>/);
assert.doesNotMatch(xml, /bad path/);
assert.match(middleware, /url\.pathname==='\/sitemap-properties\.xml'\)return rewriteWatchdogSystemFile\(request,'\/api\/watchdog-property-sitemap'\)/);
assert.match(read('api/watchdog-index-robots.js'), /Sitemap: \$\{CANONICAL_ORIGIN\}\/sitemap-properties\.xml/);
const pubSql = read('supabase/migrations/20261007160000_published_property_pages.sql');
assert.match(pubSql, /revoke all on public\.public_property_pages from anon, authenticated;/, 'published list is server-only');
for (const fn of ['publish_public_property_page(text, text, text, text, text)', 'get_public_property_page_slug(text, text)', 'get_public_property_page_by_pin(text)', 'list_public_property_pages(integer, integer)']) {
  assert.ok(pubSql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), `${fn} revoked`);
  assert.ok(pubSql.includes(`grant execute on function public.${fn} to service_role;`), `${fn} service only`);
}
const vercel = JSON.parse(read('vercel.json'));
assert.match(vercel.functions['api/watchdog-property-page.js'].includeFiles, /property\/index\.html/, 'home page ships with the property page function');

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
