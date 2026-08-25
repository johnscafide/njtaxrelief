import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const url=Deno.env.get("SUPABASE_URL")||"",publishable=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
function allowedOrigin(req:Request){const origin=req.headers.get("origin")||"";try{const host=new URL(origin).hostname.toLowerCase();if(host==="njpropertytaxrelief.com"||host==="www.njpropertytaxrelief.com"||host==="watchdogindex.com"||host==="www.watchdogindex.com"||host==="watchdogre.com"||host==="www.watchdogre.com"||host==="localhost"||host==="127.0.0.1"||host.endsWith(".vercel.app"))return origin}catch{}return "https://www.watchdogindex.com"}
function headers(req:Request){return{"Access-Control-Allow-Origin":allowedOrigin(req),"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"}}
function json(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:headers(req)})}
function countBy(rows:Row[],key:string){const out:Record<string,number>={};for(const row of rows){const value=String(row?.[key]||"unknown");out[value]=(out[value]||0)+1}return out}
function clampHours(v:any){const n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(8760,Math.round(n))):720}
function grain(v:any,hours:number){const g=String(v||"").toLowerCase();if(["hour","day","week","month"].includes(g))return g;if(hours<=48)return"hour";if(hours<=2160)return"day";if(hours<=4380)return"week";return"month"}
function aiSource(row:Row){
 const explicit=String(row?.properties?.source||"").toLowerCase();
 const approved=new Set(["chatgpt","perplexity","microsoft_copilot","google_gemini","claude","grok","you_com","phind","meta_ai","other_ai"]);
 if(approved.has(explicit))return explicit;
 const source=String(row?.utm_source||"").toLowerCase(),medium=String(row?.utm_medium||"").toLowerCase(),host=String(row?.referrer_host||"").toLowerCase();
 if(source==="chatgpt.com"||source==="chatgpt"||source==="openai"||host==="chatgpt.com"||host==="chat.openai.com"||host.endsWith(".chatgpt.com"))return"chatgpt";
 if(source.includes("perplexity")||host==="perplexity.ai"||host.endsWith(".perplexity.ai"))return"perplexity";
 if(source.includes("copilot")||source==="microsoft_ai"||host==="copilot.microsoft.com"||host.endsWith(".copilot.microsoft.com"))return"microsoft_copilot";
 if(source.includes("gemini")||source==="google_ai"||source==="google-aio"||host==="gemini.google.com"||host.endsWith(".gemini.google.com"))return"google_gemini";
 if(source.includes("claude")||source==="anthropic"||host==="claude.ai"||host.endsWith(".claude.ai"))return"claude";
 if(source.includes("grok")||host==="grok.com"||host.endsWith(".grok.com"))return"grok";
 if(source==="you.com"||source==="you_com"||host==="you.com"||host.endsWith(".you.com"))return"you_com";
 if(source.includes("phind")||host==="phind.com"||host.endsWith(".phind.com"))return"phind";
 if(source==="meta_ai"||source==="meta.ai"||host==="meta.ai"||host.endsWith(".meta.ai"))return"meta_ai";
 if(["ai","answer_engine","assistant","llm"].includes(medium))return"other_ai";
 return"";
}
function aggregateAi(rows:Row[]){
 const groups=new Map<string,{source:string,referrals:number,landing_pages:Set<string>,latest_seen:string}>();
 for(const row of rows){const source=aiSource(row);if(!source)continue;const seen=String(row?.occurred_at||"");const path=String(row?.path||row?.landing_path||"/");let group=groups.get(source);if(!group){group={source,referrals:0,landing_pages:new Set<string>(),latest_seen:""};groups.set(source,group)}group.referrals+=1;if(path)group.landing_pages.add(path);if(seen>group.latest_seen)group.latest_seen=seen}
 return [...groups.values()].map(g=>({source:g.source,referrals:g.referrals,landing_pages:g.landing_pages.size,latest_seen:g.latest_seen})).sort((a,b)=>b.referrals-a.referrals||a.source.localeCompare(b.source));
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});if(req.method!=="GET"&&req.method!=="POST")return json(req,405,{error:"Method not allowed"});if(!url||!publishable||!serviceKey)return json(req,503,{error:"Analytics report configuration incomplete"});
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return json(req,401,{error:"Sign in required"});
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});const user=await userClient.auth.getUser();if(user.error||!user.data.user)return json(req,401,{error:"Sign in required"});const developer=await userClient.rpc("is_watchdog_developer");if(developer.error||developer.data!==true)return json(req,403,{error:"Developer access required"});
 let body:any={};if(req.method==="POST"){try{body=await req.json()}catch{body={}}}else{try{const u=new URL(req.url);body={range_hours:u.searchParams.get("range_hours"),grain:u.searchParams.get("grain")}}catch{}}
 const rangeHours=clampHours(body?.range_hours),bucketGrain=grain(body?.grain,rangeHours),startIso=new Date(Date.now()-rangeHours*3600000).toISOString(),start90=new Date(Date.now()-90*86400000).toISOString().slice(0,10),start30=new Date(Date.now()-30*86400000).toISOString();
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const internal=await admin.rpc("watchdog_internal_analytics_user_ids");if(internal.error)return json(req,500,{error:"Could not resolve analytics audience boundary"});const internalIds=(Array.isArray(internal.data)?internal.data:[]).map(String).filter(Boolean),notInternal=internalIds.length?`(${internalIds.join(",")})`:"";
 let todayQuery=admin.from("intelligence_today_events").select("action,created_at").gte("created_at",start30).order("created_at",{ascending:false}).limit(5000);
 let intentQuery=admin.from("intelligence_intent_events").select("event_type,fact_class,created_at").gte("created_at",start30).order("created_at",{ascending:false}).limit(5000);
 let subscriptionQuery=admin.from("account_entitlements").select("plan_tier,billing_tier,billing_interval,subscription_status,provider,updated_at,cancel_at_period_end").in("subscription_status",["active","trialing","past_due","paused"]);
 if(notInternal){todayQuery=todayQuery.not("user_id","in",notInternal);intentQuery=intentQuery.not("user_id","in",notInternal);subscriptionQuery=subscriptionQuery.not("user_id","in",notInternal)}
 const [snapshot,series,userGrowth,funnel,tools,acquisition,retention,intelligenceFunnel,intelligenceInteractions,todayActions,intentEvents,subscriptions,billingEvents,totalEvents,aiReferralEvents]=await Promise.all([
  admin.rpc("watchdog_analytics_snapshot",{p_hours:rangeHours}),
  admin.from("analytics_product_timeseries").select("grain,bucket,events,visitors,sessions,page_views,activated_visitors,upgrade_intent,checkout_starts,paid_conversions").eq("grain",bucketGrain).gte("bucket",startIso).order("bucket",{ascending:true}).limit(9000),
  admin.from("analytics_user_growth_timeseries").select("grain,bucket,signups,marketing_optins,completed_profiles").eq("grain",bucketGrain).gte("bucket",startIso).order("bucket",{ascending:true}).limit(9000),
  admin.from("analytics_daily_funnel").select("day,visitors,activated_visitors,upgrade_intent,checkout_starts,paid_conversions").gte("day",start90).order("day",{ascending:false}).limit(90),
  admin.from("analytics_tool_usage_daily").select("day,tool,event_name,events,visitors").gte("day",start90).order("day",{ascending:false}).limit(500),
  admin.from("analytics_acquisition_daily").select("day,source,medium,campaign,visitors,activated,checkout_starts").gte("day",start90).order("day",{ascending:false}).limit(500),
  admin.from("analytics_weekly_retention").select("cohort_week,week_number,retained_visitors").gte("cohort_week",start90).order("cohort_week",{ascending:false}).limit(500),
  admin.from("analytics_intelligence_funnel_daily").select("day,intelligence_reached,reasoning_inspectors,action_starters,action_completers,intent_question_viewers,intent_question_answerers,today_triagers,trust_evidence_openers,intelligence_exposures,reasoning_inspections,completed_actions").gte("day",start90).order("day",{ascending:false}).limit(90),
  admin.from("analytics_intelligence_interactions_daily").select("day,event_name,surface,action,status,events,visitors,sessions").gte("day",start90).order("day",{ascending:false}).limit(1000),
  todayQuery,intentQuery,subscriptionQuery,
  admin.from("access_audit_log").select("event_type,required_plan,created_at").like("event_type","billing.%").gte("created_at",start30).order("created_at",{ascending:false}).limit(1000),
  admin.from("watchdog_product_events").select("id",{count:"exact",head:true}).in("audience_class",["external_visitor","external_account"]),
  admin.from("watchdog_product_events").select("occurred_at,path,landing_path,referrer_host,utm_source,utm_medium,properties").eq("event_name","page_view").in("audience_class",["external_visitor","external_account"]).gte("occurred_at",startIso).order("occurred_at",{ascending:false}).limit(5000)
 ]);
 const results=[snapshot,series,userGrowth,funnel,tools,acquisition,retention,intelligenceFunnel,intelligenceInteractions,todayActions,intentEvents,subscriptions,billingEvents,totalEvents,aiReferralEvents];for(const result of results)if(result.error){console.error("analytics_report_query_failed",result.error);return json(req,500,{error:"Could not load one or more analytics aggregates"})}
 const active=subscriptions.data||[],billing=billingEvents.data||[],today=todayActions.data||[],intent=intentEvents.data||[],latestDay=(funnel.data||[])[0]||null,snap=snapshot.data||{},aiReferrals=aggregateAi(aiReferralEvents.data||[]);
 return json(req,200,{ok:true,generated_at:new Date().toISOString(),privacy:"aggregate_product_analytics_only",audience:"external_only",range:{hours:rangeHours,grain:bucketGrain,start:startIso},snapshot:snap,series:series.data||[],user_growth:userGrowth.data||[],summary:{total_product_events:totalEvents.count||0,latest_day:latestDay,active_subscription_count:active.length,active_by_plan:countBy(active,"plan_tier"),active_by_provider:countBy(active,"provider"),billing_lifecycle_events_30d:billing.length,billing_events_by_type_30d:countBy(billing,"event_type"),today_actions_30d:today.length,today_actions_by_type_30d:countBy(today,"action"),intent_events_30d:intent.length,intent_events_by_type_30d:countBy(intent,"event_type"),intent_events_by_fact_class_30d:countBy(intent,"fact_class"),ai_referrals:aiReferrals.reduce((sum,row)=>sum+Number(row.referrals||0),0)},funnel:funnel.data||[],tool_usage:tools.data||[],acquisition:acquisition.data||[],ai_referrals:aiReferrals,retention:retention.data||[],intelligence_funnel:intelligenceFunnel.data||[],intelligence_interactions:intelligenceInteractions.data||[]});
});