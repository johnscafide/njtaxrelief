import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const growth = read('property/js/anchor-application-2025-growth.js');
const partial = read('property/partials/anchor-application-2025-growth.html');
const enhancements = read('property/js/anchor-application-2025-enhancements.js');
const library = read('property/js/anchor-applications.js');
const migration = read('supabase/migrations/20260910231000_anchor_completion_growth_loop_v1.sql');
const analytics = read('supabase/functions/product-analytics/index.ts');

assert.ok(growth.includes('/property/partials/anchor-application-2025-growth.html'), 'growth copy must come from the HTML partial');
assert.ok(partial.includes('id="wd-growth-source" required'), 'source attribution must be required in the post-completion panel');
assert.ok(partial.includes('id="wd-growth-optin" type="checkbox"'), 'marketing opt-in must be separate');
assert.ok(!partial.includes('checked'), 'marketing opt-in must not be pre-checked');
assert.ok(partial.includes('address you type here is not uploaded to Watchdog'), 'referral email privacy explanation must be visible');
assert.ok(enhancements.includes('/property/js/anchor-application-2025-growth.js'), 'application enhancements must load the growth behavior');
assert.ok(growth.includes("record('download_clicked')"), 'completion download clicks must be tracked');
assert.ok(growth.includes("record('print_clicked')"), 'completion print clicks must be tracked');
assert.ok(library.includes("event(id, 'download_clicked')"), 'saved-library downloads must be tracked');
assert.ok(library.includes("event(id,'application_reopened')"), 'saved applications must record reopen events');

assert.ok(migration.includes('watchdog_points_ledger'), 'server-authoritative points ledger must exist');
assert.ok(migration.includes("'verified_referral',5"), 'verified referrals must award five points');
assert.ok(migration.includes("action_key='property_search'"), 'property search awards must be capped in the database');
assert.ok(migration.includes('v_count >= 5'), 'property search awards must have a daily cap');
assert.ok(migration.includes("contact_permission='marketing_opt_in'"), 'explicit opt-in must promote contact permission');
assert.ok(migration.includes("contact_permission='transactional_only'"), 'marketing permission may only upgrade transactional-only users');
assert.ok(migration.includes('unsubscribed_at is null') && migration.includes('suppressed_at is null'), 'opt-in must not override unsubscribe/suppression');
assert.ok(!/form_type\s+text/i.test(migration), 'funnel analytics must not persist form route');
assert.ok(!/step_key\s+text/i.test(migration), 'funnel analytics must not persist route-revealing step names');

assert.ok(analytics.includes("audience==='external_account'&&b.event_name==='property_lookup_started'"), 'search points must only be awarded for authenticated external accounts');
assert.ok(analytics.includes("admin.rpc('award_watchdog_search_point'"), 'search awards must go through the controlled server RPC');

console.log('ANCHOR completion growth contract: PASS');
