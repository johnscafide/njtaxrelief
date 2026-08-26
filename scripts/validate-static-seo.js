const fs = require('fs');

let errors = [];
function read(p) {
  if (!fs.existsSync(p)) {
    errors.push('missing ' + p);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

const staticPlays = ['assessment-change', 'appeal-window-farm', 'permit-complete'];
for (const slug of staticPlays) {
  const p = `property/plays/${slug}/index.html`;
  const h = read(p);
  const must = [
    /<title>[^<]{15,}<\/title>/i,
    /<meta\s+name=["']description["'][^>]+content=["'][^"']{70,}["']/i,
    /<link\s+rel=["']canonical["'][^>]+>/i,
    /<h1[^>]*>[\s\S]*?<\/h1>/i,
    /application\/ld\+json/i,
    /What the data cannot tell you/i,
    /Official sources to verify/i
  ];
  must.forEach((rx, i) => {
    if (!rx.test(h)) errors.push(`${p} failed requirement ${i + 1}`);
  });
  if (/noindex/i.test((h.match(/<meta[^>]+robots[^>]*>/i) || [''])[0])) errors.push(p + ' is noindex');
  const text = h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 1400) errors.push(p + ' unique body is too thin');
}

const v = JSON.parse(read('vercel.json') || '{}');
const redirects = v.redirects || [];
const headers = v.headers || [];
const redirectSources = new Set();
for (const r of redirects) {
  if (redirectSources.has(r.source)) errors.push('duplicate redirect ' + r.source);
  redirectSources.add(r.source);
}
for (const need of ['/index-old.html', '/index_1.html', '/property/towns/:path*']) {
  if (!redirectSources.has(need)) errors.push('missing crawl redirect ' + need);
}

const noindexPaths = new Set(
  headers
    .filter(x => (x.headers || []).some(h => h.key === 'X-Robots-Tag' && /noindex/i.test(h.value)))
    .map(x => x.source)
);
for (const need of [
  '/btc.html',
  '/leadiq.html',
  '/qscore.html',
  '/property/insights/admin.html',
  '/property/data-workbench',
  '/property/data-center',
  '/property/growth/(.*)'
]) {
  if (!noindexPaths.has(need)) errors.push('missing X-Robots-Tag noindex ' + need);
}

const baselineSitemaps = ['sitemap.xml', 'sitemap-content.xml', 'sitemap-plays.xml', 'sitemap-glossary.xml'];
const typedSitemaps = ['sitemap-alternatives.xml', 'sitemap-calculators.xml', 'sitemap-statistics.xml'];
const guardedSitemaps = [...baselineSitemaps, ...typedSitemaps];
const robots = read('robots.txt');
for (const sm of guardedSitemaps) {
  if (!robots.includes(sm)) errors.push('robots missing ' + sm);
}

const canonicalRobots = read('api/watchdog-index-robots.js');
for (const sm of typedSitemaps) {
  if (!canonicalRobots.includes(`/${sm}`)) errors.push('canonical Watchdog robots missing ' + sm);
}

for (const sm of guardedSitemaps) {
  if (!fs.existsSync(sm)) continue;
  const x = read(sm);
  const urls = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (new Set(urls).size !== urls.length) errors.push(sm + ' contains duplicate URLs');
  for (const u of urls) {
    if (/\/property\/towns\/|\/(?:btc|leadiq|qscore)\.html/.test(u)) errors.push(sm + ' contains excluded URL ' + u);
  }
}

const expectedClusters = {
  'sitemap-alternatives.xml': [
    'https://www.watchdogindex.com/alternatives/propstream',
    'https://www.watchdogindex.com/alternatives/propertyradar',
    'https://www.watchdogindex.com/alternatives/batchdata',
    'https://www.watchdogindex.com/alternatives/attom',
    'https://www.watchdogindex.com/alternatives/regrid',
    'https://www.watchdogindex.com/alternatives/propertyshark',
    'https://www.watchdogindex.com/alternatives/zillow',
    'https://www.watchdogindex.com/alternatives/nj-county-board-lookup',
    'https://www.watchdogindex.com/pricing/propstream',
    'https://www.watchdogindex.com/pricing/propertyradar',
    'https://www.watchdogindex.com/guides/best-nj-property-data-tools',
    'https://www.watchdogindex.com/guides/best-property-tax-appeal-software',
    'https://www.watchdogindex.com/guides/nj-property-records-lookup-free-paid'
  ],
  'sitemap-calculators.xml': [
    'https://www.watchdogindex.com/property-tax-estimator',
    'https://www.watchdogindex.com/home-buying-cost-calculator',
    'https://www.watchdogindex.com/appeal-savings-estimator',
    'https://www.watchdogindex.com/rent-property-tax-calculator',
    'https://www.watchdogindex.com/senior-benefit-estimator',
    'https://www.watchdogindex.com/nj-property-tax-calendar'
  ],
  'sitemap-statistics.xml': [
    'https://www.watchdogindex.com/statistics/nj-property-tax-rates-by-town-2026',
    'https://www.watchdogindex.com/statistics/highest-property-tax-rates-new-jersey-2026',
    'https://www.watchdogindex.com/statistics/lowest-property-tax-rates-new-jersey-2026',
    'https://www.watchdogindex.com/statistics/nj-property-tax-appeal-win-rates-by-county-2026',
    'https://www.watchdogindex.com/statistics/least-uniform-property-assessments-new-jersey-2026',
    'https://www.watchdogindex.com/statistics/nj-school-tax-levy-share-by-town-2026',
    'https://www.watchdogindex.com/statistics/biggest-property-tax-rate-increases-new-jersey-2026',
    'https://www.watchdogindex.com/statistics/nj-revaluation-list-2026',
    'https://www.watchdogindex.com/statistics/average-residential-assessment-by-county-new-jersey-2026',
    'https://www.watchdogindex.com/statistics/average-property-tax-by-county-new-jersey-2026',
    'https://www.watchdogindex.com/statistics/general-vs-reported-tax-rate-by-town-new-jersey-2026'
  ]
};

for (const [sm, expected] of Object.entries(expectedClusters)) {
  const x = read(sm);
  const urls = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const actual = new Set(urls);
  const expectedSet = new Set(expected);
  for (const u of expected) {
    if (!actual.has(u)) errors.push(`${sm} missing expected URL ${u}`);
  }
  for (const u of urls) {
    if (!expectedSet.has(u)) errors.push(`${sm} contains unexpected URL ${u}`);
    if (!u.startsWith('https://www.watchdogindex.com/')) errors.push(`${sm} contains non-canonical host ${u}`);
    if (/\.html(?:$|[?#])|\/property\//i.test(u)) errors.push(`${sm} contains unclean canonical URL ${u}`);
  }
  const lastmods = [...x.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
  if (lastmods.length !== urls.length) errors.push(`${sm} requires one lastmod per URL`);
  for (const lastmod of lastmods) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) errors.push(`${sm} has invalid lastmod ${lastmod}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Static SEO/crawl guard passed for NJW-121, NJW-128 and NJW-135.');