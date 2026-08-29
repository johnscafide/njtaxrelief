import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

const html = await read('property/data-center/index.html');
const runtime = await read('property/js/data-center-runtime-v2.js');
const publicRuntime = await read('property/js/data-center-public-v2.js');
const providerFilter = await read('property/js/data-center-provider-filter.js');
const publicCss = await read('property/css/data-center-public-v2.css');
const analyticsClient = await read('property/js/product-analytics.js');
const analyticsServer = await read('supabase/functions/product-analytics/index.ts');
const overviewMigration = await read('supabase/migrations/20260829152600_public_data_center_overview_v1.sql');

// The customer-facing route is public, indexable, and no longer framed around an internal catalog goal.
assert.match(html, /name="robots" content="index,follow,max-image-preview:large"/);
assert.match(html, /rel="canonical" href="https:\/\/www\.watchdogindex\.com\/property\/data-center"/);
assert.match(html, /Build, analyze and monitor governed property datasets/);
assert.match(html, /Overview/);
assert.match(html, /Build Dataset/);
assert.match(html, /Saved Views &amp; Monitoring/);
assert.match(html, /Live governed fields/);
assert.match(html, /Bulk-ready fields/);
assert.match(html, /Latest provider verification/);
assert.doesNotMatch(html, /data-access-require="pro_plus"/);
assert.doesNotMatch(html, /1,000-marker catalog goal/i);
assert.doesNotMatch(html, /Plan preview/i);
assert.doesNotMatch(html, /data-center-mobile-actions\.js/);

// Public browsing and trust visuals use a bounded public RPC; no account property data is requested there.
assert.match(publicRuntime, /get_public_data_center_overview_v1/);
assert.match(publicRuntime, /Coverage by intelligence family|renderCoverage/);
assert.match(publicRuntime, /Source freshness|renderFreshness/);
assert.match(publicRuntime, /data-marker-detail/);
assert.doesNotMatch(publicRuntime, /from\(['"]saved_properties['"]\)/);
assert.doesNotMatch(publicRuntime, /data_center_delivery_jobs/);

// Provider state no longer requires a public browser read of the protected provider-coverage table.
assert.match(providerFilter, /get_public_data_center_overview_v1/);
assert.doesNotMatch(providerFilter, /\.from\(['"]data_center_provider_coverage['"]\)/);

// Private workspace execution remains fail-closed behind a live Pro+ entitlement check and user-owned tables.
assert.match(runtime, /has_watchdog_plan/);
assert.match(runtime, /required_plan:\s*['"]pro_plus['"]/);
assert.match(runtime, /from\(['"]saved_properties['"]\)/);
assert.match(runtime, /from\(['"]saved_data_center_views['"]\)/);
assert.match(runtime, /from\(['"]data_center_delivery_jobs['"]\)/);
assert.match(runtime, /Town rollup — my saved properties/);
assert.match(runtime, /County rollup — my saved properties/);
assert.match(runtime, /Dataset value coverage/);
assert.match(runtime, /median/i);
assert.doesNotMatch(runtime, /window\.prompt|window\.alert/);

// Public-safe database contract exposes only bounded transparency metadata.
assert.match(overviewMigration, /security definer/i);
assert.match(overviewMigration, /grant execute on function public\.get_public_data_center_overview_v1\(\) to anon, authenticated/i);
assert.match(overviewMigration, /'marker_id', marker_id/);
assert.match(overviewMigration, /'value_status', value_status/);
assert.match(overviewMigration, /'bulk_capable', coalesce\(bulk_capable, false\)/);
assert.match(overviewMigration, /'last_verified_at', last_verified_at/);
assert.match(overviewMigration, /data_center_source_currency_metrics/);
assert.doesNotMatch(overviewMigration, /jsonb_build_object\([^)]*provider_key/s);
assert.doesNotMatch(overviewMigration, /jsonb_build_object\([^)]*source_fields/s);
assert.doesNotMatch(overviewMigration, /jsonb_build_object\([^)]*calculation_key/s);

// Data Center typography additions respect the NJW-73 readable-type floor.
const rawPixelFontSizes = [...publicCss.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gi)].map((match) => Number(match[1]));
assert.ok(rawPixelFontSizes.every((size) => size >= 12), `Data Center public CSS introduced sub-12px type: ${rawPixelFontSizes.filter((size) => size < 12).join(', ')}`);
assert.match(publicCss, /\.75rem/);
assert.match(publicCss, /\.8125rem/);

// Product analytics measure the Data Center funnel without accepting property values or addresses as event properties.
for (const event of [
  'data_center_tab_viewed', 'data_center_searched', 'data_center_filtered', 'data_center_field_selected',
  'data_center_build_started', 'data_center_dataset_built', 'data_center_view_saved',
  'data_center_export_completed', 'data_center_delivery_scheduled'
]) {
  assert.match(analyticsClient, new RegExp(event));
  assert.match(analyticsServer, new RegExp(event));
}
for (const safeKey of ['scope', 'selected_count_bucket', 'row_count_bucket', 'filter']) {
  assert.match(analyticsClient, new RegExp(`['"]${safeKey}['"]`));
  assert.match(analyticsServer, new RegExp(`['"]${safeKey}['"]`));
}
assert.doesNotMatch(analyticsServer, /PROPERTY_KEYS[^;]*(address|pams_pin|property_value|owner)/si);

console.log('public Data Center contract: ok');
