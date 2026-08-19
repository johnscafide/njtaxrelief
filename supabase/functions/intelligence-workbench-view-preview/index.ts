import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-intelligence-workbench-view-preview-v1";
const MAX_SOURCE_ROWS=10000;
const MAX_PREVIEW_CANDIDATES=100;
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const STABLE_FILTERS=new Set(["town","county","assessedMin","assessedMax","taxMin","valueMin","wdMin","chapterMin"]);
const SESSION_FILTERS=new Set(["yearMin","flood"]);
const SCORE_FILTER_MARKERS=["watchdog.watchdog_score","watchdog.score","watchdog.chapter123_annual_overpayment"];
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=240)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const env=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(l)||""};
function canon(v:unknown):unknown{if(Array.isArray(v))return v.map(canon);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canon(x)]));return v}
async function hash(v:unknown){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canon(v))));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function filterObject(v:unknown){if(!v||typeof v!=="object"||Array.isArray(v))return{} as Record<string,unknown>;return v as Record<string,unknown>}
function numeric(v:unknown){const n=Number(v);return Number.isFinite(n)?n:null}
function active(v:unknown){return v!==null&&v!==undefined&&v!==""&&v!==false&&Number(v)!==0}
function runnerFor(modelKey:string){if(modelKey==="property_change_priority")return"intelligence-change-run-preview";if(modelKey==="closing_review")return"intelligence-closing-run-preview";return"intelligence-run-preview"}
function passFilters(row:any,f:Record<string,unknown>){
  if(f.town&&String(row.town||"").toLowerCase().indexOf(String(f.town).toLowerCase())<0)return false;
  if(f.county&&String(row.county||"").toLowerCase().indexOf(String(f.county).toLowerCase())<0)return false;
  if(active(f.assessedMin)&&Number(row.assessed||0)<Number(f.assessedMin))return false;
  if(active(f.assessedMax)&&Number(row.assessed||0)>Number(f.assessedMax))return false;
  if(active(f.taxMin)&&Number(row.last_year_tax||0)<Number(f.taxMin))return false;
  if(active(f.valueMin)&&Number(row.watchdog_value||0)<Number(f.valueMin))return false;
  if(active(f.wdMin)&&Number(row.__markers?.["watchdog.watchdog_score"]??row.__markers?.["watchdog.score"]??0)<Number(f.wdMin))return false;
  if(active(f.chapterMin)&&Number(row.__markers?.["watchdog.chapter123_annual_overpayment"]||0)<Number(f.chapterMin))return false;
  return true;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!publishable||!secret)return out(req,503,{error:"Intelligence service configuration incomplete"});
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:au}=await uc.auth.getUser();const user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const modelKey=clean(body?.model_key,100),scopeId=clean(body?.scope_id||body?.workbench_view_id,80);if(!modelKey||!scopeId)return out(req,400,{error:"model_key and scope_id are required"});

  const [{data:ent},{data:profile},{data:view,error:ve}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),
    admin.from("data_workbench_views").select("id,name,source_type,source_id,filters,sort_config,page_size,marker_ids").eq("id",scopeId).eq("user_id",user.id).maybeSingle()
  ]);
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return out(req,403,{error:"Pro+ plan required for saved Workbench Intelligence scopes",minimum_plan:"pro_plus"});
  if(ve||!view)return out(req,404,{error:"Workbench view not found"});
  const filters=filterObject(view.filters),keys=Object.keys(filters).filter(k=>filters[k]!==null&&filters[k]!==undefined&&filters[k]!=="");
  const sessionDependent=keys.filter(k=>SESSION_FILTERS.has(k));if(sessionDependent.length)return out(req,409,{error:"This saved Workbench view contains filters whose current browser semantics depend on session-hydrated data. Watchdog will not guess a different population.",unsupported_filters:sessionDependent,filter_semantics:"data-workbench-pass-filters-v1"});
  const unknown=keys.filter(k=>!STABLE_FILTERS.has(k));if(unknown.length)return out(req,409,{error:"This saved Workbench view contains filters not yet covered by the deterministic server adapter.",unsupported_filters:unknown,filter_semantics:"data-workbench-pass-filters-v1"});

  if(String(view.source_type)!=="saved"){
    if(keys.length)return out(req,409,{error:`Filtered Workbench source '${clean(view.source_type,60)}' is not yet supported by the deterministic saved-view adapter.`,source_type:view.source_type});
    const downstream=runnerFor(modelKey);let requestBody:any;
    if(downstream==="intelligence-run-preview")requestBody={model_key:modelKey,scope_type:"workbench_view",scope_id:view.id,scope_value:{source:"intelligence_workbench_view_adapter"},limit:body?.limit||50};
    else if(String(view.source_type)==="farm")requestBody={scope_type:"farm",scope_value:{source:"intelligence_workbench_view_adapter",workbench_view_id:view.id,workbench_view_name:view.name},limit:body?.limit||50};
    else return out(req,409,{error:`Model '${modelKey}' cannot yet resolve unfiltered Workbench source '${clean(view.source_type,60)}' without an exact property population.`,source_type:view.source_type});
    const rr=await fetch(`${url}/functions/v1/${downstream}`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify(requestBody)});
    const payload=await rr.json().catch(()=>({}));return out(req,rr.status,{...payload,view_adapter_engine:ENGINE});
  }

  const sourceFields="pams_pin,address,town,county,zip,block,lot,assessed,last_year_tax,effective_rate,watchdog_value,kind,has_appeal_case";
  const {data:rows,count,error:se}=await admin.from("saved_properties").select(sourceFields,{count:"exact"}).eq("user_id",user.id).order("address").range(0,MAX_SOURCE_ROWS-1);
  if(se)return out(req,503,{error:"Saved-property source could not be resolved"});if(Number(count||0)>MAX_SOURCE_ROWS)return out(req,409,{error:"Saved Workbench source exceeds the current deterministic preview scan limit. No partial population was analyzed.",source_count:count,scan_limit:MAX_SOURCE_ROWS});
  const sourceRows=(rows||[]).map((r:any)=>({...r,__markers:{}})),pins=[...new Set(sourceRows.map((r:any)=>clean(r.pams_pin,100)).filter(Boolean))];

  if(pins.length){for(let i=0;i<pins.length;i+=400){const {data:obs,error:oe}=await admin.from("score_observations").select("pams_pin,marker_id,score,observed_at").in("pams_pin",pins.slice(i,i+400)).in("marker_id",SCORE_FILTER_MARKERS).order("observed_at",{ascending:false});if(oe)return out(req,503,{error:"Saved-view marker filters could not be resolved"});const seen=new Set<string>();for(const o of obs||[]){const k=`${o.pams_pin}|${o.marker_id}`;if(seen.has(k))continue;seen.add(k);const row=sourceRows.find((x:any)=>String(x.pams_pin)===String(o.pams_pin));if(row)row.__markers[String(o.marker_id)]=numeric(o.score)}}}
  const filtered=sourceRows.filter((r:any)=>passFilters(r,filters)),filteredPins=[...new Set(filtered.map((r:any)=>clean(r.pams_pin,100)).filter(Boolean))];
  const filterManifest={semantics_version:"data-workbench-pass-filters-v1",source_type:"saved",source_count:sourceRows.length,filtered_count:filteredPins.length,filters,filters_hash:await hash(filters),stable_filters:keys};
  if(!filteredPins.length)return out(req,200,{ok:true,model_key:modelKey,findings:[],finding_count:0,candidate_count:0,resolved_scope:{type:"workbench_view",id:view.id,name:view.name,source_type:view.source_type,filters},filter_manifest:filterManifest,warning:"No saved properties match this Workbench view."});
  if(filteredPins.length>MAX_PREVIEW_CANDIDATES)return out(req,409,{error:"The exact filtered Workbench population exceeds the current deterministic preview candidate limit. Watchdog refused to truncate the population.",filtered_count:filteredPins.length,preview_limit:MAX_PREVIEW_CANDIDATES,filter_manifest:filterManifest});

  const downstream=runnerFor(modelKey),scopeValue={source:"workbench_view_filter_adapter",requested_scope_type:"workbench_view",id:view.id,name:view.name,source_type:view.source_type,source_id:view.source_id||null,filters,sort_config:view.sort_config||{},page_size:view.page_size,filter_manifest:filterManifest};
  const requestBody=downstream==="intelligence-run-preview"?{model_key:modelKey,scope_type:"custom",scope_value:scopeValue,pams_pins:filteredPins,limit:body?.limit||50,requested_prompt:clean(body?.requested_prompt,1200)||null}:{scope_type:"custom",scope_value:scopeValue,pams_pins:filteredPins,limit:body?.limit||50,requested_prompt:clean(body?.requested_prompt,1200)||null};
  const rr=await fetch(`${url}/functions/v1/${downstream}`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify(requestBody)}),payload=await rr.json().catch(()=>({}));
  return out(req,rr.status,{...payload,view_adapter_engine:ENGINE,resolved_scope:{type:"workbench_view",id:view.id,name:view.name,source_type:view.source_type,filters,filtered_count:filteredPins.length},filter_manifest:filterManifest});
});
