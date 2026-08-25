import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const middleware = readFileSync(new URL('../../middleware.js', import.meta.url), 'utf8');
const salesApi = readFileSync(new URL('../../api/sales-by-district.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260825230500_njw_37_public_request_rate_limit.sql', import.meta.url), 'utf8');
const terms = readFileSync(new URL('../terms/index.html', import.meta.url), 'utf8');

assert.match(middleware, /BULK_SALES_FILE\s*=\s*\/\^\\\/property\\\/sales-\[a-z-\]\+\\\.json\$\/i/, 'bulk county sales files must be recognized at middleware');
assert.match(middleware, /BULK_SALES_FILE\.test\(url\.pathname\)[\s\S]{0,500}blockedDataResponse\(404/, 'bulk county sales files must be blocked before static delivery');
assert.match(middleware, /SALES_API_PATH[\s\S]{0,500}AUTOMATION_UA\.test\(userAgent\)[\s\S]{0,500}blockedDataResponse\(403/, 'obvious extraction clients must be blocked before function compute');
assert.match(middleware, /X-Watchdog-Data-Access['"]:\s*['"]scoped-only/, 'blocked bulk paths must declare scoped-only delivery');

assert.match(salesApi, /createHmac\(['"]sha256['"],key\)/, 'rate limiter must pseudonymize client IP with HMAC before persistence');
assert.match(salesApi, /sales_by_district_minute['"],seconds:60,limit:20/, 'minute request budget must stay bounded');
assert.match(salesApi, /sales_by_district_hour['"],seconds:3600,limit:80/, 'hour request budget must stay bounded');
assert.match(salesApi, /consume_public_request_budget/, 'scoped-sales API must consume the durable request budget');
assert.match(salesApi, /status\(429\)/, 'budget exhaustion must return HTTP 429');
assert.match(salesApi, /Cache-Control['"],['"]private, max-age=300/, 'scoped responses must not use a shared public cache that bypasses per-client budgets');
assert.doesNotMatch(salesApi, /console\.(?:log|info|warn|error)\([^\n]*forwarded/, 'raw forwarded client IP must not be logged');

assert.match(migration, /create schema if not exists watchdog_security/i, 'security telemetry must live in a private schema');
assert.match(migration, /revoke all on function public\.consume_public_request_budget[\s\S]*from anon/i, 'anonymous callers must not execute the budget RPC');
assert.match(migration, /grant execute on function public\.consume_public_request_budget[\s\S]*to service_role/i, 'only server-side service role should consume budgets');
assert.match(migration, /public_request_security_events[\s\S]*created_at < now\(\) - interval '7 days'/i, 'pseudonymous security events must have bounded retention');
assert.match(migration, /public_request_rate_limits[\s\S]*updated_at < now\(\) - interval '2 hours'/i, 'rate-limit counters must have bounded retention');

assert.match(terms, /Automated crawling, scraping, harvesting, bulk copying or systematic extraction/i, 'Terms must prohibit unauthorized bulk extraction');
assert.match(terms, /does not claim ownership of underlying public government records/i, 'Terms must preserve the public-record distinction');

console.log('NJW-37 anti-scrape contract PASS');
