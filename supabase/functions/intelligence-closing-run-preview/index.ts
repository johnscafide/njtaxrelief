import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-intelligence-closing-adapter-preview-v1";
const MODEL_KEY="closing_review";
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
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!publishable||!secret)return out(req,503,{error:"Intelligence service configuration incomplete"});
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:au}=await uc.auth.getUser(),user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const scopeType=clean(body?.scope_type||"custom",40);let pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:unknown)=>clean(x,100)).filter(Boolean))].slice(0,100),scopeValue=safeObj(body?.scope_value,12000);

  const [{data:ent},{data:profile},{data:model,error:me}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),
    admin.from("intelligence_models").select("model_key,label,minimum_plan,version,status,calibration_state,signal_config").eq("model_key",MODEL_KEY).order("version",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(me||!model)return out(req,404,{error:"Closing Review Intelligence model not found"});if(!["preview","live"].includes(String(model.status)))return out(req,409,{error:"Closing Review model is not runnable"});
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<(RANK[String(model.minimum_plan)]??99))return out(req,403,{error:`${model.minimum_plan} plan required`,minimum_plan:model.minimum_plan});
  if(scopeType==="farm"){
    const {data:rows,error}=await admin.from("agent_farm_properties").select("pams_pin").eq("user_id",user.id).eq("relationship","farm").not("pams_pin","is",null).limit(250);if(error)return out(req,503,{error:"Farm scope could not be resolved"});pins=[...new Set((rows||[]).map((x:any)=>clean(x.pams_pin,100)).filter(Boolean))].slice(0,100);scopeValue={...scopeValue,source:"agent_farm_properties",resolved_count:pins.length};
  }else if(!["property","custom"].includes(scopeType))return out(req,400,{error:"Closing preview currently supports property, custom, or farm scopes"});
  if(!pins.length)return out(req,409,{error:"The requested Closing Review scope resolved to no governed properties"});

  const cfg=model.signal_config&&typeof model.signal_config==="object"?model.signal_config:{},featureKeys=[...new Set((Array.isArray(cfg.signals)?cfg.signals:[]).map((s:any)=>clean(s?.id,140)).filter(Boolean))];if(!featureKeys.length)return out(req,409,{error:"Closing Review has no feature contract"});
  const {data:defRows,error:de}=await admin.from("intelligence_feature_versions").select("feature_key,version,source_key,transform_type,config,status").in("feature_key",featureKeys).in("status",["preview","live","draft"]).order("version",{ascending:false});if(de)return out(req,503,{error:"Feature registry unavailable"});
  const defs=new Map<string,any>();for(const d of defRows||[])if(!defs.has(String(d.feature_key)))defs.set(String(d.feature_key),d);const sourceKeys=[...new Set(featureKeys.map(k=>clean(defs.get(k)?.source_key,140)).filter(Boolean))];if(sourceKeys.length!==featureKeys.length)return out(req,409,{error:"Closing Review feature registry is incomplete"});

  const dr=await fetch(`${url}/functions/v1/workbench-derived`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({pams_pins:pins,marker_ids:sourceKeys})}),derived=await dr.json().catch(()=>({}));if(!dr.ok)return out(req,dr.status,{error:"Governed Closing Review derivation failed",detail:clean(derived?.error,300)||null});
  const records=Array.isArray(derived?.records)?derived.records:[],recordMap=new Map(records.map((r:any)=>[String(r.pams_pin),r])),candidates:any[]=[];
  for(const pin of pins){const row=recordMap.get(pin),raw:Record<string,unknown>={},source_meta:Record<string,unknown>={};for(const sk of sourceKeys){const value=derived?.markers?.[pin]?.[sk],m=derived?.meta?.[pin]?.[sk]||{};if(value!==undefined&&value!==null)raw[sk]=value;source_meta[sk]={source_key:sk,status:m?.status||"unknown",source_url:m?.source_url||null,observed_at:m?.observed_at||m?.checked_at||null,provider_kind:m?.provider_kind||"derived_governed",engine_version:m?.engine_version||derived?.engine_version||null,formula:m?.formula||null,dependencies:Array.isArray(m?.dependencies)?m.dependencies:[],explanation:m?.explanation||null}}
    candidates.push({pams_pin:pin,address:row?.address||null,raw,cohorts:{},source_meta});
  }

  const nr=await fetch(`${url}/functions/v1/intelligence-normalize-preview`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({candidates,feature_keys:featureKeys})}),normalized=await nr.json().catch(()=>({}));if(!nr.ok)return out(req,nr.status,{error:"Closing Review normalization failed",detail:clean(normalized?.error,300)||null});const normalizedCandidates=Array.isArray(normalized?.candidates)?normalized.candidates:[];if(!normalizedCandidates.length)return out(req,409,{error:"Closing Review normalizer produced no candidates"});

  const sourceManifest={scope_type:scopeType,scope_value:scopeValue,derived_engine_version:derived?.engine_version||null,derived_marker_ids:sourceKeys,pams_pin_hash:await hash(pins.slice().sort()),candidate_count:normalizedCandidates.length};
  const normalizationManifest=safeObj(normalized?.normalization_manifest,50000),cohortManifest=safeObj(normalized?.cohort_manifest,30000),batchPayload={model_key:model.model_key,model_version:model.version,source_kind:"workbench_derived",source_manifest:sourceManifest,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,candidates:normalizedCandidates},batchHash=await hash(batchPayload);
  const {data:batch,error:bi}=await admin.from("intelligence_evidence_batches").insert({user_id:user.id,model_key:model.model_key,model_version:model.version,source_kind:"workbench_derived",source_manifest:sourceManifest,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,candidates:normalizedCandidates,facts_hash:batchHash,candidate_count:normalizedCandidates.length}).select("id").single();if(bi||!batch?.id)return out(req,503,{error:"Could not seal trusted Closing Review evidence batch"});
  const sr=await fetch(`${url}/functions/v1/intelligence-score-preview`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({evidence_batch_id:batch.id,limit:body?.limit||50,requested_prompt:clean(body?.requested_prompt,1200)||null})}),scored=await sr.json().catch(()=>({}));if(!sr.ok)return out(req,sr.status,{error:"Closing Review scoring failed",detail:clean(scored?.error,300)||null,evidence_batch_id:batch.id});
  return out(req,200,{...scored,pipeline_engine:ENGINE,scope:{type:scopeType,value:scopeValue},derived:{engine_version:derived?.engine_version||null,marker_ids:sourceKeys},normalization:{engine_version:normalized?.engine_version||null,feature_count:normalized?.feature_count||0}});
});
