import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-model-repair-readiness-v1";
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean=(v:unknown,n=160)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const round=(v:number|null,d=2)=>v===null?null:Number(v.toFixed(d));
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const env=(jsonName:string,legacyName:string)=>{const raw=Deno.env.get(jsonName)||"";if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default)}catch{}}return Deno.env.get(legacyName)||""};

type FeatureHealth={feature_key:string;observations:number;available:number;available_rate:number;distinct_scores:number;min_score:number|null;max_score:number|null};

function featureHealth(candidates:any[],featureKeys:string[]):FeatureHealth[]{
  return featureKeys.map(featureKey=>{
    const rows=candidates.map(c=>c?.features?.[featureKey]).filter(Boolean);
    const scores=rows.map((r:any)=>num(r?.score)).filter((v):v is number=>v!==null);
    const available=rows.filter((r:any)=>r?.status==="available"&&num(r?.score)!==null).length;
    const distinct=new Set(scores.map(v=>Number(v.toFixed(6))));
    return{feature_key:featureKey,observations:rows.length,available,available_rate:rows.length?round(available/rows.length,4)||0:0,distinct_scores:distinct.size,min_score:scores.length?round(Math.min(...scores)):null,max_score:scores.length?round(Math.max(...scores)):null};
  });
}

function weightedDistribution(candidates:any[],signals:any[]){
  const scoreSignals=signals.filter(s=>String(s?.role)==="score"&&num(s?.weight)!==null);
  const values:number[]=[];
  for(const c of candidates){let total=0,weight=0;for(const s of scoreSignals){const f=c?.features?.[String(s.id)],score=num(f?.score),w=num(s?.weight);if(score===null||w===null||f?.status!=="available")continue;total+=score*w;weight+=w}if(weight>0)values.push(total)}
  const distinct=new Set(values.map(v=>Number(v.toFixed(4))));
  return{observations:values.length,distinct_scores:distinct.size,min:values.length?round(Math.min(...values)):null,max:values.length?round(Math.max(...values)):null,mean:values.length?round(values.reduce((a,b)=>a+b,0)/values.length):null};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pub||!secret)return out(req,503,{error:"Model repair readiness configuration incomplete"});
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:who}=await uc.auth.getUser(),user=who?.user;if(!user)return out(req,401,{error:"Session invalid"});
  const {data:profile}=await admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle();if(String(profile?.account_role||"")!=="developer")return out(req,403,{error:"Developer access required"});

  const since180=new Date(Date.now()-180*86400000).toISOString();
  const [currentR,draftR,eventR,closingBatchR,changeBatchR,closingSetR,changeSetR]=await Promise.all([
    admin.from("intelligence_models").select("model_key,version,status,calibration_state,signal_config").in("model_key",["closing_review","property_change_priority"]),
    admin.from("intelligence_model_versions").select("model_key,version,status,calibration_state,signal_config,scoring_notes").or("and(model_key.eq.closing_review,version.eq.3),and(model_key.eq.property_change_priority,version.eq.4)"),
    admin.from("property_update_events").select("event_type,severity,pams_pin,occurred_at").gte("occurred_at",since180).order("occurred_at",{ascending:false}).limit(10000),
    admin.from("intelligence_evidence_batches").select("candidates").eq("model_key","closing_review").eq("model_version",2).order("created_at",{ascending:false}).limit(80),
    admin.from("intelligence_evidence_batches").select("candidates").eq("model_key","property_change_priority").eq("model_version",3).order("created_at",{ascending:false}).limit(80),
    admin.from("intelligence_calibration_sets").select("source_manifest,created_at").eq("model_key","closing_review").eq("model_version",2).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    admin.from("intelligence_calibration_sets").select("source_manifest,created_at").eq("model_key","property_change_priority").eq("model_version",3).order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  for(const r of [currentR,draftR,eventR,closingBatchR,changeBatchR,closingSetR,changeSetR])if(r.error)return out(req,503,{error:"Model repair readiness evidence unavailable"});

  const current=new Map((currentR.data||[]).map((m:any)=>[String(m.model_key),m])),drafts=new Map((draftR.data||[]).map((m:any)=>[String(m.model_key),m]));
  const closing=current.get("closing_review"),change=current.get("property_change_priority"),closingDraft=drafts.get("closing_review"),changeDraft=drafts.get("property_change_priority");
  const closingCandidates=(closingBatchR.data||[]).flatMap((b:any)=>Array.isArray(b.candidates)?b.candidates:[]),changeCandidates=(changeBatchR.data||[]).flatMap((b:any)=>Array.isArray(b.candidates)?b.candidates:[]);
  const closingSignals=Array.isArray(closing?.signal_config?.signals)?closing.signal_config.signals:[],changeSignals=Array.isArray(change?.signal_config?.signals)?change.signal_config.signals:[];
  const closingFeatures=featureHealth(closingCandidates,closingSignals.map((s:any)=>clean(s.id,140)).filter(Boolean)),changeFeatures=featureHealth(changeCandidates,changeSignals.map((s:any)=>clean(s.id,140)).filter(Boolean));
  const closingWeighted=weightedDistribution(closingCandidates,closingSignals),changeWeighted=weightedDistribution(changeCandidates,changeSignals);
  const closingThreshold=num(closingSetR.data?.source_manifest?.priority_threshold)??60,changeThreshold=num(changeSetR.data?.source_manifest?.priority_threshold)??60;

  const events=eventR.data||[],excluded=new Set((Array.isArray(changeDraft?.signal_config?.excluded_event_types)?changeDraft.signal_config.excluded_event_types:["source_refresh"]).map((x:any)=>String(x)));
  const material=events.filter((e:any)=>!excluded.has(String(e.event_type||""))),materialTypes=new Set(material.map((e:any)=>String(e.event_type||"")).filter(Boolean)),materialProperties=new Set(material.map((e:any)=>String(e.pams_pin||"")).filter(Boolean)),materialSeverities=new Set(material.map((e:any)=>String(e.severity||"")).filter(Boolean));
  const changePolicy=changeDraft?.signal_config?.holdout_policy||{},minEvents=Number(changePolicy.minimum_non_operational_events||25),minTypes=Number(changePolicy.minimum_distinct_event_types||3);
  const changeReasons:string[]=[];
  if(material.length<minEvents)changeReasons.push(`non_operational_event_pool:${material.length}<${minEvents}`);
  if(materialTypes.size<minTypes)changeReasons.push(`distinct_material_event_types:${materialTypes.size}<${minTypes}`);
  const recencyHealth=changeFeatures.find(x=>x.feature_key==="event.recency");if(recencyHealth&&recencyHealth.available_rate===0)changeReasons.push("v3_recency_feature_unavailable_in_persisted_evidence");
  const sourceRefreshCount=events.filter((e:any)=>String(e.event_type||"")==="source_refresh").length;

  const closingReasons:string[]=[];
  if(closingWeighted.max===null||closingWeighted.max<closingThreshold)closingReasons.push(`current_weighted_score_ceiling:${closingWeighted.max??"none"}<threshold_${closingThreshold}`);
  const zeroOnly=closingFeatures.filter(x=>x.available>0&&x.distinct_scores===1&&x.min_score===0&&x.max_score===0).map(x=>x.feature_key);if(zeroOnly.length)closingReasons.push(`zero_only_current_features:${zeroOnly.join(",")}`);
  closingReasons.push("vnext_direct_feature_dry_run_required_before_fresh_holdout");

  return out(req,200,{
    engine:ENGINE,generated_at:new Date().toISOString(),privacy:"aggregate_model_repair_readiness_no_property_identifiers",
    active_models:[closing,change].filter(Boolean).map((m:any)=>({model_key:m.model_key,version:m.version,status:m.status,calibration_state:m.calibration_state})),
    draft_models:[closingDraft,changeDraft].filter(Boolean).map((m:any)=>({model_key:m.model_key,version:m.version,status:m.status,calibration_state:m.calibration_state,holdout_policy:m.signal_config?.holdout_policy||{},design_note:m.signal_config?.design_note||null})),
    closing_review:{current_version:closing?.version||null,draft_version:closingDraft?.version||null,current_priority_threshold:closingThreshold,current_weighted_distribution:closingWeighted,current_feature_health:closingFeatures,zero_only_current_features:zeroOnly,ready_for_fresh_holdout:false,blocked_reasons:closingReasons,next_step:"Run the draft direct-feature contract across a broad governed property pool without persisting/promoting results; only seed a fresh holdout after structural diversity passes."},
    property_change_priority:{current_version:change?.version||null,draft_version:changeDraft?.version||null,current_priority_threshold:changeThreshold,current_weighted_distribution:changeWeighted,current_feature_health:changeFeatures,event_pool_180d:{events:events.length,source_refresh_events:sourceRefreshCount,non_operational_events:material.length,distinct_non_operational_event_types:materialTypes.size,distinct_non_operational_properties:materialProperties.size,distinct_non_operational_severities:materialSeverities.size},ready_for_fresh_holdout:changeReasons.length===0,blocked_reasons:changeReasons,next_step:changeReasons.length?"Do not generate a promotion holdout yet. Grow/ingest genuinely decision-material governed change events and certify the v4 input adapter first.":"Structural event-pool minimums pass. Build a fresh v4 candidate holdout, then run the diversity diagnostic before requesting independent labels."},
    promotion_boundary:"Draft readiness is not calibration. No model may be promoted without fresh independent labels and the existing precision/recall/false-positive-rate gates."
  });
});
