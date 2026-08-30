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
  ['property/branding/index.html', 'developer'],
  ['property/scan/index.html', 'pro_plus'],
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

// NJW-98 intentionally makes the Data Center catalog/overview public while
// keeping account-owned dataset execution, saved views, exports and schedules
// behind the server-owned Pro+ entitlement and production RLS contracts.
const dataCenterPage = read('property/data-center/index.html');
const dataCenterPublic = read('property/js/data-center-public-v2.js');
const dataCenterRuntime = read('property/js/data-center-runtime-v2.js');
const dataCenterOverview = read('supabase/migrations/20260829152600_public_data_center_overview_v1.sql');
check('property/data-center/index.html remains public', !/data-access-require=/.test(dataCenterPage) && !dataCenterPage.includes('/property/js/access-guard.js'), 'Public transparency route is intentionally browseable without an account');
check('Data Center public runtime uses bounded overview RPC', dataCenterPublic.includes('get_public_data_center_overview_v1') && !dataCenterPublic.includes("from('saved_properties')") && !dataCenterPublic.includes('data_center_delivery_jobs'), 'Public browser receives provider/coverage metadata only');
check('Data Center private runtime requires Pro+', dataCenterRuntime.includes("required_plan: 'pro_plus'") && dataCenterRuntime.includes("from('saved_properties')") && dataCenterRuntime.includes("from('saved_data_center_views')") && dataCenterRuntime.includes("from('data_center_delivery_jobs')"), 'Private workspace actions remain entitlement checked; production RLS is verified separately');
check('Data Center public RPC is bounded and direct source tables stay revoked', /grant execute on function public\.get_public_data_center_overview_v1\(\) to anon, authenticated/i.test(dataCenterOverview) && /revoke all on table public\.data_center_provider_coverage from anon, authenticated/i.test(dataCenterOverview), 'Public surface exposes the aggregate contract rather than direct provider tables');

const guard = read('property/js/access-guard.js');
check('developer guard uses server RPC', guard.includes("rpc('is_watchdog_developer')"), 'No email or browser role heuristic');
check('paid route guard uses server entitlement RPC', guard.includes("rpc('get_my_entitlement')"), 'Paid URL access is based on server subscription state');
check('developer guard redirects unauthenticated users', guard.includes("destination('signin')"), 'Unauthenticated route behavior');
check('developer guard redirects unauthorized users', guard.includes("destination('restricted')"), 'Unauthorized route behavior');

const sideMenu = read('property/js/sidemenu.js');
check(
  'retired vertical sidenav cannot be fetched',
  !sideMenu.includes("fetch('/property/partials/sidemenu.html'") && !sideMenu.includes('fetch("/property/partials/sidemenu.html"'),
  'New and unmigrated pages must use a current shell or render without the retired legacy rail'
);

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

function decodeJwtRole(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof decoded?.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

function containsServiceCredential(body) {
  // Human-readable documentation may legitimately mention "service_role".
  // Flag actual secret material instead: secret-format keys, populated secret
  // assignments, or JWTs whose decoded role is explicitly service_role.
  if (/\bsb_secret_[A-Za-z0-9_-]{20,}\b/.test(body)) return true;

  const assignment = /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|service_role(?:_key)?)\s*(?:=|:)\s*["'`]([^"'`\s<>{}]{16,})["'`]/ig;
  if (assignment.test(body)) return true;

  const jwtTokens = body.match(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g) || [];
  return jwtTokens.some((token) => decodeJwtRole(token) === 'service_role');
}

const clientSecrets = browserFiles.filter((file) => containsServiceCredential(fs.readFileSync(file, 'utf8')));
check('no service credentials in browser property files', clientSecrets.length === 0, clientSecrets.length ? clientSecrets.map((f) => path.relative(root, f)).join(', ') : 'Publishable client key only');

const mobileCss = read('property/css/mobile-app.css');
const mobileMenuCss = read('property/css/mobile-menu.css');
const dashboardCss = read('property/css/dashboard/watchdog-dashboard.css');
const dashboardPage = read('property/dashboard/index.html');
const homePage = read('property/home/index.html');

check('property/dashboard/index.html uses responsive viewport', /name=["']viewport["']/.test(dashboardPage), 'Mobile reflow contract');
check(
  'property/dashboard/index.html loads responsive dashboard styling',
  dashboardPage.includes('/property/css/dashboard/watchdog-dashboard.css') && /@media\(max-width:(?:720|760)px\)/.test(dashboardCss),
  'The 2027 Dashboard owns its mobile chrome inside the consolidated responsive dashboard stylesheet'
);
check('property/home/index.html uses responsive viewport', /name=["']viewport["']/.test(homePage), 'Mobile reflow contract');
check('property/home/index.html loads mobile menu styling', homePage.includes('/property/css/mobile-menu.css'), 'Shared mobile menu remains styled on customer pages');
check('primary mobile controls meet generous target sizing', mobileCss.includes('min-height:52px') && mobileMenuCss.includes('min-height:52px'), 'Exceeds WCAG 2.2 AA 24px target minimum for primary controls');
check('mobile menu has keyboard focus treatment', mobileMenuCss.includes(':focus-visible'), 'Visible keyboard focus');
check('mobile interactions respect reduced motion', mobileCss.includes('prefers-reduced-motion') && mobileMenuCss.includes('prefers-reduced-motion'), 'Reduced-motion contract');

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ generated_at: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;
