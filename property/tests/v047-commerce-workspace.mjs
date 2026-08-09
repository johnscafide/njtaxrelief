import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

const migration = read('supabase/migrations/20260810031500_watchdog_v047_report_preset_compatibility.sql');
const checkout = read('supabase/functions/create-checkout-session/index.ts');
const webhook = read('supabase/functions/paddle-webhook/index.ts');
const billing = read('property/js/billing-client.js');
const account = read('property/js/account.js');
const dashboard = read('property/js/dashboard/index.js');
const dashboardCss = read('property/css/dashboard/06-responsive-additions.css');
const mobileCss = read('property/css/mobile-app.css');
const reportCss = read('property/css/report-builder-fixes.css');
const billingDocs = read('supabase/functions/BILLING-SETUP.md');
const versions = JSON.parse(read('property/data/versions.json'));

for (const preset of [
  'due_diligence', 'appeal', 'listing', 'lending', 'investment', 'title', 'construction',
  'attorney_title', 'lender_collateral', 'broker_listing', 'investor_diligence', 'appeal_case', 'custom'
]) {
  assert.match(migration, new RegExp(`'${preset}'`), `Report preset ${preset} is not migration-safe`);
}
assert.match(migration, /drop constraint if exists professional_reports_preset_check/i);

for (const name of [
  'PADDLE_PRICE_AGENT_MONTHLY', 'PADDLE_PRICE_AGENT_YEARLY',
  'PADDLE_PRICE_PROFESSIONAL_MONTHLY', 'PADDLE_PRICE_PROFESSIONAL_YEARLY'
]) {
  assert.match(checkout, new RegExp(name));
  assert.match(webhook, new RegExp(name));
  assert.match(billingDocs, new RegExp(name));
}
assert.match(checkout, /FIRM_GATED/);
assert.match(checkout, /cadence[^]*yearly/);
assert.match(webhook, /plan: 'pro'/);
assert.match(webhook, /plan: 'pro_plus'/);

for (const tier of ['agent', 'professional', 'firm']) assert.match(billing, new RegExp(`'${tier}'`));
assert.match(billing, /dataset\.billingCadence/);
assert.match(account, /data-billing-cadence/);
assert.match(account, /var billingCadence = 'yearly'/);
for (const amount of ['monthly: 29', 'yearly: 290', 'monthly: 349', 'yearly: 3490', '\\$1,000\+']) {
  assert.match(account, new RegExp(amount));
}
assert.match(account, /Team enrollment coming separately/);

assert.match(dashboard, /if \(view === 'pro'\)[^]*pfMap\.remove/);
assert.match(dashboardCss, /\.prolock-over\s*\{[^}]*position:\s*relative/);
assert.match(dashboardCss, /\.ai\.ai-mobile\s*\{[^}]*padding:\s*76px/);
assert.match(mobileCss, /\.ai\.ai-mobile/);
assert.match(reportCss, /max-height:\s*calc\(100dvh - 40px\)/);
assert.equal(versions.releases[0].version, '0.47.0');
assert.equal(versions.active_roadmap.length, 3);

new vm.Script(billing, { filename: 'billing-client.js' });
new vm.Script(account, { filename: 'account.js' });
new vm.Script(dashboard, { filename: 'dashboard/index.js' });

console.log('Watchdog v0.47 commerce and workspace contracts passed.');
