import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=140)=>String(v??"").trim().slice(0,n);
const env=(jsonKey:string,legacy:string)=>{const raw=Deno.env.get(jsonKey)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacy)||""};
const numeric=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:au}=await uc.auth.getUser();const user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
  const [{data:ent},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<1)return out(req,403,{error:"Paid plan required"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:unknown)=>clean(x,100)).filter(Boolean))].slice(0,250);
  const requested=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:unknown)=>clean(x,140)).filter(Boolean))].slice(0,100);
  if(!pins.length)return out(req,200,{records:[],markers:{},meta:{},provider_summary:{available:0,provider_missing:0},plan,source:"Watchdog staging governed fixture provider v1",checked_at:new Date().toISOString()});

  const fields="pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,year_built,acres,dwelling_units,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year,lat,lon,history,last_seen";
  const {data:records,error:pe}=await admin.from("property_lookups").select(fields).in("pams_pin",pins);if(pe)return out(req,503,{error:"Staging property fixture unavailable"});
  const {data:observations,error:oe}=await admin.from("score_observations").select("pams_pin,marker_id,score,observed_at,model_version").in("pams_pin",pins).in("marker_id",requested).order("observed_at",{ascending:false});if(oe)return out(req,503,{error:"Staging score fixture unavailable"});
  const markers:Record<string,Record<string,unknown>>={},meta:Record<string,Record<string,unknown>>={},seen=new Set<string>(),now=new Date().toISOString();
  for(const pin of pins){markers[pin]={};meta[pin]={}}
  for(const o of observations||[]){const k=`${o.pams_pin}|${o.marker_id}`;if(seen.has(k))continue;seen.add(k);markers[String(o.pams_pin)]??={};meta[String(o.pams_pin)]??={};markers[String(o.pams_pin)][String(o.marker_id)]=Number(o.score);meta[String(o.pams_pin)][String(o.marker_id)]={status:"available",provider_kind:"trusted_observation",source:"Watchdog staging canonical score observation",model_version:o.model_version,observed_at:o.observed_at}}
  for(const r of records||[]){const pin=String(r.pams_pin);for(const id of requested){if(markers[pin]?.[id]!=null)continue;if(id==="watchdog.tax_to_assessment_rate"){const assessed=numeric(r.assessed_value),tax=numeric(r.last_year_tax);if(assessed&&tax!=null){markers[pin][id]=Number((tax/assessed*100).toFixed(6));meta[pin][id]={status:"available",provider_kind:"derived",source:"Watchdog deterministic property formula",observed_at:r.last_seen||now};continue}}meta[pin][id]={status:"provider_missing",provider_kind:"none",source:"No staging fixture provider for this marker",checked_at:now}}
  }
  const summary={available:0,provider_missing:0};for(const mm of Object.values(meta))for(const x of Object.values(mm) as any[]){if(x?.status==="available")summary.available++;else summary.provider_missing++}
  return out(req,200,{records:records||[],markers,meta,provider_summary:summary,plan,source:"Watchdog staging governed fixture provider v1",provider_versions:{fixture:"staging-public-record-v1"},checked_at:now});
});
