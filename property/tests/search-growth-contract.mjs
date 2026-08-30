import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const generator = await read('scripts/generate_town_pages.py');
const cohort = await read('scripts/apply-search-growth-cohort.mjs');
const performance = await read('scripts/apply-public-performance.mjs');
const growthUi = await read('scripts/apply-web-signals-growth-ui.mjs');
const growthReport = await read('supabase/functions/seo-growth-report/index.ts');
const migration = await read('supabase/migrations/20260828203000_search_growth_measurement.sql');
const signals = await read('property/analytics/web-signals/index.html');
const publicNav = await read('property/js/public-nav.js');
const paidLaunch = await read('property/js/paid-launch-banner.js');
const paidLaunchPartial = await read('property/partials/paid-launch.html');
const paidLaunchCss = await read('property/css/paid-launch.css');
const countyIntel = await read('property/js/landing-county-intel.js');
const pkg = JSON.parse(await read('package.json'));
const vercelBuild = String(pkg.scripts?.['vercel-build'] || '');
const vercelBuildFull = String(pkg.scripts?.['vercel-build:full'] || '');

// Evidence-led opportunity queue stays transparent and advisory.
assert.match(signals, /Search opportunities/);
assert.match(signals, /position>=8&&position<=25/);
assert.match(signals, /CTR opportunity/);
assert.match(signals, /Build authority/);
assert.match(signals, /never publishes content automatically/i);
assert.match(signals, /Town\/county tax & records section/);

// Durable town generator keeps one canonical entity page and answers proven tax/record intent.
assert.match(generator, /Property Taxes, Assessments & Records \| Watchdog/);
assert.match(generator, /Property tax &amp; records/);
assert.match(generator, /property tax, assessment and record lookup/);
assert.match(generator, /Search .* property records →/);
assert.match(generator, /Watchdog is not the municipal tax collector/);
assert.match(generator, /county_href = f"\/towns\/\{slug\(county\)\}\/"/);
assert.match(generator, /Look up a property/);
assert.match(generator, /Property Tax Records & Assessments \| Watchdog/);
assert.match(generator, /official assessor, collector and county offices remain the source/);

// First production cohort is deliberately bounded to Search Console evidence.
for (const expected of [
  'allendale-borough.html', 'audubon-borough.html', 'barnegat-light-borough.html',
  'camden-city.html', 'chesterfield-township.html', 'cliffside-park-borough.html', 'clifton-city.html'
]) assert.match(cohort, new RegExp(expected.replace('.', '\\.')));
for (const county of ['bergen', 'burlington', 'camden', 'ocean', 'passaic']) {
  assert.match(cohort, new RegExp(`towns/${county}/index\\.html`));
}
assert.match(cohort, /data-organic-property-lookup/);
assert.match(cohort, /product-analytics\.js/);
assert.match(cohort, /official assessor, collector and county offices remain the source/);
assert.equal(pkg.scripts['search-growth:cohort'], 'node scripts/apply-search-growth-cohort.mjs');
assert.equal(vercelBuild, 'node scripts/vercel-build-once.mjs');
assert.match(vercelBuildFull, /search-growth:cohort/);

// Landing county discovery rotates through all 21 canonical county hubs, three at a time,
// and is continuously re-anchored immediately after Recent Properties.
assert.match(publicNav, /landing-county-intel\.js/);
const countySlugs = [
  'atlantic','bergen','burlington','camden','cape-may','cumberland','essex','gloucester','hudson','hunterdon',
  'mercer','middlesex','monmouth','morris','ocean','passaic','salem','somerset','sussex','union','warren'
];
for (const county of countySlugs) {
  assert.match(countyIntel, new RegExp(`slug:'${county}'`));
}
assert.equal((countyIntel.match(/slug:'/g) || []).length, 21);
const countyImages = [...countyIntel.matchAll(/\{county:'[^']+',slug:'[^']+',image:'([^']+)'\}/g)].map((match) => match[1]);
assert.equal(countyImages.length, 21);
assert.equal(new Set(countyImages).size, 21);
assert.match(countyIntel, /Special:FilePath/);
assert.match(countyIntel, /var ROTATE_MS=12000/);
assert.match(countyIntel, /deck\.slice\(cursor,cursor\+3\)/);
assert.match(countyIntel, /cursor\+=3/);
assert.match(countyIntel, /Math\.random/);
assert.match(countyIntel, /data-search-growth','landing-county-intel/);
assert.match(countyIntel, /placeImmediatelyAfterRecents/);
assert.match(countyIntel, /recents\.nextElementSibling!==section/);
assert.match(countyIntel, /observer\.observe\(document\.body,\{childList:true\}\)/);
assert.match(countyIntel, /Browse all NJ county reports/);
assert.doesNotMatch(countyIntel, /County Watchdog intel · rotating statewide/);
assert.doesNotMatch(countyIntel, /Explore New Jersey property-tax records by county/);
assert.doesNotMatch(countyIntel, /Three counties are featured at a time from all 21 New Jersey counties/);

// The landing-page launch message stays in normal hero flow after search so it never
// overlays the address field. Static markup/copy lives in HTML, presentation in CSS,
// and JavaScript owns only loading, placement, state, and analytics.
assert.match(paidLaunch, /PARTIAL_URL='\/property\/partials\/paid-launch\.html'/);
assert.match(paidLaunch, /CSS_URL='\/property\/css\/paid-launch\.css'/);
assert.match(paidLaunch, /cloneTemplate\('wd-paid-launch-hero-template'\)/);
assert.match(paidLaunch, /search\.insertAdjacentElement\('afterend',node\)/);
assert.match(paidLaunchPartial, /id="wd-paid-launch-hero"/);
assert.match(paidLaunchPartial, /wdpl-hero-chip/);
assert.match(paidLaunchPartial, /Professional plans · Sep 16/);
assert.match(paidLaunchPartial, /Less than \$2\/day annually/);
assert.match(paidLaunchPartial, /wdpl-get-started/);
assert.match(paidLaunchPartial, />Get started <i class="fas fa-arrow-right"><\/i><\/a>/);
assert.match(paidLaunchCss, /#wd-paid-launch-hero\{box-sizing:border-box;position:relative;z-index:4;width:min\(430px,100%\);margin:14px auto 0/);
assert.match(paidLaunchCss, /@media\(max-width:768px\)[\s\S]*#wd-paid-launch-hero\{width:min\(430px,100%\);margin:12px auto 0/);
assert.doesNotMatch(paidLaunchPartial, /wdpl-hero-grid/);
assert.doesNotMatch(paidLaunchPartial, /wdpl-hero-stat/);
assert.doesNotMatch(paidLaunchPartial, /wdpl-hero-link/);
assert.doesNotMatch(paidLaunchPartial, /wdpl-hero-overlay/);
assert.doesNotMatch(paidLaunchCss, /body\.wd-consumer-mode \.pl-search-card\{position:relative;z-index:12\}/);

// Mobile performance work targets the measured high-impression surfaces without removing functionality.
assert.equal(pkg.scripts['public-performance:prepare'], 'node scripts/apply-public-performance.mjs');
assert.match(vercelBuildFull, /public-performance:prepare/);
assert.match(performance, /property\/css\/lookup\/01-search-hero\.css/);
assert.match(performance, /rel="preload" as="image"/);
assert.match(performance, /fetchpriority="high"/);
assert.match(performance, /media="\(max-width: 760px\)"/);
assert.match(performance, /w=900&auto=format&fit=crop&q=72/);
assert.match(performance, /product-analytics\.js/);
assert.match(performance, /index\.html/);
assert.match(performance, /property\/index\.html/);

// Weekly movement and acquisition reporting are developer-only and aggregate/privacy scoped.
assert.equal(pkg.scripts['web-signals-growth:prepare'], 'node scripts/apply-web-signals-growth-ui.mjs');
assert.match(vercelBuildFull, /web-signals-growth:prepare/);
assert.match(growthUi, /seo-growth-report/);
assert.match(growthUi, /Weekly movement/);
assert.match(growthUi, /Organic acquisition/);
assert.match(growthUi, /renderWeekly/);
assert.match(growthUi, /renderOrganic/);
assert.match(growthReport, /is_watchdog_developer/);
assert.match(growthReport, /search_console_snapshots/);
assert.match(growthReport, /weekly_movement/);
assert.match(growthReport, /analytics_organic_search_conversion_daily/);
assert.match(growthReport, /no address, property search text, PAMS PIN, or identity/i);
assert.match(migration, /alter table public\.search_console_snapshots enable row level security/);
assert.match(migration, /revoke all on public\.search_console_snapshots from anon, authenticated/);
assert.match(migration, /analytics_organic_search_conversion_daily/);
assert.match(migration, /audience_class in \('external_visitor','external_account'\)/);
assert.doesNotMatch(migration, /PAMS_PIN|PROP_LOC|address_text/i);

// SEO rollout keeps existing canonical path construction instead of spawning intent duplicates.
assert.match(generator, /canonical = SITE \+ "\/" \+ path/);
assert.doesNotMatch(generator, /assessor-page|tax-collector-page|property-records-page/);
assert.doesNotMatch(cohort, /assessor-page|tax-collector-page|property-records-page/);

console.log('search growth contract: ok');
