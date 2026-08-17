import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-intelligence-preview-v3";
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const SCOPES=new Set(["property","saved","farm","workbench_view","municipality","county","custom"]);
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=240)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const num=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
const clamp=(v:number,a=0,b=100)=>Math.max(a,Math.min(b,v));
const round=(v:number,p=2)=>Math.round(v*10**p)/10**p;
const env=(jsonKey:string,legacy:string)=>{const raw=Deno.env.get(jsonKey)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacy)||""};
function canon(v:unknown):unknown{if(Array.isArray(v))return v.map(canon);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canon(x)]));return v}
async function hash(v:unknown){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canon(v))));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function obj(v:unknown,max=50000){if(!v||typeof v!=="object"||Array.isArray(v))return{};try{return JSON.stringify(v).length<=max?v as Record<string,unknown>:{} }catch{return{}}}
function available(f:any){return !!f&&(!f.status||f.status==="available")&&num(f.score)!==null}
function prov(f:any){return{normalization:f?.normalization&&typeof f.normalization==="object"?{feature_version:num(f.normalization.feature_version),transform_type:clean(f.normalization.transform_type,100)||null,direction:clean(f.normalization.direction,80)||null,detail:obj(f.normalization.detail,4000)}:null,cohort:f?.cohort&&typeof f.cohort==="object"?obj(f.cohort,6000):null}}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!publishable||!secret)return out(req,503,{error:"Intelligence service configuration incomplete"});
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:au}=await uc.auth.getUser();const user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  if(Array.isArray(body?.candidates))return out(req,400,{error:"Direct candidate scoring is disabled. A trusted evidence_batch_id is required."});
  const batchId=clean(body?.evidence_batch_id,80);if(!batchId)return out(req,400,{error:"evidence_batch_id is required"});

  const {data:batch,error:be}=await admin.from("intelligence_evidence_batches").select("id,user_id,model_key,model_version,source_kind,source_manifest,normalization_manifest,cohort_manifest,candidates,facts_hash,candidate_count,expires_at,consumed_at").eq("id",batchId).eq("user_id",user.id).maybeSingle();
  if(be||!batch)return out(req,404,{error:"Trusted evidence batch not found"});
  if(batch.consumed_at)return out(req,409,{error:"Trusted evidence batch has already been consumed"});
  if(new Date(String(batch.expires_at)).getTime()<=Date.now())return out(req,409,{error:"Trusted evidence batch expired"});
  const candidates=(Array.isArray(batch.candidates)?batch.candidates:[]).slice(0,250);
  if(!candidates.length||Number(batch.candidate_count||0)!==candidates.length)return out(req,409,{error:"Trusted evidence batch candidate manifest is invalid"});
  const batchPayload={model_key:batch.model_key,model_version:batch.model_version,source_kind:batch.source_kind,source_manifest:batch.source_manifest||{},normalization_manifest:batch.normalization_manifest||{},cohort_manifest:batch.cohort_manifest||{},candidates};
  if(await hash(batchPayload)!==String(batch.facts_hash||""))return out(req,409,{error:"Trusted evidence batch failed integrity verification"});

  const [{data:ent},{data:profile},{data:model,error:me}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),
    admin.from("intelligence_model_versions").select("model_key,label,objective,minimum_plan,version,status,calibration_state,signal_config").eq("model_key",batch.model_key).eq("version",batch.model_version).maybeSingle()
  ]);
  if(me||!model)return out(req,404,{error:"Intelligence model version not found"});
  if(!["preview","live"].includes(String(model.status)))return out(req,409,{error:"Intelligence model version is not runnable"});
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");
  if((RANK[plan]??0)<(RANK[String(model.minimum_plan)]??99))return out(req,403,{error:`${model.minimum_plan} plan required`,minimum_plan:model.minimum_plan});

  const cfg=model.signal_config&&typeof model.signal_config==="object"?model.signal_config:{};
  const signals=(Array.isArray(cfg.signals)?cfg.signals:[]).map((s:any)=>({id:clean(s?.id,140),role:clean(s?.role||"score",30),weight:Number(s?.weight??0)})).filter((s:any)=>s.id);
  const scoredDefs=signals.filter((s:any)=>s.role!=="confidence"&&s.weight>0),confidenceDefs=signals.filter((s:any)=>s.role==="confidence");
  if(!scoredDefs.length)return out(req,409,{error:"Model has no deterministic score configuration"});
  const totalWeight=scoredDefs.reduce((a:number,s:any)=>a+s.weight,0),minimumCoverage=clamp(Number(cfg.minimum_evidence_coverage??0));
  const actions=Array.isArray(cfg.recommended_actions)?cfg.recommended_actions.map((x:unknown)=>clean(x,80)).filter(Boolean):["review_evidence"];
  const sourceManifest=obj(batch.source_manifest),normalizationManifest=obj(batch.normalization_manifest),cohortManifest=obj(batch.cohort_manifest);
  const requestedScope=clean((sourceManifest as any).scope_type||body?.scope_type||"custom",40),scopeType=SCOPES.has(requestedScope)?requestedScope:"custom",scopeValue=obj((sourceManifest as any).scope_value||body?.scope_value,20000);

  const {data:run,error:re}=await admin.from("intelligence_runs").insert({user_id:user.id,model_key:model.model_key,model_version:model.version,evidence_batch_id:batch.id,scope_type:scopeType,scope_value:scopeValue,requested_prompt:clean(body?.requested_prompt,1200)||null,status:"running",candidate_count:candidates.length,engine_version:ENGINE,normalization_manifest:normalizationManifest,cohort_manifest:cohortManifest,started_at:new Date().toISOString()}).select("id").single();
  if(re||!run?.id)return out(req,503,{error:"Could not start Intelligence run"});
  const runId=String(run.id);

  try{
    const scored:any[]=[];
    for(const c of candidates){
      const features=c?.features&&typeof c.features==="object"?c.features:{};let weighted=0,availableWeight=0;const evidence:any[]=[],missing:any[]=[],contrib:any[]=[];
      for(const s of scoredDefs){const f=features[s.id];if(!available(f)){const p=prov(f);missing.push({signal_id:s.id,role:s.role||"score",weight:s.weight,reason:clean(f?.status||"missing",80),...p});continue}const fs=clamp(Number(f.score)),ct=fs*s.weight,p=prov(f);availableWeight+=s.weight;weighted+=ct;const item={signal_id:s.id,role:s.role||"score",score:round(fs),weight:round(s.weight,4),contribution:round(ct),value:f?.value??null,source_key:clean(f?.source_key,140)||null,source_url:clean(f?.source_url,600)||null,observed_at:clean(f?.observed_at,80)||null,explanation:clean(f?.explanation,500)||null,...p};evidence.push(item);contrib.push(item)}
      for(const s of confidenceDefs){const f=features[s.id];if(!available(f)){const p=prov(f);missing.push({signal_id:s.id,role:"confidence",reason:clean(f?.status||"missing",80),...p});continue}const p=prov(f);evidence.push({signal_id:s.id,role:"confidence",score:round(clamp(Number(f.score))),value:f?.value??null,source_key:clean(f?.source_key,140)||null,source_url:clean(f?.source_url,600)||null,observed_at:clean(f?.observed_at,80)||null,explanation:clean(f?.explanation,500)||null,...p})}
      if(availableWeight<=0)continue;
      const score=clamp(weighted/availableWeight),coverage=totalWeight?clamp(availableWeight/totalWeight*100):0,cv=confidenceDefs.map((s:any)=>features[s.id]).filter(available).map((f:any)=>clamp(Number(f.score))),cm=cv.length?cv.reduce((a:number,b:number)=>a+b,0)/cv.length:null;
      let confidence=cm===null?coverage:coverage*.7+cm*.3;const limited=coverage<minimumCoverage;if(limited)confidence=Math.min(confidence,49);confidence=clamp(confidence);
      const fact={model_key:model.model_key,model_version:model.version,evidence_batch_hash:batch.facts_hash,candidate:{pams_pin:clean(c?.pams_pin,100)||null,address:clean(c?.address,300)||null},evidence:evidence.map((e:any)=>({signal_id:e.signal_id,score:e.score,value:e.value,source_key:e.source_key,observed_at:e.observed_at,normalization:e.normalization,cohort:e.cohort})),missing_evidence:missing};
      const factsHash=await hash(fact),whyNow=contrib.sort((a:any,b:any)=>b.contribution-a.contribution).slice(0,3).map((e:any)=>({signal_id:e.signal_id,score:e.score,weight:e.weight,contribution:e.contribution,value:e.value,explanation:e.explanation}));
      scored.push({user_id:user.id,pams_pin:clean(c?.pams_pin,100)||null,property_address:clean(c?.address,300)||null,opportunity_type:String(model.objective||model.model_key),score:round(score),confidence:round(confidence),evidence_coverage:round(coverage),potential_impact:{},why_now:whyNow,evidence,missing_evidence:missing,recommended_actions:actions,narrative:null,narrative_status:"not_requested",facts_hash:factsHash,limited_evidence:limited});
    }
    scored.sort((a,b)=>Number(a.limited_evidence)-Number(b.limited_evidence)||b.score-a.score||b.confidence-a.confidence||String(a.pams_pin||a.property_address||"").localeCompare(String(b.pams_pin||b.property_address||"")));
    const limit=Math.max(1,Math.min(Number(body?.limit||50),100)),findings=scored.slice(0,limit).map((x,i)=>({run_id:runId,user_id:x.user_id,pams_pin:x.pams_pin,property_address:x.property_address,opportunity_type:x.opportunity_type,rank:i+1,score:x.score,confidence:x.confidence,evidence_coverage:x.evidence_coverage,potential_impact:x.potential_impact,why_now:x.why_now,evidence:x.evidence,missing_evidence:x.missing_evidence,recommended_actions:x.recommended_actions,narrative:x.narrative,narrative_status:x.narrative_status,facts_hash:x.facts_hash}));
    if(findings.length){const ins=await admin.from("intelligence_findings").insert(findings);if(ins.error)throw ins.error}
    const runHash=await hash({model_key:model.model_key,model_version:model.version,evidence_batch_hash:batch.facts_hash,scope_type:scopeType,scope_value:scopeValue,candidate_hashes:scored.map(x=>x.facts_hash)}),done=new Date().toISOString();
    const [ru,bu]=await Promise.all([admin.from("intelligence_runs").update({status:"complete",finding_count:findings.length,facts_hash:runHash,completed_at:done}).eq("id",runId),admin.from("intelligence_evidence_batches").update({consumed_at:done}).eq("id",batch.id).is("consumed_at",null)]);if(ru.error)throw ru.error;if(bu.error)throw bu.error;
    return out(req,200,{ok:true,run_id:runId,evidence_batch_id:batch.id,evidence_batch_hash:batch.facts_hash,engine_version:ENGINE,model:{key:model.model_key,label:model.label,version:model.version,status:model.status,calibration_state:model.calibration_state,validated:model.calibration_state==="calibrated"&&model.status==="live"},source_kind:batch.source_kind,candidate_count:candidates.length,scored_count:scored.length,finding_count:findings.length,minimum_evidence_coverage:minimumCoverage,findings:findings.map((f,i)=>({...f,limited_evidence:scored[i]?.limited_evidence??false})),warning:model.calibration_state==="calibrated"?null:"Preview model: deterministic output is not yet calibrated or predictive."});
  }catch(error){await admin.from("intelligence_runs").update({status:"failed",error_code:"preview_score_failed",completed_at:new Date().toISOString()}).eq("id",runId);console.error("intelligence-score-preview",error);return out(req,500,{error:"Intelligence preview run failed",run_id:runId})}
});
