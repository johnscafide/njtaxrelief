import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const url=Deno.env.get("SUPABASE_URL")||"",publishable=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const SEARCH_CONSOLE_PROVIDER="google_search_console";
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

function ymd(date:Date){return date.toISOString().slice(0,10)}
function daysBefore(date:Date,days:number){return new Date(date.getTime()-days*86400000)}
function percentDelta(current:any,previous:any){const c=Number(current||0),p=Number(previous||0);if(!Number.isFinite(c)||!Number.isFinite(p)||p===0)return null;return (c-p)/p*100}
function chooseWatchdogSite(entries:any[]){const urls=(entries||[]).map(x=>String(x?.siteUrl||x||'')).filter(Boolean);const preferred=['sc-domain:watchdogindex.com','https://www.watchdogindex.com/','https://watchdogindex.com/','sc-domain:njpropertytaxrelief.com','https://www.njpropertytaxrelief.com/','https://njpropertytaxrelief.com/'];for(const p of preferred)if(urls.includes(p))return p;return urls[0]||null}
async function googleAccessToken(refreshToken:string){
 const clientId=Deno.env.get('GOOGLE_ADS_CLIENT_ID'),clientSecret=Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
 if(!clientId||!clientSecret)throw new Error('Google OAuth client is not configured');
 const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'});
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(8000)}),data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw new Error('Google access token refresh failed');
 return String(data.access_token);
}
async function searchConsoleQuery(accessToken:string,siteUrl:string,body:Record<string,unknown>){
 const endpoint=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)}),data=await response.json().catch(()=>({}));
 if(!response.ok){const msg=String(data?.error?.message||'Search Console query failed');throw new Error(response.status===403?'Search Console API is not enabled for this Google Cloud project or the account lacks access to the selected property.':msg)}
 return data;
}
function summaryRow(data:any){const row=Array.isArray(data?.rows)?data.rows[0]:null;return{clicks:Number(row?.clicks||0),impressions:Number(row?.impressions||0),ctr:Number(row?.ctr||0),position:Number(row?.position||0)}}
function dimensionRows(data:any){return(Array.isArray(data?.rows)?data.rows:[]).map((row:any)=>({key:String(row?.keys?.[0]||''),clicks:Number(row?.clicks||0),impressions:Number(row?.impressions||0),ctr:Number(row?.ctr||0),position:Number(row?.position||0)})).filter((row:any)=>row.key)}
async function searchConsoleSignals(admin:any,userId:string){
 const connectionResult=await admin.from('marketing_provider_connections').select('id,status,public_config,health_summary,last_health_at,last_error').eq('user_id',userId).eq('provider_key',SEARCH_CONSOLE_PROVIDER).eq('connection_scope','user').maybeSingle();
 if(connectionResult.error)return{status:'degraded',error:'Could not read Search Console connection state'};
 const connection=connectionResult.data;if(!connection)return{status:'not_connected'};
 const secret=await admin.rpc('marketing_get_provider_secret',{p_connection_id:connection.id,p_secret_type:'refresh_token'});
 if(secret.error||!secret.data)return{status:'degraded',error:'Search Console refresh credential is missing'};
 try{
   const accessToken=await googleAccessToken(String(secret.data));
   const sitesResponse=await fetch('https://www.googleapis.com/webmasters/v3/sites',{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'},signal:AbortSignal.timeout(8000)}),sitesJson=await sitesResponse.json().catch(()=>({}));
   if(!sitesResponse.ok)throw new Error('Could not list Search Console properties');
   const sites=(Array.isArray(sitesJson.siteEntry)?sitesJson.siteEntry:[]).map((x:any)=>({siteUrl:String(x?.siteUrl||''),permissionLevel:String(x?.permissionLevel||'')})).filter((x:any)=>x.siteUrl);
   const configured=String(connection.public_config?.selected_site||''),siteUrl=configured||chooseWatchdogSite(sites);
   if(!siteUrl)return{status:'degraded',error:'Google account has no accessible Search Console properties',sites};
   const end=daysBefore(new Date(),2),start=daysBefore(end,27),previousEnd=daysBefore(start,1),previousStart=daysBefore(previousEnd,27);
   const currentRange={startDate:ymd(start),endDate:ymd(end),type:'web'},previousRange={startDate:ymd(previousStart),endDate:ymd(previousEnd),type:'web'};
   const [current,previous,queries,pages]=await Promise.all([
     searchConsoleQuery(accessToken,siteUrl,currentRange),
     searchConsoleQuery(accessToken,siteUrl,previousRange),
     searchConsoleQuery(accessToken,siteUrl,{...currentRange,dimensions:['query'],rowLimit:20}),
     searchConsoleQuery(accessToken,siteUrl,{...currentRange,dimensions:['page'],rowLimit:20})
   ]);
   const summary=summaryRow(current),prior=summaryRow(previous);
   return{status:'connected',site_url:siteUrl,sites,range:{start:currentRange.startDate,end:currentRange.endDate},summary,previous:prior,delta:{clicks:percentDelta(summary.clicks,prior.clicks),impressions:percentDelta(summary.impressions,prior.impressions)},queries:dimensionRows(queries),pages:dimensionRows(pages),note:'Search Analytics returns top rows and is not an exhaustive raw export.'};
 }catch(error){return{status:'degraded',error:String((error as Error)?.message||error),connection_status:connection.status||null,last_health_at:connection.last_health_at||null}}
}

function auditDisplay(audits:any,id:string){const audit=audits?.[id];return audit?.displayValue!=null?String(audit.displayValue):null}
async function pageSpeedOne(target:{label:string,url:string},strategy:string,key:string){
 const q=new URLSearchParams({url:target.url,strategy});for(const c of ['performance','accessibility','best-practices','seo'])q.append('category',c);if(key)q.set('key',key);
 try{
   const response=await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q.toString()}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(25000)}),data=await response.json().catch(()=>({}));
   if(!response.ok)return{ok:false,label:target.label,url:target.url,strategy,error:String(data?.error?.message||`PageSpeed ${response.status}`)};
   const cats=data?.lighthouseResult?.categories||{},audits=data?.lighthouseResult?.audits||{};
   return{ok:true,label:target.label,url:target.url,strategy,categories:{performance:Number(cats.performance?.score??NaN),accessibility:Number(cats.accessibility?.score??NaN),best_practices:Number(cats['best-practices']?.score??NaN),seo:Number(cats.seo?.score??NaN)},audits:{fcp:auditDisplay(audits,'first-contentful-paint'),lcp:auditDisplay(audits,'largest-contentful-paint'),cls:auditDisplay(audits,'cumulative-layout-shift'),tbt:auditDisplay(audits,'total-blocking-time'),speed_index:auditDisplay(audits,'speed-index')}};
 }catch(error){return{ok:false,label:target.label,url:target.url,strategy,error:String((error as Error)?.message||error)}}
}
async function pageSpeedSignals(){
 const key=String(Deno.env.get('GOOGLE_PAGESPEED_API_KEY')||''),targets=[{label:'Watchdog Index',url:'https://www.watchdogindex.com/'},{label:'Property lookup',url:'https://www.watchdogindex.com/property/'},{label:'Professional plans',url:'https://www.watchdogindex.com/property/pro'}],tasks:any[]=[];
 for(const target of targets)for(const strategy of ['mobile','desktop'])tasks.push(pageSpeedOne(target,strategy,key));
 return{mode:key?'api_key':'keyless',checked_at:new Date().toISOString(),note:'Lighthouse lab categories only; PSI embedded CrUX field data is intentionally not used.',results:await Promise.all(tasks)};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});if(req.method!=="GET"&&req.method!=="POST")return json(req,405,{error:"Method not allowed"});if(!url||!publishable||!serviceKey)return json(req,503,{error:"Analytics report configuration incomplete"});
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return json(req,401,{error:"Sign in required"});
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});const user=await userClient.auth.getUser();if(user.error||!user.data.user)return json(req,401,{error:"Sign in required"});const developer=await userClient.rpc("is_watchdog_developer");if(developer.error||developer.data!==true)return json(req,403,{error:"Developer access required"});
 let body:any={};if(req.method==="POST"){try{body=await req.json()}catch{body={}}}else{try{const u=new URL(req.url);body={range_hours:u.searchParams.get("range_hours"),grain:u.searchParams.get("grain"),external_signals_only:u.searchParams.get("external_signals_only")==='true'}}catch{}}
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 if(body?.external_signals_only===true){const[pagespeed,searchConsole]=await Promise.all([pageSpeedSignals(),searchConsoleSignals(admin,user.data.user.id)]);return json(req,200,{ok:true,generated_at:new Date().toISOString(),privacy:'developer_only_external_aggregate_signals',external_signals:{pagespeed,search_console:searchConsole}})}
 const rangeHours=clampHours(body?.range_hours),bucketGrain=grain(body?.grain,rangeHours),startIso=new Date(Date.now()-rangeHours*3600000).toISOString(),start90=new Date(Date.now()-90*86400000).toISOString().slice(0,10),start30=new Date(Date.now()-30*86400000).toISOString();
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
