import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const home = read('property/js/anchor-home-funnel.js');
const partial = read('property/partials/anchor-home-funnel.html');
const publicNav = read('property/js/public-nav.js');
const handoff = read('anchor-watchdog-handoff.js');
const edgeHandoff = read('supabase/functions/anchor-result-handoff/index.ts');
const promo = read('watchdog-promo.js');
const acquisition = read('api/njptr-watchdog-acquisition-page.js');
const estimateLibrary = read('property/js/anchor-estimate-library.js');
const appBridge = read('property/js/anchor-application-estimate-bridge.js');
const appEnhancements = read('property/js/anchor-application-2025-enhancements.js');
const applicationLibrary = read('property/anchor/applications/index.html');
const estimateMigration = read('supabase/migrations/20260903143812_anchor_account_estimates_v1.sql');
const fkFixMigration = read('supabase/migrations/20260903145239_anchor_account_estimates_application_fk_fix.sql');

// Watchdog home owns both the secure NJPTR continuation and the native estimator.
assert.match(publicNav, /anchor-home-funnel\.css/);
assert.match(publicNav, /anchor-home-funnel\.js/);
assert.match(home, /host==='watchdogindex\.com'\|\|host==='www\.watchdogindex\.com'/);
assert.match(home, /tokenFromHash/);
assert.match(home, /\^\[a-f0-9\]\{64\}\$/i);
assert.match(home, /history\.replaceState/);
assert.match(home, /action:'consume'/);
assert.match(home, /wd_anchor_home_result_v1/);
assert.match(home, /6\*60\*60\*1000/);
assert.doesNotMatch(home, /localStorage/);
assert.doesNotMatch(home, /console\.(?:log|info|debug)\s*\(/);

// The estimate is shown before account creation; the quick estimator stays open until a result replaces it.
assert.match(partial, /No account needed to see your number/i);
assert.match(partial, /data-anchor-quick-edit/);
assert.doesNotMatch(partial, /data-anchor-quick-toggle/);
assert.match(home, /presentation:'always_open'/);
assert.match(partial, /Save &amp; start my 2025 application/);
assert.match(partial, /Start my 2025 application/);
assert.match(partial, /Save estimate/);
assert.match(partial, /View full property record/);
assert.match(partial, /not the State of New Jersey/i);
assert.match(home, /signInWithOtp/);
assert.match(home, /verifyOtp/);
assert.match(home, /from\('anchor_estimates'\)\.upsert/);
assert.match(home, /location\.href='\/anchor\/application\/2025\/'/);

// Cross-domain handoff uses only an opaque fragment token, never result PII in the URL.
assert.match(handoff, /result_token/);
assert.match(handoff, /location\.replace\('https:\/\/www\.watchdogindex\.com\/#anchor-result='\+token\)/);
assert.doesNotMatch(handoff, /watchdogindex\.com\/anchor\/results/);
assert.doesNotMatch(handoff, /[?&](?:email|phone|address|benefit)=/i);

// Server-side handoff recomputes the estimate and fails closed on missing required answers.
assert.match(edgeHandoff, /const complete = Boolean/);
assert.match(edgeHandoff, /primary === "yes"/);
assert.match(edgeHandoff, /tenure !== "own" \|\| taxes === "yes"/);
assert.match(edgeHandoff, /if \(!computed\.complete\)/);
assert.match(edgeHandoff, /verified estimator answers are incomplete/i);
assert.match(edgeHandoff, /return json\(req, \{ error: .* \}, 422\)/s);
assert.match(edgeHandoff, /result_token_hash: await sha256\(token\)/);
assert.match(edgeHandoff, /Cache-Control": "no-store"/);

// NJPTR acquisition surfaces are prominent but frequency-capped and estimator-safe.
assert.match(promo, /FIVE_DAYS=5\*24\*60\*60\*1000/);
assert.match(promo, /addBand\(\)/);
assert.match(promo, /addEstimatorBrand\(\)/);
assert.match(promo, /aria-modal/);
assert.match(acquisition, /watchdog-promo\.js/);
assert.match(acquisition, /anchor-watchdog-handoff\.js/);
assert.match(acquisition, /private, no-store, max-age=0/);

// Saving is owner-only and the database—not browser JavaScript—owns the saved benefit calculation.
assert.match(estimateMigration, /estimated_amount integer generated always as/i);
assert.match(estimateMigration, /qualifies boolean generated always as/i);
assert.match(estimateMigration, /enable row level security/i);
assert.match(estimateMigration, /revoke all on table public\.anchor_estimates from anon, authenticated/i);
assert.match(estimateMigration, /grant select, insert, update, delete on table public\.anchor_estimates to authenticated/i);
assert.match(estimateMigration, /auth\.uid\(\)\) = user_id/);
assert.match(fkFixMigration, /on delete set null \(application_id\)/i);

// Application prefill is deliberately bounded to non-sensitive property/context fields.
assert.match(appEnhancements, /anchor-application-estimate-bridge\.js/);
assert.match(appBridge, /applicant\.first/);
assert.match(appBridge, /mailing\.address/);
assert.match(appBridge, /residency_status/);
assert.match(appBridge, /property\.block/);
assert.match(appBridge, /property\.lot/);
assert.match(appBridge, /application_id:application/);
assert.doesNotMatch(appBridge, /ssn|social.security|gross_income|disability|birth_year/i);
assert.doesNotMatch(appBridge, /localStorage/);

// Account library keeps saved estimates visible alongside, but separate from, the encrypted application vault.
assert.match(applicationLibrary, /anchor-estimate-library\.js/);
assert.match(estimateLibrary, /from\('anchor_estimates'\)/);
assert.match(estimateLibrary, /application_id/);
assert.match(estimateLibrary, /Delete this saved ANCHOR estimate/);
assert.doesNotMatch(estimateLibrary, /service_role|serviceRole/);

console.log('NJW-302 ANCHOR homeowner funnel contract passed');
