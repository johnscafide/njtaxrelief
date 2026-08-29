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
const countyIntel = await read('property/js/landing-county-intel.js');
const pkg = JSON.parse(await read('package.json'));

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
assert.match(pkg.scripts['vercel-build'], /search-growth:cohort/);

// Landing discovery uses the proven county cohort and keeps search interactions above the hero launch overlay.
assert.match(publicNav, /landing-county-intel\.js/);
for (const county of ['bergen', 'burlington', 'camden']) {
  assert.match(countyIntel, new RegExp(`href:'\\/towns\\/${county}\\/'`));
}
assert.match(countyIntel, /data-search-growth','landing-county-intel/);
assert.match(countyIntel, /placeAfterRecents/);
assert.match(countyIntel, /Explore New Jersey property-tax records by county/);
assert.match(paidLaunch, /wdpl-hero-overlay\{position:absolute;left:0;right:0;bottom:0;z-index:8/);
assert.match(paidLaunch, /body\.wd-consumer-mode \.pl-search-card\{position:relative;z-index:12\}/);

// Mobile performance work targets the measured high-impression surfaces without removing functionality.
assert.equal(pkg.scripts['public-performance:prepare'], 'node scripts/apply-public-performance.mjs');
assert.match(pkg.scripts['vercel-build'], /public-performance:prepare/);
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
assert.match(pkg.scripts['vercel-build'], /web-signals-growth:prepare/);
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