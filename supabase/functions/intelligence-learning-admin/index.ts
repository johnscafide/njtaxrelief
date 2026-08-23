import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const env=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw)try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}return Deno.env.get(l)||""};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return out(req,405,{error:"POST required"});
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
 const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return out(req,503,{error:"Configuration incomplete"});
 const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:au}=await uc.auth.getUser(),user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
 const role=await admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle();if(role.data?.account_role!=="developer")return out(req,403,{error:"Developer access required"});
 const [{data:profiles},{data:events},{data:values},{data:feedback},{data:assumptions}]=await Promise.all([
  admin.from("intelligence_preference_profiles").select("profession,objective,status,sample_size,positive_count,negative_count,minimum_evidence,last_rebuilt_at,updated_at"),
  admin.from("intelligence_outcome_events").select("event_type,model_key,model_version,metadata,occurred_at"),
  admin.from("intelligence_value_snapshots").select("raw_scenario_value_cents,probability_adjusted_value_cents,profession,objective,created_at"),
  admin.from("intelligence_feedback").select("feedback,outcome,updated_at"),
  admin.from("intelligence_assumptions").select("profession,objective,updated_at")
 ]);
 const p=profiles||[],e=events||[],v=values||[],f=feedback||[],a=assumptions||[];
 const byStatus:Record<string,number>={},byProfession:Record<string,{profiles:number,active:number,samples:number}>={},funnel:Record<string,number>={},byModel:Record<string,Record<string,number>>={};
 for(const x of p){const s=String(x.status||"unknown"),profession=String(x.profession||"general");byStatus[s]=(byStatus[s]||0)+1;byProfession[profession]=byProfession[profession]||{profiles:0,active:0,samples:0};byProfession[profession].profiles++;byProfession[profession].samples+=Number(x.sample_size||0);if(s==="active")byProfession[profession].active++}
 for(const x of e){const type=String(x.event_type||"unknown"),model=String(x.model_key||"unknown");funnel[type]=(funnel[type]||0)+1;byModel[model]=byModel[model]||{};byModel[model][type]=(byModel[model][type]||0)+1}
 const sum=(arr:number[])=>arr.reduce((q,n)=>q+n,0),raw=v.map(x=>Number(x.raw_scenario_value_cents||0)).filter(Number.isFinite),adjusted=v.map(x=>Number(x.probability_adjusted_value_cents||0)).filter(Number.isFinite);
 return out(req,200,{ok:true,generated_at:new Date().toISOString(),profiles:{total:p.length,by_status:byStatus,by_profession:byProfession,active:p.filter(x=>x.status==="active").length,eligible_but_inactive:p.filter(x=>Number(x.sample_size||0)>=Number(x.minimum_evidence||8)&&x.status!=="active").length},funnel,by_model:byModel,feedback:{rows:f.length,useful:f.filter(x=>x.feedback==="useful").length,not_relevant:f.filter(x=>x.feedback==="not_relevant").length},scenarios:{assumption_profiles:a.length,value_snapshots:v.length,average_raw_cents:raw.length?Math.round(sum(raw)/raw.length):0,average_adjusted_cents:adjusted.length?Math.round(sum(adjusted)/adjusted.length):0},guardrail:"Learning analytics measure first-party product outcomes. They do not expose or use protected/sensitive personal characteristics."});
});