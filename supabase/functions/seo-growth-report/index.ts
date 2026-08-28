import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row=Record<string,any>;
const url=Deno.env.get("SUPABASE_URL")||"",publishable=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
function allowedOrigin(req:Request){const origin=req.headers.get("origin")||"";try{const host=new URL(origin).hostname.toLowerCase();if(host==="njpropertytaxrelief.com"||host==="www.njpropertytaxrelief.com"||host==="watchdogindex.com"||host==="www.watchdogindex.com"||host==="watchdogre.com"||host==="www.watchdogre.com"||host==="localhost"||host==="127.0.0.1"||host.endsWith(".vercel.app"))return origin}catch{}return "https://www.watchdogindex.com"}
function headers(req:Request){return{"Access-Control-Allow-Origin":allowedOrigin(req),"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"}}
function json(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:headers(req)})}
function ymd(date:Date){return date.toISOString().slice(0,10)}
function daysBefore(date:Date,days:number){return new Date(date.getTime()-days*86400000)}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function rate(num:number,den:number){return den>0?num/den:null}
function keyOf(row:Row){return `${String(row.dimension||'')}:${String(row.dimension_key||'')}`}

async function verifyDeveloper(auth:string){
 const client=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const user=await client.auth.getUser();if(user.error||!user.data.user)return null;
 const developer=await client.rpc("is_watchdog_developer");if(developer.error||developer.data!==true)return null;
 return user.data.user;
}

async function loadBaseSignals(auth:string){
 const response=await fetch(`${url}/functions/v1/product-analytics-report`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({external_signals_only:true}),signal:AbortSignal.timeout(45000)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||!body?.ok)throw new Error(String(body?.error||`External signals failed (${response.status})`));
 return body;
}

async function persistSnapshot(admin:any,userId:string,gsc:any){
 if(gsc?.status!=="connected"||!gsc?.site_url||!gsc?.range?.start||!gsc?.range?.end)return{stored:false,reason:"search_console_not_connected"};
 const now=new Date().toISOString(),snapshotDate=String(gsc.range.end),common={user_id:userId,site_url:String(gsc.site_url),snapshot_date:snapshotDate,range_start:String(gsc.range.start),range_end:snapshotDate,updated_at:now};
 const rows:Row[]=[{...common,dimension:"summary",dimension_key:"__summary__",clicks:n(gsc.summary?.clicks),impressions:n(gsc.summary?.impressions),ctr:n(gsc.summary?.ctr),position:n(gsc.summary?.position)}];
 for(const [dimension,items] of [["query",gsc.queries],["page",gsc.pages]] as const)for(const item of Array.isArray(items)?items:[])rows.push({...common,dimension,dimension_key:String(item?.key||"").slice(0,1200),clicks:n(item?.clicks),impressions:n(item?.impressions),ctr:n(item?.ctr),position:n(item?.position)});
 const saved=await admin.from("search_console_snapshots").upsert(rows,{onConflict:"user_id,site_url,snapshot_date,dimension,dimension_key"});
 return saved.error?{stored:false,error:saved.error.message}:{stored:true,snapshot_date:snapshotDate,rows:rows.length};
}

async function weeklyMovement(admin:any,userId:string,gsc:any){
 if(gsc?.status!=="connected"||!gsc?.site_url||!gsc?.range?.end)return{available:false,reason:"search_console_not_connected"};
 const currentDate=String(gsc.range.end),cutoff=ymd(daysBefore(new Date(`${currentDate}T12:00:00Z`),6));
 const result=await admin.from("search_console_snapshots").select("snapshot_date,dimension,dimension_key,clicks,impressions,ctr,position").eq("user_id",userId).eq("site_url",String(gsc.site_url)).lte("snapshot_date",cutoff).order("snapshot_date",{ascending:false}).limit(500);
 if(result.error)return{available:false,error:result.error.message};
 const priorDate=String(result.data?.[0]?.snapshot_date||"");if(!priorDate)return{available:false,current_date:currentDate,note:"Weekly baseline will appear after a snapshot at least six days older exists."};
 const prior=(result.data||[]).filter((row:Row)=>String(row.snapshot_date)===priorDate),map=new Map(prior.map((row:Row)=>[keyOf(row),row]));
 function enrich(dimension:string,items:any[]){return(Array.isArray(items)?items:[]).map((item:any)=>{const p=map.get(`${dimension}:${String(item?.key||"")}`) as Row|undefined;const currentPosition=n(item?.position),previousPosition=p?n(p.position):null;return{...item,previous_position:previousPosition,position_change:previousPosition==null?null:previousPosition-currentPosition,previous_impressions:p?n(p.impressions):null,impressions_change:p?n(item?.impressions)-n(p.impressions):null,previous_ctr:p?n(p.ctr):null,ctr_change:p?n(item?.ctr)-n(p.ctr):null}})}
 const queries=enrich("query",gsc.queries||[]),pages=enrich("page",gsc.pages||[]),priorQueries=prior.filter((r:Row)=>r.dimension==="query");
 return{available:true,current_date:currentDate,previous_date:priorDate,queries,pages,summary:{tracked_queries:queries.length,tracked_with_weekly_baseline:queries.filter((x:any)=>x.previous_position!=null).length,page_one_queries:queries.filter((x:any)=>n(x.position)<=10).length,prior_page_one_queries:priorQueries.filter((x:Row)=>n(x.position)<=10).length,quick_win_queries:queries.filter((x:any)=>n(x.position)>=8&&n(x.position)<=25).length}};
}

async function organicFunnel(admin:any){
 const start=ymd(daysBefore(new Date(),27));
 const result=await admin.from("analytics_organic_search_conversion_daily").select("day,landing_group,organic_sessions,property_lookup_opened_sessions,property_lookup_started_sessions,meaningful_action_sessions").gte("day",start).order("day",{ascending:true});
 if(result.error)return{status:"degraded",error:result.error.message,range_start:start};
 const totals={organic_sessions:0,property_lookup_opened_sessions:0,property_lookup_started_sessions:0,meaningful_action_sessions:0},groups=new Map<string,any>();
 for(const row of result.data||[]){const group=String(row.landing_group||"other_public"),g=groups.get(group)||{landing_group:group,organic_sessions:0,property_lookup_opened_sessions:0,property_lookup_started_sessions:0,meaningful_action_sessions:0};for(const k of Object.keys(totals)){const v=n(row[k]);(totals as any)[k]+=v;g[k]+=v}groups.set(group,g)}
 return{status:"ok",range_start:start,range_end:ymd(new Date()),totals:{...totals,lookup_open_rate:rate(totals.property_lookup_opened_sessions,totals.organic_sessions),lookup_start_rate:rate(totals.property_lookup_started_sessions,totals.organic_sessions),meaningful_action_rate:rate(totals.meaningful_action_sessions,totals.organic_sessions)},by_landing_group:[...groups.values()].map(g=>({...g,lookup_open_rate:rate(g.property_lookup_opened_sessions,g.organic_sessions),lookup_start_rate:rate(g.property_lookup_started_sessions,g.organic_sessions),meaningful_action_rate:rate(g.meaningful_action_sessions,g.organic_sessions)}),daily:result.data||[],privacy:"Aggregate external sessions only; no address, property search text, PAMS PIN, or identity is returned."};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:headers(req)});if(req.method!=="POST")return json(req,405,{error:"Method not allowed"});if(!url||!publishable||!serviceKey)return json(req,503,{error:"SEO growth reporting configuration incomplete"});
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return json(req,401,{error:"Sign in required"});
 const user=await verifyDeveloper(auth);if(!user)return json(req,403,{error:"Developer access required"});
 try{
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}),base=await loadBaseSignals(auth),gsc=base?.external_signals?.search_console||null;
  const snapshot=await persistSnapshot(admin,user.id,gsc),[movement,funnel]=await Promise.all([weeklyMovement(admin,user.id,gsc),organicFunnel(admin)]);
  if(base?.external_signals?.search_console)base.external_signals.search_console={...base.external_signals.search_console,snapshot,weekly_movement:movement};
  base.external_signals={...(base.external_signals||{}),organic_search_funnel:funnel};
  base.privacy="developer_only_external_aggregate_signals_and_privacy_scoped_acquisition";
  return json(req,200,base);
 }catch(error){return json(req,502,{error:String((error as Error)?.message||error)})}
});
