const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('property/dashboard/index.html','utf8');
const js = fs.readFileSync('property/js/dashboard/dashboard-premium-followup.js','utf8');
const css = fs.readFileSync('property/css/dashboard/dashboard-premium-followup.css','utf8');
const presenceMigration = fs.readFileSync('supabase/migrations/20260822215000_dashboard_live_presence_avatars.sql','utf8');
const crmMigration = fs.readFileSync('supabase/migrations/20260822215500_dashboard_crm_summary.sql','utf8');

assert(html.includes('dashboard-premium-followup.css?v=20260822c'));
assert(html.includes('dashboard-premium-followup.js?v=20260822c'));
assert(js.includes("watchdog_dashboard_surface_defaults_v3"));
assert(js.includes('[data-wdv2-toggle="taxvalue"]'));
assert(js.includes('[data-premium-toggle="live-activity"]'));
assert(js.includes("db.rpc('get_my_crm_dashboard_summary')"));
assert(js.includes("slice(0,5)"));
assert(js.includes('data-card-id="crm-count"'));
assert(css.includes('body.wdv2-mounted .wdv2-upgrade-band>[data-card-id="upgrade-pro"]'));
assert(css.includes('grid-column:1/-1!important'));
assert(css.includes('#wd-live-presence .wd-live-avatars img'));
assert(presenceMigration.includes('avatar_urls text[]'));
assert(presenceMigration.includes('grant execute on function public.get_watchdog_live_presence() to authenticated'));
assert(crmMigration.includes('get_my_crm_dashboard_summary'));
assert(crmMigration.includes('auth.uid()'));
assert(crmMigration.includes('revoke all on function public.get_my_crm_dashboard_summary() from anon'));

console.log('dashboard surface follow-up contract: ok');
