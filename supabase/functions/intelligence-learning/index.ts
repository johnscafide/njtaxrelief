import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION="watchdog-learning-v4-canonical-domain";
const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const PLAN_RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const OUTCOMES=new Set(["reviewed","useful","not_relevant","contacted","appointment","client","under_contract","closed","dismissed"]);
const EVENT_WEIGHT:Record<string,number>={useful:.5,contacted:.6,appointment:1,client:1.25,under_contract:1.5,closed:2,not_relevant:-1,dismissed:-1};
const MINIMUM_DISTINCT_FINDINGS=8;
const PROF_DEFAULTS:Record<string,Record<string,number>>={
  general:{},
  agent:{"event.materiality":1.05,"event.recency":1.05,"event.change_density_30d":1.03,"watchdog.assessment_to_sale_ratio":1.03,"watchdog.closing_exception_priority":1.02},
  investor:{"watchdog.assessment_to_sale_ratio":1.08,"watchdog.tax_to_assessment_rate":1.05,"watchdog.sale_recency_confidence":1.02,"watchdog.closing_exception_priority":1.03},
  attorney:{"watchdog.closing_exception_priority":1.08,"watchdog.title_constraint_stack":1.07,"watchdog.due_diligence_signal_count":1.05,"watchdog.transaction_diligence_completion":1.03},
  appraiser:{"watchdog.assessment_to_sale_ratio":1.08,"watchdog.source_authority_coverage":1.05,"watchdog.tax_to_assessment_rate":1.03,"watchdog.sale_recency_confidence":1.02},
  lender:{"watchdog.closing_exception_priority":1.07,"watchdog.title_constraint_stack":1.05,"watchdog.transaction_diligence_completion":1.05,"watchdog.due_diligence_signal_count":1.03}
};
type O=Record<string,any>;
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const json=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=300)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const numeric=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null};
const namedEnv=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw)try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}return Deno.env.get(l)||""};
const defaultsFor=(profession:string)=>PROF_DEFAULTS[profession]||PROF_DEFAULTS.general;
const clamp=(n:number,a=.85,b=1.15)=>Math.max(a,Math.min(b,n));

function validateAssumptions(v:O){
  const x=v&&typeof v==="object"?v:{};
  const transaction=numeric(x.estimated_transaction_value_cents),rate=numeric(x.fee_rate_percent),probability=numeric(x.conversion_probability_percent),cost=numeric(x.cost_cents),fixed=numeric(x.fixed_value_cents);
  if(transaction!==null&&(transaction<0||transaction>100000000000))throw new Error("Estimated transaction value is outside the supported range.");
  if(rate!==null&&(rate<0||rate>100))throw new Error("Fee or value rate must be between 0 and 100 percent.");
  if(probability!==null&&(probability<0||probability>100))throw new Error("Conversion probability must be between 0 and 100 percent.");
  if(cost!==null&&(cost<0||cost>10000000000))throw new Error("Cost assumption is outside the supported range.");
  if(fixed!==null&&(fixed<0||fixed>100000000000))throw new Error("Fixed opportunity value is outside the supported range.");
  return{estimated_transaction_value_cents:transaction,fee_rate_percent:rate,conversion_probability_percent:probability,cost_cents:cost,fixed_value_cents:fixed};
}
function scenario(a:O){
  const transaction=numeric(a?.estimated_transaction_value_cents),rate=numeric(a?.fee_rate_percent),probability=numeric(a?.conversion_probability_percent),cost=Math.max(0,numeric(a?.cost_cents)||0),fixed=numeric(a?.fixed_value_cents);
  let gross:number|null=null;if(fixed!==null)gross=Math.max(0,fixed);else if(transaction!==null&&rate!==null)gross=Math.max(0,transaction*(rate/100));
  const raw=gross===null?null:Math.max(0,Math.round(gross-cost)),adjusted=raw===null||probability===null?null:Math.max(0,Math.round(raw*(probability/100)));
  return{gross_value_cents:gross===null?null:Math.round(gross),raw_scenario_value_cents:raw,probability_adjusted_value_cents:adjusted,calculation_version:"opportunity-value-v1",labels:{estimated_transaction_value:"User assumption",fee_rate:"User assumption",conversion_probability:"User assumption",cost:"User assumption",watchdog_score:"Governed finding",scenario_value:"Scenario math, not predicted revenue"}};
}
const signalIds=(f:O)=>[...new Set((Array.isArray(f?.evidence)?f.evidence:[]).map((x:O)=>clean(x?.signal_id,140)).filter(Boolean))];

async function rebuildProfile(admin:any,userId:string,profession:string,objective:string){
  const existing=await admin.from("intelligence_preference_profiles").select("reset_at").eq("user_id",userId).eq("profession",profession).eq("objective",objective).maybeSingle(),resetAt=existing.data?.reset_at||null;
  let q=admin.from("intelligence_outcome_events").select("finding_id,event_type,signal_snapshot,metadata,occurred_at").eq("user_id",userId).order("occurred_at",{ascending:true}).limit(1000);if(resetAt)q=q.gt("occurred_at",resetAt);
  const {data,error}=await q;if(error)throw error;
  const grouped=new Map<string,{weight:number;signals:string[]}>();
  for(const row of data||[]){
    if(String(row?.metadata?.profession||"general")!==profession||String(row?.metadata?.objective||"general")!==objective)continue;
    const w=EVENT_WEIGHT[String(row.event_type)]||0,key=String(row.finding_id||"");if(!w||!key)continue;
    const cur=grouped.get(key)||{weight:0,signals:[]};cur.weight=Math.max(-2,Math.min(2,cur.weight+w));cur.signals=[...new Set([...cur.signals,...(Array.isArray(row.signal_snapshot)?row.signal_snapshot.map((x:O)=>clean(x?.signal_id,140)).filter(Boolean):[])])];grouped.set(key,cur);
  }
  const totals:Record<string,{n:number;sum:number}>={};let positive=0,negative=0;
  for(const ex of grouped.values()){if(ex.weight>0)positive++;if(ex.weight<0)negative++;for(const id of ex.signals){totals[id]=totals[id]||{n:0,sum:0};totals[id].n++;totals[id].sum+=ex.weight}}
  const sampleSize=grouped.size,learned:Record<string,number>={};
  if(sampleSize>=MINIMUM_DISTINCT_FINDINGS)for(const [id,t] of Object.entries(totals)){if(t.n<3)continue;learned[id]=clamp(Math.round((1+(t.sum/t.n)*.08)*1000)/1000)}
  const status=sampleSize>=MINIMUM_DISTINCT_FINDINGS?"active":sampleSize?"learning":resetAt?"reset":"cold_start",payload={user_id:userId,profession,objective,status,sample_size:sampleSize,positive_count:positive,negative_count:negative,default_weights:defaultsFor(profession),learned_weights:learned,minimum_evidence:MINIMUM_DISTINCT_FINDINGS,reset_at:resetAt,last_rebuilt_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const saved=await admin.from("intelligence_preference_profiles").upsert(payload,{onConflict:"user_id,profession,objective"});if(saved.error)throw saved.error;return payload;
}
function personalizedPriority(f:O,p:O){
  const ids=signalIds(f),defaults=p?.default_weights||{},learned=p?.learned_weights||{},active=p?.status==="active";
  const factors:number[]=[],defaultMatched:string[]=[],learnedMatched:string[]=[];
  for(const id of ids){const d=numeric(defaults[id])??1,l=active?(numeric(learned[id])??1):1;if(d!==1)defaultMatched.push(id);if(active&&l!==1)learnedMatched.push(id);if(d!==1||l!==1)factors.push(clamp(d*l))}
  const multiplier=factors.length?clamp(factors.reduce((a,b)=>a+b,0)/factors.length):1,score=Math.max(0,Math.min(100,Math.round(Number(f.score||0)*multiplier*10)/10));
  const base=`Profession default: ${defaultMatched.length} matching governed signal${defaultMatched.length===1?"":"s"}.`;
  if(!active)return{score,personalized:false,profession_default:defaultMatched.length>0,multiplier:Math.round(multiplier*1000)/1000,reason:`${base} Learned personalization remains off until ${p?.minimum_evidence||MINIMUM_DISTINCT_FINDINGS} distinct finding outcomes; ${p?.sample_size||0} recorded.`};
  return{score,personalized:learnedMatched.length>0,profession_default:defaultMatched.length>0,multiplier:Math.round(multiplier*1000)/1000,reason:learnedMatched.length?`${base} Attention also reflects ${learnedMatched.length} learned signal preference${learnedMatched.length===1?"":"s"}.`:`${base} No learned signal weight matched this finding, so only transparent profession defaults apply.`};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return json(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return json(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return json(req,503,{error:"Learning service configuration incomplete"});
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:au}=await uc.auth.getUser(),user=au?.user;if(!user)return json(req,401,{error:"Session invalid"});
  let body:O={};try{body=await req.json()}catch{return json(req,400,{error:"Invalid JSON"})}
  const [{data:entitlement},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier,profession").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]),plan=String(profile?.account_role||"")==="developer"?"developer":String(entitlement?.plan_tier||"standard");if((PLAN_RANK[plan]??0)<PLAN_RANK.pro)return json(req,403,{error:"Pro plan required",minimum_plan:"pro"});
  const action=clean(body.action||"state",40),profession=clean(body.profession||entitlement?.profession||"general",80)||"general",objective=clean(body.objective||"general",120)||"general";
  if(action==="save_assumptions"){
    let assumptions:O;try{assumptions=validateAssumptions(body.assumptions)}catch(e){return json(req,400,{error:clean((e as any)?.message||e,300)})}
    const saved=await admin.from("intelligence_assumptions").upsert({user_id:user.id,objective,profession,assumptions,updated_at:new Date().toISOString()},{onConflict:"user_id,objective"}).select("user_id,objective,profession,assumptions,updated_at").single();if(saved.error)return json(req,503,{error:"Could not save scenario assumptions"});
    return json(req,200,{ok:true,assumptions:saved.data,scenario:scenario(assumptions),warning:"Scenario math is user-controlled. It is not predicted or guaranteed revenue."});
  }
  if(action==="reset_profile"){
    const now=new Date().toISOString(),payload={user_id:user.id,profession,objective,status:"reset",sample_size:0,positive_count:0,negative_count:0,default_weights:defaultsFor(profession),learned_weights:{},minimum_evidence:MINIMUM_DISTINCT_FINDINGS,reset_at:now,last_rebuilt_at:now,updated_at:now},saved=await admin.from("intelligence_preference_profiles").upsert(payload,{onConflict:"user_id,profession,objective"});if(saved.error)return json(req,503,{error:"Could not reset the learned attention profile"});
    return json(req,200,{ok:true,profile:payload,warning:"Reset starts a new learning window. Historical findings and outcomes remain unchanged for auditability."});
  }
  if(action==="record"){
    const findingId=clean(body.finding_id,80),eventType=clean(body.event_type,40);if(!findingId||!OUTCOMES.has(eventType))return json(req,400,{error:"A valid finding_id and feedback or outcome event_type are required"});
    const fq=await admin.from("intelligence_findings").select("id,run_id,user_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,evidence,facts_hash,created_at").eq("id",findingId).eq("user_id",user.id).maybeSingle(),f=fq.data;if(fq.error||!f)return json(req,404,{error:"Owned Intelligence finding not found"});
    const [aq,rq,ef]=await Promise.all([admin.from("intelligence_assumptions").select("assumptions").eq("user_id",user.id).eq("objective",objective).maybeSingle(),admin.from("intelligence_runs").select("model_key,model_version").eq("id",f.run_id).eq("user_id",user.id).maybeSingle(),admin.from("intelligence_feedback").select("feedback,outcome").eq("finding_id",f.id).eq("user_id",user.id).maybeSingle()]),assumptions=aq.data?.assumptions||{},current=scenario(assumptions),lineage={model_key:rq.data?.model_key||f.opportunity_type||"unknown",model_version:Number(rq.data?.model_version||1),signals:Array.isArray(f.evidence)?f.evidence:[]},payload:O={finding_id:f.id,user_id:user.id,feedback:ef.data?.feedback||null,outcome:ef.data?.outcome||null,reason_code:clean(body.reason_code,80)||null,notes:clean(body.notes,500)||null,model_key:lineage.model_key,model_version:lineage.model_version,facts_hash:f.facts_hash,signal_snapshot:lineage.signals,assumption_snapshot:assumptions,updated_at:new Date().toISOString()};
    if(eventType==="useful"||eventType==="not_relevant")payload.feedback=eventType;else payload.outcome=eventType;
    const fs=await admin.from("intelligence_feedback").upsert(payload,{onConflict:"finding_id,user_id"});if(fs.error)return json(req,503,{error:"Could not save Intelligence feedback"});
    const er=await admin.from("intelligence_outcome_events").insert({finding_id:f.id,run_id:f.run_id,user_id:user.id,event_type:eventType,reason_code:clean(body.reason_code,80)||null,notes:clean(body.notes,500)||null,revenue_cents:numeric(body.revenue_cents),model_key:lineage.model_key,model_version:lineage.model_version,facts_hash:f.facts_hash,signal_snapshot:lineage.signals,assumption_snapshot:assumptions,scenario_snapshot:current,metadata:{source:"intelligence_learning",profession,objective,version:VERSION}}).select("id").single();if(er.error)return json(req,503,{error:"Could not record Intelligence outcome"});
    const rebuilt=await rebuildProfile(admin,user.id,profession,objective);return json(req,200,{ok:true,event_id:er.data.id,profile:rebuilt,scenario:current,warning:"Feedback changes future attention ranking only. It never rewrites source facts, governed metrics, or historical findings."});
  }
  if(action==="value"){
    const findingId=clean(body.finding_id,80),fq=await admin.from("intelligence_findings").select("id,user_id,pams_pin,property_address,score,confidence,evidence_coverage,facts_hash").eq("id",findingId).eq("user_id",user.id).maybeSingle(),f=fq.data;if(fq.error||!f)return json(req,404,{error:"Owned Intelligence finding not found"});
    const aq=await admin.from("intelligence_assumptions").select("assumptions,profession").eq("user_id",user.id).eq("objective",objective).maybeSingle(),assumptions=aq.data?.assumptions||{},current=scenario(assumptions);if(current.raw_scenario_value_cents===null)return json(req,409,{error:"Save a transaction value plus fee or rate, or a fixed opportunity value, before calculating Opportunity Value.",scenario:current});if(current.probability_adjusted_value_cents===null)return json(req,409,{error:"Enter your own conversion probability before saving a probability-adjusted Opportunity Value snapshot.",scenario:current});
    const inserted=await admin.from("intelligence_value_snapshots").insert({finding_id:f.id,user_id:user.id,objective,profession,factual_context:{pams_pin:f.pams_pin,property_address:f.property_address,watchdog_score:f.score,confidence:f.confidence,evidence_coverage:f.evidence_coverage,facts_hash:f.facts_hash},assumption_snapshot:assumptions,raw_scenario_value_cents:current.raw_scenario_value_cents,probability_adjusted_value_cents:current.probability_adjusted_value_cents,calculation_version:current.calculation_version}).select("id").single();if(inserted.error)return json(req,503,{error:"Could not save Opportunity Value snapshot"});
    return json(req,200,{ok:true,snapshot_id:inserted.data.id,factual_context:{watchdog_score:f.score,confidence:f.confidence,evidence_coverage:f.evidence_coverage},assumptions,scenario:current,warning:"Opportunity Value is scenario math under your assumptions. It is not predicted or guaranteed revenue."});
  }
  const aq=await admin.from("intelligence_assumptions").select("objective,profession,assumptions,updated_at").eq("user_id",user.id).eq("objective",objective).maybeSingle();
  let pq=await admin.from("intelligence_preference_profiles").select("user_id,profession,objective,status,sample_size,positive_count,negative_count,default_weights,learned_weights,minimum_evidence,reset_at,last_rebuilt_at,updated_at").eq("user_id",user.id).eq("profession",profession).eq("objective",objective).maybeSingle();if(!pq.data)pq={...pq,data:await rebuildProfile(admin,user.id,profession,objective)} as any;
  const ids=Array.isArray(body.finding_ids)?body.finding_ids.map((x:unknown)=>clean(x,80)).filter(Boolean).slice(0,100):[];let fq=admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,evidence,facts_hash,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(ids.length?100:30);if(ids.length)fq=fq.in("id",ids);
  const fr=await fq,assumptions=aq.data?.assumptions||{},current=scenario(assumptions),findings=(fr.data||[]).map((f:O)=>({...f,personalized_priority:personalizedPriority(f,pq.data),scenario:current})).sort((a:O,b:O)=>Number(b.personalized_priority.score)-Number(a.personalized_priority.score)||Number(b.score)-Number(a.score));
  return json(req,200,{ok:true,version:VERSION,plan,profession,objective,assumptions:aq.data||{objective,profession,assumptions:{}},profile:pq.data,findings,warning:"Profession defaults and learned personalization only reorder attention priority. Watchdog scores, source facts, derived metrics, and historical findings remain unchanged."});
});