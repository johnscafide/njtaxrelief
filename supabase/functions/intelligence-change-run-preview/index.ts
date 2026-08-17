import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-intelligence-change-adapter-preview-v1";
const MODEL_KEY="property_change_priority";
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=400)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const env=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(l)||""};
function canon(v:unknown):unknown{if(Array.isArray(v))return v.map(canon);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canon(x)]));return v}
async function hash(v:unknown){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canon(v))));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function safeObj(v:unknown,max=30000){if(!v||typeof v!=="object"||Array.isArray(v))return{};try{return JSON.stringify(v).length<=max?v as Record<string,unknown>:{} }catch{return{}}}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!publishable||!secret)return out(req,503,{error:"Intelligence service configuration incomplete"});
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:au}=await uc.auth.getUser();const user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const scopeType=clean(body?.scope_type||"custom",40);let pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:unknown)=>clean(x,100)).filter(Boolean))].slice(0,100),scopeValue=safeObj(body?.scope_value,12000);

  const [{data:ent},{data:profile},{data:model,error:me}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),
    admin.from("intelligence_models").select("model_key,label,minimum_plan,version,status,calibration_state,signal_config").eq("model_key",MODEL_KEY).maybeSingle()
  ]);
  if(me||!model)return out(req,404,{error:"Property Change Intelligence model not found"});
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<(RANK[String(model.minimum_plan)]??99))return out(req,403,{error:`${model.minimum_plan} plan required`,minimum_plan:model.minimum_plan});
  if(scopeType==="farm"){
    const {data:rows,error}=await admin.from("agent_farm_properties").select("pams_pin").eq("user_id",user.id).eq("relationship","farm").not("pams_pin","is",null).limit(250);if(error)return out(req,503,{error:"Farm scope could not be resolved"});pins=[...new Set((rows||[]).map((x:any)=>clean(x.pams_pin,100)).filter(Boolean))];scopeValue={...scopeValue,source:"agent_farm_properties",resolved_count:pins.length};
  }else if(!["property","custom"].includes(scopeType))return out(req,400,{error:"Change preview currently supports property, custom, or farm scopes"});
  if(!pins.length)return out(req,409,{error:"The requested change scope resolved to no governed properties"});

  const cfg=model.signal_config||{},windowDays=Math.max(1,Math.min(Number(cfg.event_window_days||90),365)),densityDays=Math.max(1,Math.min(Number(cfg.density_window_days||30),90)),featureKeys=[...new Set((Array.isArray(cfg.signals)?cfg.signals:[]).map((s:any)=>clean(s?.id,140)).filter(Boolean))];
  const watchdogKeys=[...new Set(featureKeys.filter(k=>k.startsWith("watchdog.")))];
  const hydrate=await fetch(`${url}/functions/v1/workbench-hydrate`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({pams_pins:pins,marker_ids:watchdogKeys})});
  const hydrated=await hydrate.json().catch(()=>({}));if(!hydrate.ok)return out(req,hydrate.status,{error:"Governed property hydration failed",detail:clean(hydrated?.error,300)||null});
  const records=Array.isArray(hydrated?.records)?hydrated.records:[],recordMap=new Map(records.map((r:any)=>[String(r.pams_pin),r]));

  const since=new Date(Date.now()-windowDays*86400000).toISOString(),densitySince=Date.now()-densityDays*86400000;
  const {data:events,error:ee}=await admin.from("property_update_events").select("id,pams_pin,event_key,event_type,severity,title,summary,payload,occurred_at,marker_id,old_value,new_value,delta_numeric,source_url").eq("user_id",user.id).in("pams_pin",pins).gte("occurred_at",since).order("occurred_at",{ascending:false}).limit(5000);
  if(ee)return out(req,503,{error:"Property change events could not be resolved"});
  const groups=new Map<string,any[]>();for(const e of events||[]){const pin=String(e.pams_pin||"");if(!pin)continue;if(!groups.has(pin))groups.set(pin,[]);groups.get(pin)!.push(e)}
  const candidates:any[]=[];let eventCount=0;
  for(const pin of pins){const group=groups.get(pin)||[];if(!group.length)continue;eventCount+=group.length;const anchor=group[0],recentCount=group.filter(e=>new Date(String(e.occurred_at)).getTime()>=densitySince).length,row=recordMap.get(pin),raw:Record<string,unknown>={"event.materiality":anchor.severity,"event.recency":anchor.occurred_at,"event.type_priority":anchor.event_type,"event.change_count_30d":recentCount},source_meta:Record<string,unknown>={};
    const explanation=[clean(anchor.title,220),clean(anchor.summary,500)].filter(Boolean).join(" · ");for(const k of ["event.materiality","event.recency","event.type_priority","event.change_count_30d"])source_meta[k]={source_key:k,source_url:clean(anchor.source_url,600)||null,observed_at:anchor.occurred_at,explanation};
    for(const k of watchdogKeys){const v=hydrated?.markers?.[pin]?.[k],m=hydrated?.meta?.[pin]?.[k]||{};if(v!==undefined&&v!==null)raw[k]=v;source_meta[k]={source_key:k,source_url:m?.source_url||null,observed_at:m?.observed_at||m?.checked_at||hydrated?.checked_at||null,explanation:m?.source||m?.explanation||null}}
    candidates.push({pams_pin:pin,address:row?.address||null,raw,cohorts:{},source_meta,event_context:{anchor_event_id:anchor.id,anchor_event_key:anchor.event_key,anchor_event_type:anchor.event_type,anchor_severity:anchor.severity,anchor_occurred_at:anchor.occurred_at,recent_event_count:recentCount,window_event_count:group.length,marker_id:anchor.marker_id||null,old_value:anchor.old_value||null,new_value:anchor.new_value||null,delta_numeric:anchor.delta_numeric??null}})
  }
  if(!candidates.length)return out(req,200,{ok:true,model:{key:model.model_key,version:model.version,status:model.status,calibration_state:model.calibration_state},candidate_count:0,finding_count:0,findings:[],warning:"No governed property change events were observed in the current review window."});

  const nr=await fetch(`${url}/functions/v1/intelligence-normalize-preview`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({candidates,feature_keys:featureKeys})});const normalized=await nr.json().catch(()=>({}));if(!nr.ok)return out(req,nr.status,{error:"Change-event normalization failed",detail:clean(normalized?.error,300)||null});
  const normalizedCandidates=Array.isArray(normalized?.candidates)?normalized.candidates:[];
  const sourceManifest={scope_type:scopeType,scope_value:scopeValue,event_window_days:windowDays,density_window_days:densityDays,event_count:eventCount,hydration_source:hydrated?.source||"workbench-hydrate",provider_versions:hydrated?.provider_versions||{},pams_pin_hash:await hash(pins.slice().sort()),candidate_count:normalizedCandidates.length};
  const normalizationManifest=safeObj(normalized?.normalization_manifest,50000),cohortManifest=safeObj(normalized?.cohort_manifest,30000),batchPayload={model_key:model.model_key,model_version:model.version,source_kind:"property_update_events",source_manifest:sourceManifest,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,candidates:normalizedCandidates},batchHash=await hash(batchPayload);
  const {data:batch,error:bi}=await admin.from("intelligence_evidence_batches").insert({user_id:user.id,model_key:model.model_key,model_version:model.version,source_kind:"property_update_events",source_manifest:sourceManifest,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,candidates:normalizedCandidates,facts_hash:batchHash,candidate_count:normalizedCandidates.length}).select("id").single();if(bi||!batch?.id)return out(req,503,{error:"Could not seal trusted change evidence batch"});
  const sr=await fetch(`${url}/functions/v1/intelligence-score-preview`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({evidence_batch_id:batch.id,limit:body?.limit||50,requested_prompt:clean(body?.requested_prompt,1200)||null})});const scored=await sr.json().catch(()=>({}));if(!sr.ok)return out(req,sr.status,{error:"Property Change Intelligence scoring failed",detail:clean(scored?.error,300)||null,evidence_batch_id:batch.id});
  return out(req,200,{...scored,pipeline_engine:ENGINE,scope:{type:scopeType,value:scopeValue},change_context:{event_window_days:windowDays,density_window_days:densityDays,event_count:eventCount,properties_with_events:candidates.length},normalization:{engine_version:normalized?.engine_version||null,feature_count:normalized?.feature_count||0}});
});
