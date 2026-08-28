import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const page = await read('property/analytics/web-signals/index.html');
const report = await read('supabase/functions/product-analytics-report/index.ts');
const oauthStart = await read('supabase/functions/google-ads-oauth-start/index.ts');
const oauthCallback = await read('supabase/functions/google-ads-oauth-callback/index.ts');
const weather = await read('api/watchdog-weather-context.js');

assert.match(page, /data-access-require="developer"/);
assert.match(page, /external_signals_only:true/);
assert.match(page, /provider:'search_console'/);
assert.match(page, /Weather context provider/);

assert.match(report, /pagespeedonline\/v5\/runPagespeed/);
assert.match(report, /\['performance','accessibility','best-practices','seo'\]/);
assert.match(report, /Lighthouse lab categories only/);
assert.doesNotMatch(report, /loadingExperience/);
assert.match(report, /webmasters\/v3\/sites/);
assert.match(report, /searchAnalytics\/query/);
assert.match(report, /dimensions:\['query'\]/);
assert.match(report, /dimensions:\['page'\]/);
assert.match(report, /external_signals_only/);

assert.match(oauthStart, /webmasters\.readonly/);
assert.match(oauthStart, /is_watchdog_developer/);
assert.match(oauthStart, /google_search_console/);
assert.match(oauthStart, /authorization, x-client-info, apikey, content-type/);
assert.match(oauthStart, /provider===SEARCH_CONSOLE\?200:409/);
assert.match(oauthStart, /WATCHDOG_SUPABASE_PUBLIC_URL/);
assert.match(oauthStart, /uvkvaxljhhngydvlrzom/);
assert.match(oauthStart, /https:\/\/login\.watchdogindex\.com/);
assert.match(oauthStart, /google-ads-oauth-callback/);
assert.match(oauthCallback, /google_search_console/);
assert.match(oauthCallback, /marketing_store_provider_secret/);
assert.match(oauthCallback, /accessible_sites/);
assert.match(oauthCallback, /WATCHDOG_SUPABASE_PUBLIC_URL/);
assert.match(oauthCallback, /uvkvaxljhhngydvlrzom/);
assert.match(oauthCallback, /https:\/\/login\.watchdogindex\.com/);
assert.match(oauthCallback, /redirect_uri:CALLBACK/);
assert.match(oauthCallback, /state_lookup/);
assert.match(oauthCallback, /state_consume/);
assert.match(oauthCallback, /token_network_failed/);
assert.match(oauthCallback, /callback_failed/);
assert.match(oauthCallback, /google-oauth-callback-failed/);
assert.match(oauthCallback, /safeRedirectPath/);

assert.match(weather, /api\.weather\.gov/);
assert.match(weather, /customer-api\.open-meteo\.com/);
assert.doesNotMatch(weather, /https:\/\/api\.open-meteo\.com/);
assert.match(weather, /OPEN_METEO_API_KEY/);
assert.match(weather, /score_impact:\s*false/);
assert.match(weather, /property_condition_evidence:\s*false/);
assert.match(weather, /insurance_risk_evidence:\s*false/);

console.log('external web signals contract: ok');
