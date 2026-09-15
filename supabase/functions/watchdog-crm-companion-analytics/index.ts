import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
function namedEnv(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacyName)||"";}
function cors(req:Request){const origin=req.headers.get("origin")||"";const allow=ORIGINS.has(origin)||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)?origin:"https://watchdogindex.com";return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function out(req:Request,status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store"}});}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"method_not_allowed"});
  const origin=req.headers.get("origin")||"";if(origin&&!ORIGINS.has(origin)&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))return out(req,403,{error:"origin_not_allowed"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"sign_in_required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return out(req,503,{error:"service_unavailable"});
  const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userDb.auth.getUser();if(authError||!authData.user)return out(req,401,{error:"session_invalid"});
  const {data:profile}=await admin.from("profiles").select("account_role").eq("id",authData.user.id).maybeSingle();if(String(profile?.account_role||"")!=="developer")return out(req,403,{error:"developer_required"});
  let body:any={};try{body=await req.json()}catch{}const days=Math.max(1,Math.min(90,Number(body.days)||30)),since=new Date(Date.now()-days*86400000).toISOString();
  const [daily,events,sessions]=await Promise.all([
    admin.from("analytics_extension_usage_daily").select("*").gte("day",since.slice(0,10)).order("day",{ascending:true}),
    admin.from("watchdog_extension_events").select("event_name,plan_tier,extension_version,occurred_at").gte("occurred_at",since),
    admin.from("watchdog_extension_sessions").select("id,plan_tier,extension_version,browser_family,created_at,last_used_at,expires_at,revoked_at").gte("created_at",since)
  ]);
  if(daily.error||events.error||sessions.error)return out(req,503,{error:"analytics_unavailable"});
  const rows=events.data||[],sessionRows=sessions.data||[],byEvent:Record<string,number>={},byPlan:Record<string,number>={},byVersion:Record<string,number>={};
  for(const row of rows){const e=String(row.event_name||"unknown"),p=String(row.plan_tier||"unknown"),v=String(row.extension_version||"unknown");byEvent[e]=(byEvent[e]||0)+1;byPlan[p]=(byPlan[p]||0)+1;byVersion[v]=(byVersion[v]||0)+1;}
  const activeSessions=sessionRows.filter((s:any)=>!s.revoked_at&&Date.parse(String(s.expires_at||""))>Date.now()).length;
  const lookupStarted=byEvent.lookup_started||0,lookupSucceeded=byEvent.lookup_succeeded||0,writesStarted=byEvent.crm_write_started||0,writesSucceeded=byEvent.crm_write_succeeded||0;
  return out(req,200,{days,daily:daily.data||[],summary:{events:rows.length,sessions_created:sessionRows.length,active_sessions:activeSessions,extension_opens:byEvent.extension_opened||0,contacts_detected:byEvent.boldtrail_contact_detected||0,lookups_started:lookupStarted,lookups_succeeded:lookupSucceeded,lookup_success_pct:lookupStarted?Math.round(1000*lookupSucceeded/lookupStarted)/10:0,writes_started:writesStarted,writes_succeeded:writesSucceeded,write_success_pct:writesStarted?Math.round(1000*writesSucceeded/writesStarted)/10:0},by_event:byEvent,by_plan:byPlan,by_version:byVersion});
});
