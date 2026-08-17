import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-intelligence-orchestrator-preview-v2";
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const SCOPES=new Set(["property","custom"]);
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=240)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const num=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const env=(jsonKey:string,legacy:string)=>{const raw=Deno.env.get(jsonKey)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacy)||""};
function canon(v:unknown):unknown{if(Array.isArray(v))return v.map(canon);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canon(x)]));return v}
async function hash(v:unknown){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canon(v))));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function safeObj(v:unknown,max=30000){if(!v||typeof v!=="object"||Array.isArray(v))return{};try{return JSON.stringify(v).length<=max?v as Record<string,unknown>:{} }catch{return{}}}
function rawFromProperty(sourceKey:string,row:any){if(sourceKey==="watchdog.tax_to_assessment_rate"){const a=num(row?.assessed_value),t=num(row?.last_year_tax);return a&&t!=null?t/a*100:null}return null}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!publishable||!secret)return out(req,503,{error:"Intelligence service configuration incomplete"});
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:au}=await uc.auth.getUser();const user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const modelKey=clean(body?.model_key,100),scopeType=clean(body?.scope_type||"custom",40),pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:unknown)=>clean(x,100)).filter(Boolean))].slice(0,100);
  if(!modelKey)return out(req,400,{error:"model_key is required"});if(!SCOPES.has(scopeType))return out(req,400,{error:"Preview orchestrator currently supports property/custom scopes"});if(!pins.length)return out(req,400,{error:"pams_pins are required"});

  const [{data:ent},{data:profile},{data:model,error:me}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),
    admin.from("intelligence_models").select("model_key,label,minimum_plan,version,status,calibration_state,signal_config").eq("model_key",modelKey).maybeSingle()
  ]);
  if(me||!model)return out(req,404,{error:"Intelligence model not found"});if(!["preview","live"].includes(String(model.status)))return out(req,409,{error:"Intelligence model is not runnable"});
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<(RANK[String(model.minimum_plan)]??99))return out(req,403,{error:`${model.minimum_plan} plan required`,minimum_plan:model.minimum_plan});
  const cfg=model.signal_config&&typeof model.signal_config==="object"?model.signal_config:{},featureKeys=[...new Set((Array.isArray(cfg.signals)?cfg.signals:[]).map((s:any)=>clean(s?.id,140)).filter(Boolean))];if(!featureKeys.length)return out(req,409,{error:"Model has no feature contract"});

  const {data:defRows,error:de}=await admin.from("intelligence_feature_versions").select("feature_key,version,source_key,transform_type,cohort_key,cohort_version,config,status").in("feature_key",featureKeys).in("status",["preview","live","draft"]).order("version",{ascending:false});
  if(de)return out(req,503,{error:"Feature registry unavailable"});const defs=new Map<string,any>();for(const d of defRows||[])if(!defs.has(String(d.feature_key)))defs.set(String(d.feature_key),d);
  const sourceKeys=[...new Set([
    ...featureKeys.map(k=>defs.get(k)?.source_key),
    ...[...defs.values()].map((d:any)=>d?.config?.guard_source_key)
  ].filter(Boolean).map((x:unknown)=>clean(x,140)))];
  if(sourceKeys.some(k=>k.startsWith("event.")))return out(req,409,{error:"This preview source adapter does not yet support change-event models"});

  const hydrate=await fetch(`${url}/functions/v1/workbench-hydrate`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({pams_pins:pins,marker_ids:sourceKeys})});
  const hydrated=await hydrate.json().catch(()=>({}));if(!hydrate.ok)return out(req,hydrate.status,{error:"Governed Workbench hydration failed",detail:clean(hydrated?.error,300)||null});
  const records=Array.isArray(hydrated?.records)?hydrated.records:[],recordMap=new Map(records.map((r:any)=>[String(r.pams_pin),r]));
  if(!records.length)return out(req,409,{error:"No governed property records were resolved"});

  const cohortDefs=new Map<string,any>();const cohortKeys=[...new Set([...defs.values()].map((d:any)=>d.cohort_key).filter(Boolean))];if(cohortKeys.length){const {data:rows,error:ce}=await admin.from("intelligence_cohort_versions").select("cohort_key,version,dimensions,minimum_sample_size,fallback_chain,status").in("cohort_key",cohortKeys);if(ce)return out(req,503,{error:"Cohort registry unavailable"});for(const c of rows||[])cohortDefs.set(`${c.cohort_key}:${c.version}`,c)}
  const cohortCache=new Map<string,{values:number[];resolution:any}>();
  async function resolveCohort(featureKey:string,def:any,row:any){
    if(!def?.cohort_key)return{values:[],resolution:null};const cd=cohortDefs.get(`${def.cohort_key}:${def.cohort_version}`);if(!cd)return{values:[],resolution:{status:"definition_missing"}};
    const fallbacks=Array.isArray(cd.fallback_chain)?cd.fallback_chain:[],primary=String(def.cohort_key),scopes=[primary,...fallbacks.map((x:unknown)=>clean(x,80))],minimum=Number(cd.minimum_sample_size||12);
    for(const scope of scopes){
      const key=[featureKey,scope,row?.town||"",row?.county||"",row?.prop_class||""].join("|");const old=cohortCache.get(key);if(old&&old.values.length>=minimum)return old;
      let q=admin.from("property_lookups").select("pams_pin,town,county,prop_class,assessed_value,last_year_tax").limit(5000);
      if(scope==="municipality_property_class")q=q.eq("town",row.town).eq("prop_class",row.prop_class);else if(scope==="municipality")q=q.eq("town",row.town);else if(scope==="county_property_class")q=q.eq("county",row.county).eq("prop_class",row.prop_class);else if(scope==="county")q=q.eq("county",row.county);else continue;
      const {data:peers,error:qe}=await q;if(qe)continue;const pairs=(peers||[]).map((p:any)=>({pams_pin:String(p.pams_pin),value:rawFromProperty(String(def.source_key),p)})).filter((p:any)=>num(p.value)!==null).map((p:any)=>({pams_pin:p.pams_pin,value:Number(p.value)}));const values=pairs.map((p:any)=>p.value),resolution={status:values.length>=minimum?"resolved":"insufficient",requested_cohort:def.cohort_key,resolved_scope:scope,sample_size:values.length,minimum_sample_size:minimum,population_hash:await hash(pairs.sort((a:any,b:any)=>a.pams_pin.localeCompare(b.pams_pin)))};const result={values,resolution};cohortCache.set(key,result);if(values.length>=minimum)return result;
    }
    return{values:[],resolution:{status:"insufficient",requested_cohort:def.cohort_key,minimum_sample_size:minimum}};
  }

  const normalizeCandidates:any[]=[],resolvedCohorts:Record<string,unknown>={};
  for(const pin of pins){
    const row=recordMap.get(pin);if(!row)continue;const raw:Record<string,unknown>={},source_meta:Record<string,unknown>={},cohorts:Record<string,unknown[]>={};
    for(const sk of sourceKeys){const value=hydrated?.markers?.[pin]?.[sk],m=hydrated?.meta?.[pin]?.[sk]||{};if(value!==undefined&&value!==null)raw[sk]=value;source_meta[sk]={source_key:sk,source_url:m?.source_url||null,observed_at:m?.observed_at||m?.checked_at||hydrated?.checked_at||null,explanation:m?.source||m?.explanation||null}}
    for(const fk of featureKeys){const def=defs.get(fk);if(!def)continue;if(def.cohort_key){const cr=await resolveCohort(fk,def,row);cohorts[fk]=cr.values;if(cr.resolution){const rk=[def.cohort_key,row?.town||"",row?.county||"",row?.prop_class||""].join("|");resolvedCohorts[rk]=cr.resolution}}}
    normalizeCandidates.push({pams_pin:pin,address:row?.address||null,raw,cohorts,source_meta});
  }
  if(!normalizeCandidates.length)return out(req,409,{error:"No candidates remained after governed hydration"});

  const nr=await fetch(`${url}/functions/v1/intelligence-normalize-preview`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({candidates:normalizeCandidates,feature_keys:featureKeys})});const normalized=await nr.json().catch(()=>({}));if(!nr.ok)return out(req,nr.status,{error:"Intelligence normalization failed",detail:clean(normalized?.error,300)||null});
  const normalizedCandidates=Array.isArray(normalized?.candidates)?normalized.candidates:[];if(!normalizedCandidates.length)return out(req,409,{error:"Normalizer produced no candidates"});

  const sourceManifest={scope_type:scopeType,scope_value:safeObj(body?.scope_value,12000),hydration_source:hydrated?.source||"workbench-hydrate",provider_versions:hydrated?.provider_versions||{},provider_summary:hydrated?.provider_summary||{},hydration_checked_at:hydrated?.checked_at||null,pams_pin_hash:await hash(pins.slice().sort()),candidate_count:normalizedCandidates.length};
  const normalizationManifest=safeObj(normalized?.normalization_manifest,50000),cohortManifest={...safeObj(normalized?.cohort_manifest,30000),resolved:resolvedCohorts};
  const batchPayload={model_key:model.model_key,model_version:model.version,source_kind:"workbench_hydrate",source_manifest:sourceManifest,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,candidates:normalizedCandidates},batchHash=await hash(batchPayload);
  const {data:batch,error:bi}=await admin.from("intelligence_evidence_batches").insert({user_id:user.id,model_key:model.model_key,model_version:model.version,source_kind:"workbench_hydrate",source_manifest:sourceManifest,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,candidates:normalizedCandidates,facts_hash:batchHash,candidate_count:normalizedCandidates.length}).select("id").single();if(bi||!batch?.id)return out(req,503,{error:"Could not seal trusted evidence batch"});

  const sr=await fetch(`${url}/functions/v1/intelligence-score-preview`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify({evidence_batch_id:batch.id,limit:body?.limit||50,requested_prompt:clean(body?.requested_prompt,1200)||null})});const scored=await sr.json().catch(()=>({}));if(!sr.ok)return out(req,sr.status,{error:"Trusted Intelligence scoring failed",detail:clean(scored?.error,300)||null,evidence_batch_id:batch.id});
  return out(req,200,{...scored,pipeline_engine:ENGINE,hydration:{source:hydrated?.source||null,provider_summary:hydrated?.provider_summary||{},checked_at:hydrated?.checked_at||null},normalization:{engine_version:normalized?.engine_version||null,feature_count:normalized?.feature_count||0},cohorts:{resolved_count:Object.keys(resolvedCohorts).length}});
});
