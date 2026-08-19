import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const page=read('property/analytics/index.html');
const report=read('supabase/functions/product-analytics-report/index.ts');
const ingest=read('supabase/functions/product-analytics/index.ts');
const config=read('supabase/config.toml');

must(page.includes('data-developer-only="true"'),'Analytics review page must remain developer-only.');
must(page.includes('/property/js/supabase-runtime.js'),'Analytics page must use the canonical Supabase runtime.');
must(page.includes("functions.invoke('product-analytics-report'"),'Analytics page must read through the guarded report endpoint.');
must(!page.match(/\.js\?v=|\.css\?v=/),'Analytics page must not use version-query asset URLs.');

must(report.includes('rpc("is_watchdog_developer")'),'Analytics report must verify developer role server-side.');
must(report.includes('developer.data !== true'),'Analytics report must fail closed for non-developers.');
for (const view of ['analytics_daily_funnel','analytics_tool_usage_daily','analytics_acquisition_daily','analytics_weekly_retention']) {
  must(report.includes(view),`Analytics report must read ${view}.`);
}
must(report.includes('aggregate_product_analytics_only'),'Analytics report must declare its aggregate privacy boundary.');
for (const forbidden of ['select("user_id','select("email','select("phone','select("address','select("pams_pin']) {
  must(!report.includes(forbidden),`Analytics report must not select identifying/property-level field: ${forbidden}`);
}

must(ingest.includes('const PROPERTY_KEYS=new Set'),'Anonymous analytics ingestion must retain a strict property allowlist.');
for (const pii of ['email','phone','address','pams_pin','full_name']) {
  must(!ingest.includes(`'${pii}'`),`Anonymous analytics ingestion must not allow ${pii}.`);
}

must(/\[functions\.product-analytics\][\s\S]*?verify_jwt = false/.test(config),'Anonymous analytics ingest config must remain explicitly registered.');
must(/\[functions\.product-analytics-report\][\s\S]*?verify_jwt = true/.test(config),'Developer analytics report must require JWT at the gateway.');

console.log('Product analytics access/privacy contract passed.');
