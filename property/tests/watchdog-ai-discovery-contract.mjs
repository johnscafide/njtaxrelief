import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [collector, routeGuard, insightApi, insightsIndex, reportFn, benchmark, commandCenter] = await Promise.all([
  readFile(new URL('../js/ai-referral-analytics.js', import.meta.url), 'utf8'),
  readFile(new URL('../../api/watchdog-index-page-contact-safe.js', import.meta.url), 'utf8'),
  readFile(new URL('../../api/insight.js', import.meta.url), 'utf8'),
  readFile(new URL('../insights/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/product-analytics-report/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../data/ai-discovery-benchmark.json', import.meta.url), 'utf8'),
  readFile(new URL('../analytics/ai-discovery/index.html', import.meta.url), 'utf8')
]);

assert.match(collector, /navigator\.globalPrivacyControl === true/);
assert.match(collector, /navigator\.doNotTrack/);
assert.match(collector, /chatgpt\.com/);
assert.match(collector, /perplexity\.ai/);
assert.match(collector, /copilot\.microsoft\.com/);
assert.match(collector, /gemini\.google\.com/);
assert.doesNotMatch(collector, /localStorage|sessionStorage|document\.cookie/);
assert.match(collector, /interaction: 'ai_referral'/);
assert.match(collector, /if \(!aiSource\) return;/);

assert.match(routeGuard, /ai-referral-analytics\.js/);
assert.match(routeGuard, /data-watchdog-ai-referral-runtime/);
assert.match(routeGuard, /AI_REFERRAL_PRIVATE_PREFIXES/);
assert.match(routeGuard, /'\/analytics'/);
assert.match(routeGuard, /isAiReferralPublicPath\(publicPath\)/);
assert.match(routeGuard, /https:\/\/www\.watchdogindex\.com\/#organization/);
assert.match(routeGuard, /https:\/\/www\.watchdogindex\.com\/#website/);

assert.match(insightApi, /canonical=WATCHDOG_ORIGIN\+'\/insights\/'\+slug/);
assert.match(insightApi, /const author=\{'@type':'Organization','@id':WATCHDOG_ORG/);
assert.match(insightApi, /publisher:author/);
assert.match(insightApi, /'@id':WATCHDOG_SITE/);
assert.match(insightApi, /isAccessibleForFree:true/);

assert.match(insightsIndex, /rel="canonical" href="https:\/\/www\.watchdogindex\.com\/insights"/);
assert.match(insightsIndex, /https:\/\/www\.google\.com\/preferences\/source\?q=watchdogindex\.com/);
assert.match(insightsIndex, /https:\/\/www\.watchdogindex\.com\/#organization/);
assert.match(insightsIndex, /href="\/insights\/'\+encodeURIComponent\(a\.slug\)\+'"/);

assert.match(reportFn, /host==="watchdogindex\.com"/);
assert.match(reportFn, /host==="www\.watchdogindex\.com"/);
assert.match(reportFn, /ai_referrals:aiReferrals/);
assert.match(reportFn, /microsoft_copilot/);
assert.match(reportFn, /google_gemini/);

const registry = JSON.parse(benchmark);
assert.equal(registry.canonical_brand, 'Watchdog');
assert.equal(registry.canonical_origin, 'https://www.watchdogindex.com');
assert.ok(Array.isArray(registry.platforms) && registry.platforms.length >= 8);
assert.ok(Array.isArray(registry.prompts) && registry.prompts.length >= 10);
assert.ok(registry.rules.some(rule => /Do not claim a platform cited Watchdog/i.test(rule)));
for (const prompt of registry.prompts) {
  assert.ok(prompt.id && prompt.prompt && Array.isArray(prompt.target_urls));
  for (const url of prompt.target_urls) assert.match(url, /^https:\/\/www\.watchdogindex\.com\//);
}

assert.match(commandCenter, /data-developer-only="true"/);
assert.match(commandCenter, /product-analytics-report/);
assert.match(commandCenter, /ai-discovery-benchmark\.json/);
assert.match(commandCenter, /Ordinary Google and Bing search traffic is deliberately not relabeled as AI/);

console.log(`Watchdog AI discovery contract PASS (${registry.platforms.length} platforms, ${registry.prompts.length} benchmark prompts)`);
