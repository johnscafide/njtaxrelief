import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const page=read('property/analytics/index.html');
const report=read('supabase/functions/product-analytics-report/index.ts');
const ingest=read('supabase/functions/product-analytics/index.ts');
const client=read('property/js/product-analytics.js');
const migration=read('supabase/migrations/20260819130000_watchdog_intelligence_product_analytics_funnel.sql');
const config=read('supabase/config.toml');

must(page.includes('data-developer-only="true"'),'Analytics review page must remain developer-only.');
must(page.includes('/property/js/supabase-runtime.js'),'Analytics page must use the canonical Supabase runtime.');
must(page.includes("functions.invoke('product-analytics-report'"),'Analytics page must read through the guarded report endpoint.');
must(page.includes('Decision funnel · recent days'),'Developer analytics must expose the Intelligence decision funnel.');
must(page.includes('Governed decision activity · 30 days'),'Developer analytics must summarize persisted Today/Intent outcomes.');
must(page.includes('does not expose names, emails, addresses, PAMS PINs, search text, prompts'),'Developer page must state the Intelligence analytics privacy boundary.');
must(!page.match(/\.js\?v=|\.css\?v=/),'Analytics page must not use version-query asset URLs.');

must(report.includes('rpc("is_watchdog_developer")'),'Analytics report must verify developer role server-side.');
must(report.includes('developer.data!==true'),'Analytics report must fail closed for non-developers.');
for (const view of ['analytics_daily_funnel','analytics_tool_usage_daily','analytics_acquisition_daily','analytics_weekly_retention','analytics_intelligence_funnel_daily','analytics_intelligence_interactions_daily']) {
  must(report.includes(view),`Analytics report must read ${view}.`);
}
must(report.includes('from("intelligence_today_events").select("action,created_at")'),'Today analytics may read only aggregate-safe action/time fields.');
must(report.includes('from("intelligence_intent_events").select("event_type,fact_class,created_at")'),'Intent analytics may read only aggregate-safe type/class/time fields.');
must(report.includes('aggregate_product_analytics_only'),'Analytics report must declare its aggregate privacy boundary.');
for (const forbidden of ['select("user_id','select("email','select("phone','select("address','select("pams_pin','select("payload','select("evidence_refs','select("context_key']) {
  must(!report.includes(forbidden),`Analytics report must not select identifying/property-level field: ${forbidden}`);
}

must(ingest.includes('const PROPERTY_KEYS=new Set'),'Anonymous analytics ingestion must retain a strict property allowlist.');
for (const event of ['intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intent_question_shown','intent_question_answered','trust_evidence_opened']) {
  must(ingest.includes(`'${event}'`),`Ingest must explicitly allow Intelligence event ${event}.`);
  must(client.includes(`'${event}'`),`Browser collector must explicitly know Intelligence event ${event}.`);
}
for (const pii of ['email','phone','address','pams_pin','full_name','prompt','query','search_text','property_pin','user_id','profession']) {
  must(!ingest.includes(`'${pii}'`),`Anonymous analytics ingestion must not allow ${pii}.`);
}
must(client.includes('navigator.globalPrivacyControl===true'),'Global Privacy Control must disable browser analytics.');
must(client.includes("navigator.doNotTrack==='1'"),'Do Not Track must disable browser analytics.');
must(client.includes("pathOnly(location.href)"),'Browser analytics must reduce URLs to pathname before sending them.');
must(!client.includes('location.search.slice'),'Browser analytics must not send raw query strings.');
for (const forbidden of ['pams_pin','property_pin','full_name','email','phone','prompt_text','search_text']) {
  must(!client.includes(`'${forbidden}'`),`Browser analytics must not allow ${forbidden}.`);
}

must(migration.includes('with (security_invoker=true)'),'Intelligence aggregate views must use security-invoker semantics.');
must(migration.includes('revoke all on public.analytics_intelligence_funnel_daily, public.analytics_intelligence_interactions_daily from anon, authenticated'),'Intelligence aggregate views must remain closed to browsers.');
must(migration.includes('grant select on public.analytics_intelligence_funnel_daily, public.analytics_intelligence_interactions_daily to service_role'),'Only service role may read the Intelligence aggregate views.');

must(/\[functions\.product-analytics\][\s\S]*?verify_jwt = false/.test(config),'Anonymous analytics ingest config must remain explicitly registered.');
must(/\[functions\.product-analytics-report\][\s\S]*?verify_jwt = true/.test(config),'Developer analytics report must require JWT at the gateway.');

console.log('Product/Intelligence analytics access and privacy contract passed.');
