#!/usr/bin/env node
/*
 * Static guardrail for the files that define Watchdog's access boundary.
 * It deliberately does not claim to test RLS at runtime; that requires a
 * staged Supabase project and named test accounts.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
function check(name, ok, note) { checks.push({ name, ok: !!ok, note }); }

const protectedPages = [
  ['property/developer-data/index.html', 'developer'],
  ['property/updates/index.html', 'developer'],
  ['property/verification-diagnostics/index.html', 'developer'],
  ['property/scan/index.html', 'developer'],
  ['property/data-center/index.html', 'pro_plus'],
  ['property/data-workbench/index.html', 'agent'],
  ['property/marketing-studio/index.html', 'agent'],
  ['property/marketing-studio/admin/index.html', 'agent'],
  ['property/marketing-studio/audience/index.html', 'agent'],
  ['property/marketing-studio/audience-review/index.html', 'agent'],
  ['property/marketing-studio/design/index.html', 'agent'],
  ['property/marketing-studio/customize/index.html', 'agent'],
  ['property/marketing-studio/recipients/index.html', 'agent'],
  ['property/marketing-studio/review/index.html', 'agent'],
  ['property/property-analysis/index.html', 'developer'],
  ['property/dashboards/index.html', 'developer'],
  ['property/diagnostics/index.html', 'developer'],
  ['property/tools/assessment-fairness/index.html', 'developer'],
  ['property/tools/appeal-potential/index.html', 'developer'],
  ['property/tools/comparable-properties/index.html', 'developer'],
  ['property/tools/market-value/index.html', 'developer'],
  ['property/tools/neighborhood-comparison/index.html', 'developer'],
  ['property/pulse/index.html', 'standard'],
  ['property/marker/index.html', 'standard'],
  ['property/workbench/index.html', 'pro']
];

for (const [file, level] of protectedPages) {
  const body = read(file);
  check(`${file} declares ${level}`, new RegExp(`data-access-require=["']${level}["']`).test(body), 'HTML route contract');
  check(`${file} loads server access guard`, body.includes('/property/js/access-guard.js'), 'Browser gate redirects before page reveal');
}

const guard = read('property/js/access-guard.js');
check('developer guard uses server RPC', guard.includes("rpc('is_watchdog_developer')"), 'No email or browser role heuristic');
check('paid route guard uses server entitlement RPC', guard.includes("rpc('get_my_entitlement')"), 'Paid URL access is based on server subscription state');
check('developer guard redirects unauthenticated users', guard.includes("destination('signin')"), 'Unauthenticated route behavior');
check('developer guard redirects unauthorized users', guard.includes("destination('restricted')"), 'Unauthorized route behavior');

const entitlement = read('supabase/migrations/20260805235900_billing_saved_views_rls.sql');
const v040 = read('supabase/migrations/20260808143000_watchdog_v040_commerce_change_workbench.sql');
const revokeAnon = read('supabase/migrations/20260807151500_revoke_anon_internal_entitlement_rpcs.sql');
check('profiles have RLS', entitlement.includes('alter table public.profiles enable row level security'), 'Customer profile boundary');
check('plan checks are server-owned', entitlement.includes('create or replace function public.has_watchdog_plan') && entitlement.includes('security definer'), 'Plan authority resides in database');
check('Workbench RLS requires Pro', v040.includes('professional cases select own pro') && v040.includes("public.has_watchdog_plan('pro')"), 'Professional case rows are server plan-gated');
check('score history is browser read-only', v040.includes('revoke insert, update, delete on table public.score_observations from authenticated'), 'Historical evidence is server-created');
check('Paddle webhook ledger is service-only', v040.includes('billing_provider_events') && v040.includes('revoke all on table public.billing_provider_events from anon, authenticated'), 'Billing events cannot be forged by browser clients');
check('entitlement RPC is not anon-callable', revokeAnon.includes('revoke execute on function public.get_my_entitlement() from anon'), 'No anonymous entitlement lookup');
check('developer RPC is not anon-callable', revokeAnon.includes('revoke execute on function public.is_watchdog_developer() from anon'), 'No anonymous developer check');

const browserFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:js|html)$/i.test(entry.name)) browserFiles.push(file);
  }
}
walk('property');
const clientSecrets = browserFiles.filter((file) => /service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(fs.readFileSync(file, 'utf8')));
check('no service credentials in browser property files', clientSecrets.length === 0, clientSecrets.length ? clientSecrets.map((f) => path.relative(root, f)).join(', ') : 'Publishable client key only');

const mobileCss = read('property/css/mobile-app.css');
const mobileMenuCss = read('property/css/mobile-menu.css');
for (const file of ['property/dashboard/index.html', 'property/home/index.html']) {
  const page = read(file);
  check(`${file} uses responsive viewport`, /name=["']viewport["']/.test(page), 'Mobile reflow contract');
  check(`${file} loads mobile menu styling`, page.includes('/property/css/mobile-menu.css'), 'Mobile menu remains styled on customer pages');
}
check('primary mobile controls meet generous target sizing', mobileCss.includes('min-height:52px') && mobileMenuCss.includes('min-height:52px'), 'Exceeds WCAG 2.2 AA 24px target minimum for primary controls');
check('mobile menu has keyboard focus treatment', mobileMenuCss.includes(':focus-visible'), 'Visible keyboard focus');
check('mobile interactions respect reduced motion', mobileCss.includes('prefers-reduced-motion') && mobileMenuCss.includes('prefers-reduced-motion'), 'Reduced-motion contract');

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ generated_at: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;
