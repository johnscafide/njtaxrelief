import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANALYTICS = '<script src="/property/js/product-analytics.js" defer></script>';
const TOWN_MARKER = 'data-search-growth="town-tax-records"';
const COUNTY_MARKER = 'data-search-growth="county-tax-records"';
const TOWN_INSIGHT_MARKER = 'data-search-growth="town-insight-link"';
const TOWN_INSIGHT_HREF = '/insights/nj-2026-modiv-property-assessment-files';

const towns = [
  ['towns/bergen/allendale-borough.html', 'Allendale Borough', 'Bergen'],
  ['towns/camden/audubon-borough.html', 'Audubon Borough', 'Camden'],
  ['towns/ocean/barnegat-light-borough.html', 'Barnegat Light Borough', 'Ocean'],
  ['towns/camden/camden-city.html', 'Camden City', 'Camden'],
  ['towns/burlington/chesterfield-township.html', 'Chesterfield Township', 'Burlington'],
  ['towns/bergen/cliffside-park-borough.html', 'Cliffside Park Borough', 'Bergen'],
  ['towns/passaic/clifton-city.html', 'Clifton City', 'Passaic']
];

const counties = [
  ['towns/bergen/index.html', 'Bergen'],
  ['towns/burlington/index.html', 'Burlington'],
  ['towns/camden/index.html', 'Camden'],
  ['towns/ocean/index.html', 'Ocean'],
  ['towns/passaic/index.html', 'Passaic']
];

function ensureAnalytics(html) {
  if (html.includes('/property/js/product-analytics.js')) return html;
  if (!html.includes('</body>')) throw new Error('Missing </body> while attaching product analytics');
  return html.replace('</body>', `${ANALYTICS}</body>`);
}

function ensureTownInsightLink(html) {
  if (html.includes(TOWN_INSIGHT_MARKER)) return html;
  const watchdogMarker = '<section class="tp-watchdog">';
  if (!html.includes(watchdogMarker)) throw new Error('Could not find Watchdog section while attaching town insight link');
  const related = `<p class="tp-source" ${TOWN_INSIGHT_MARKER}>Related: <a href="${TOWN_INSIGHT_HREF}">what New Jersey’s 2026 property assessment record actually tells you →</a></p>`;
  return html.replace(watchdogMarker, related + watchdogMarker);
}

function setMeta(html, selector, value) {
  const attr = selector.startsWith('property:') ? 'property' : 'name';
  const key = selector.replace(/^(?:property:|name:)/, '');
  const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"\\s+content="[^"]*"\\s*\\/?>(?:</meta>)?`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, `<meta ${attr}="${key}" content="${value}">`);
}

function setTitle(html, value) {
  if (!/<title>[^<]*<\/title>/i.test(html)) throw new Error('Missing title');
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${value}</title>`);
}

function patchTown(html, name, county) {
  html = ensureAnalytics(html);
  html = ensureTownInsightLink(html);
  if (html.includes(TOWN_MARKER)) return html;

  const countyHref = `/towns/${county.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
  const title = `${name} NJ Property Taxes, Assessments & Records | Watchdog`;
  const description = `${name}, ${county} County NJ property taxes, assessments and property records with municipal rate data, assessment red flags and Watchdog parcel lookup.`;
  html = setTitle(html, title);
  html = setMeta(html, 'name:description', description);
  html = setMeta(html, 'property:og:title', title);
  html = setMeta(html, 'property:og:description', description);

  html = html.replace(
    new RegExp(`<h1>${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')} property tax (?:intelligence|facts)<\\/h1>`, 'i'),
    `<h1>${name} property taxes, assessments &amp; records</h1>`
  );

  const rateMarker = '<section class="tp-section"><h2>Property-tax rate history</h2>';
  if (!html.includes(rateMarker)) throw new Error(`Could not find rate section for ${name}`);
  const section = `<section class="tp-section" ${TOWN_MARKER}><h2>${name} property tax, assessment and record lookup</h2><p>Use this page for ${name}-wide info, then use Watchdog for a specific New Jersey address. Parcel lookup can return assessed value, prior published tax-bill info, block and lot, tax history and other checked public-record fields when available.</p><div class="tp-signal-grid"><article><h3>Look up a property</h3><p>Search by address to go from town-level info to the parcel record. Watchdog is not the municipal assessor or tax collector and does not represent a current balance due.</p><a href="/property/" data-organic-property-lookup="town_report">Search ${name} property records →</a></article><article><h3>County info</h3><p>Compare ${name} with other municipalities in ${county} County without creating duplicate assessor or tax-record pages for the same place.</p><a href="${countyHref}">Open ${county} County property-tax reports →</a></article></div></section>`;
  html = html.replace(rateMarker, section + rateMarker);
  return html;
}

function patchCounty(html, county) {
  html = ensureAnalytics(html);
  if (html.includes(COUNTY_MARKER)) return html;

  const title = `${county} County NJ Property Tax Records & Assessments | Watchdog`;
  const description = `${county} County NJ property-tax records and assessments by municipality, with tax-rate red flags and direct Watchdog property lookup.`;
  html = setTitle(html, title);
  html = setMeta(html, 'name:description', description);
  html = setMeta(html, 'property:og:title', title);
  html = setMeta(html, 'property:og:description', description);
  html = html.replace(
    new RegExp(`<h1>${county.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')} County property-tax reports<\\/h1>`, 'i'),
    `<h1>${county} County property taxes, assessments &amp; records</h1>`
  );

  const directoryMarker = '<section class="tp-wrap tp-directory">';
  if (!html.includes(directoryMarker)) throw new Error(`Could not find county directory for ${county}`);
  const intro = `<section class="tp-wrap tp-section" ${COUNTY_MARKER}><h2>Find ${county} County property taxes and assessments</h2><p>Choose the municipality that owns the assessment record, or open Watchdog to search a specific address. These pages sum up checked public records; official assessor, collector and county offices remain the source for filings and current balances.</p><div class="tp-actions"><a class="tp-button" href="/property/" data-organic-property-lookup="county_hub">Look up a property</a><a class="tp-text-link" href="/insights/">Read Watchdog insights</a></div></section>`;
  html = html.replace(directoryMarker, intro + directoryMarker);
  return html;
}

async function applyOne(relative, transform) {
  const target = path.join(ROOT, relative);
  const before = await readFile(target, 'utf8');
  const after = transform(before);
  if (after !== before) await writeFile(target, after, 'utf8');
  return after !== before;
}

let changed = 0;
for (const [relative, name, county] of towns) {
  if (await applyOne(relative, html => patchTown(html, name, county))) changed += 1;
}
for (const [relative, county] of counties) {
  if (await applyOne(relative, html => patchCounty(html, county))) changed += 1;
}

const manifest = JSON.parse(await readFile(path.join(ROOT, 'towns/town-manifest.json'), 'utf8'));
if (!Array.isArray(manifest.pages) || manifest.pages.length !== 564) {
  throw new Error(`Expected 564 municipality pages in town manifest; got ${manifest.pages?.length ?? 'invalid'}`);
}
let townInsightLinksChanged = 0;
for (const page of manifest.pages) {
  if (!page?.path || !String(page.path).startsWith('towns/') || !String(page.path).endsWith('.html')) {
    throw new Error('Invalid municipality path in town manifest');
  }
  if (await applyOne(page.path, ensureTownInsightLink)) townInsightLinksChanged += 1;
}

console.log(`Search-growth cohort prepared: ${towns.length} towns, ${counties.length} county hubs, ${changed} cohort files changed; town insight links added to ${townInsightLinksChanged} build-workspace pages.`);
