// Town property tax pages: /property-tax, /property-tax/<county> and /property-tax/<county>/<town>.
// Data for the pages (api/tax-town-page.js) and the Watchdog sitemap.
//
// Everything comes from files already in the repo:
//   property/data/town-tax/bills.json   typical home bill and assessment (scripts/build-town-tax-bills.mjs)
//   tax-rates.json                      general tax rates by year
//   chapter123-ratios-2026.json         2026 average ratio and common level range
//   property/revaluation-reassessment-2026.json  towns with a 2026 revaluation or reassessment
//   property/data/home-feed-towns.json  rate-file key, population and map point per town
// Town names and slugs are the /co ones (api/_co-town.js), so /property-tax/essex/montclair-township
// and /co/essex/montclair-township are the same town.
//
// Only counties in PUBLISHED get pages and sitemap rows. Add a county once its rows are in bills.json.
const fs = require('fs');
const path = require('path');
const CO = require('./_co-town');

const ROOT = process.cwd();
const PUBLISHED = new Set([
  'atlantic', 'bergen', 'burlington', 'camden', 'cape-may', 'cumberland', 'essex', 'gloucester', 'hudson', 'hunterdon', 'mercer',
  'middlesex', 'monmouth', 'morris', 'ocean', 'passaic', 'salem', 'somerset', 'sussex', 'union', 'warren'
]);
const ALTERNATE_CALENDAR = new Set(['burlington', 'gloucester', 'monmouth']);

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (_) { return null; }
}

let data = null;
function load() {
  if (data) return data;
  const bills = readJson('property/data/town-tax/bills.json') || {};
  data = {
    bills: bills.towns || {},
    billYear: bills.bill_year || null,
    rates: (readJson('tax-rates.json') || {}).rates || {},
    ratios: (readJson('chapter123-ratios-2026.json') || {}).districts || {},
    reval: (readJson('property/revaluation-reassessment-2026.json') || {}).districts || {},
    feed: (readJson('property/data/home-feed-towns.json') || {}).towns || {}
  };
  return data;
}

function rateSeries(code) {
  const d = load();
  const f = d.feed[code];
  const s = f && d.rates[f.tk];
  if (!s) return [];
  return Object.keys(s).map(Number).filter((y) => Number(s[y]) > 0).sort((a, b) => a - b).map((y) => ({ year: y, rate: Number(s[y]) }));
}

// Everything a town page shows, or null when the town has no bill data.
function facts(code) {
  const d = load();
  const bill = d.bills[code];
  if (!bill) return null;
  const f = d.feed[code] || {};
  const series = rateSeries(code);
  const latest = series[series.length - 1] || null;
  const prior = series.length > 1 ? series[series.length - 2] : null;
  const fiveBack = latest ? series.find((x) => x.year === latest.year - 5) : null;
  const r = d.ratios[code];
  return {
    bill: { year: d.billYear, median: bill.tax, assessed: bill.assessed, homes: bill.homes },
    rate: latest ? {
      year: latest.year,
      value: latest.rate,
      prior: prior && prior.year === latest.year - 1 ? prior.rate : null,
      fiveBack: fiveBack ? fiveBack.rate : null,
      series: series.slice(-6)
    } : null,
    ratio: Array.isArray(r) ? { year: 2026, average: r[0], lower: r[1], upper: Math.min(r[2], 100) } : null,
    reval2026: !!d.reval[code],
    pop: f.pop || null,
    lat: f.lat, lon: f.lon
  };
}

function townPath(t) { return `/property-tax/${t.countySlug}/${t.slug}`; }

let cached = null;
function towns() {
  if (cached) return cached;
  const base = CO.towns();
  const all = base.all.map((t) => {
    const o = { code: t.code, name: t.name, county: t.county, countySlug: t.countySlug, slug: t.slug, coPath: t.published ? t.path : null };
    o.path = townPath(o);
    o.published = PUBLISHED.has(o.countySlug) && !!facts(o.code);
    return o;
  });
  const byPath = new Map(all.map((t) => [t.path, t]));
  const counties = new Map();
  all.forEach((t) => {
    if (!counties.has(t.countySlug)) counties.set(t.countySlug, { slug: t.countySlug, name: t.county, towns: [], alternateCalendar: ALTERNATE_CALENDAR.has(t.countySlug) });
    counties.get(t.countySlug).towns.push(t);
  });
  counties.forEach((c) => {
    c.towns.sort((x, y) => x.name.localeCompare(y.name));
    c.published = c.towns.some((t) => t.published);
  });
  cached = { all, byPath, counties: new Map([...counties.entries()].sort((x, y) => x[0].localeCompare(y[0]))) };
  return cached;
}
function findTown(countySlug, townSlug) {
  const t = towns().byPath.get(`/property-tax/${countySlug}/${townSlug}`);
  return t && t.published ? t : null;
}
function findCounty(countySlug) {
  const c = towns().counties.get(countySlug);
  return c && c.published ? c : null;
}
function publishedCounties() { return [...towns().counties.values()].filter((c) => c.published); }

// Closest published towns by map distance, for the "nearby" list.
function nearby(t, n) {
  const here = facts(t.code);
  if (!here || here.lat == null) return [];
  return towns().all
    .filter((x) => x.published && x.code !== t.code)
    .map((x) => { const f = facts(x.code); return { t: x, f, d: f && f.lat != null ? Math.hypot(f.lat - here.lat, (f.lon - here.lon) * Math.cos(here.lat * Math.PI / 180)) : Infinity }; })
    .filter((x) => Number.isFinite(x.d))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

function sitemapRows() {
  const counties = publishedCounties();
  if (!counties.length) return [];
  const rows = [{ path: '/property-tax', changefreq: 'monthly', priority: '0.8' }];
  counties.forEach((c) => {
    rows.push({ path: `/property-tax/${c.slug}`, changefreq: 'monthly', priority: '0.75' });
    c.towns.filter((t) => t.published).forEach((t) => rows.push({ path: t.path, changefreq: 'monthly', priority: '0.78' }));
  });
  return rows;
}

// CO and tax page links for one town by Treasury code, for the property and True Cost pages.
function townLinks(code) {
  const co = CO.towns().byCode.get(String(code || '').slice(0, 4));
  if (!co) return { name: '', co: '/co', tax: '' };
  const tax = towns().byPath.get(townPath(co));
  return { name: co.name, co: co.published ? co.path : '/co', tax: tax && tax.published ? tax.path : '' };
}

module.exports = { townLinks, facts, towns, findTown, findCounty, publishedCounties, nearby, sitemapRows, townPath, PUBLISHED };
