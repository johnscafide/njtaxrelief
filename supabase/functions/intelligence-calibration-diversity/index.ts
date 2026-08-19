import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE="watchdog-calibration-diversity-v1";
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean=(v:unknown,n=120)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const env=(jsonName:string,legacyName:string)=>{const raw=Deno.env.get(jsonName)||"";if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default)}catch{}}return Deno.env.get(legacyName)||""};
const num=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const round=(v:number|null,d=3)=>v===null?null:Number(v.toFixed(d));

function evidenceVector(snapshot:any){
  const rows=Array.isArray(snapshot?.evidence)?snapshot.evidence:[];
  return rows.map((e:any)=>[clean(e?.signal_id,100),num(e?.score)]).filter((x:any)=>x[0]).sort((a:any,b:any)=>a[0].localeCompare(b[0]));
}
function stats(values:number[]){
  if(!values.length)return{n:0,distinct:0,min:null,max:null,mean:null};
  const distinct=new Set(values.map(v=>Number(v.toFixed(6))));
  return{n:values.length,distinct:distinct.size,min:round(Math.min(...values)),max:round(Math.max(...values)),mean:round(values.reduce((a,b)=>a+b,0)/values.length)};
}
function diagnose(set:any,cases:any[],reviews:any[]){
  const reviewMap=new Map(reviews.map((r:any)=>[String(r.calibration_case_id),r]));
  const binary=cases.filter(c=>c.expected_class==="review_priority"||c.expected_class==="not_priority");
  const positives=binary.filter(c=>c.expected_class==="review_priority").length;
  const negatives=binary.filter(c=>c.expected_class==="not_priority").length;
  const uncertain=cases.filter(c=>c.expected_class==="uncertain").length;
  const scored=binary.map(c=>reviewMap.get(String(c.id))).filter(Boolean);
  const actualScores=scored.map((r:any)=>num(r.actual_score)).filter((v:any)=>v!==null) as number[];
  const predictions={review_priority:0,not_priority:0,insufficient_evidence:0,other:0};
  for(const r of scored){const k=String(r.predicted_class||"");if(Object.prototype.hasOwnProperty.call(predictions,k))(predictions as any)[k]++;else predictions.other++}

  const vectors=cases.filter(c=>c.expected_class!=="unreviewed").map(c=>JSON.stringify(evidenceVector(c.evidence_snapshot)));
  const uniqueVectors=new Set(vectors).size;
  const signalValues=new Map<string,number[]>();
  for(const c of cases){if(c.expected_class==="unreviewed")continue;for(const [id,value] of evidenceVector(c.evidence_snapshot) as any[]){if(value===null)continue;if(!signalValues.has(id))signalValues.set(id,[]);signalValues.get(id)!.push(Number(value))}}
  const signals=Array.from(signalValues.entries()).map(([signal_id,values])=>({signal_id,...stats(values)})).sort((a,b)=>a.signal_id.localeCompare(b.signal_id));
  const reviewed=binary.length+uncertain;
  const minClass=Math.max(3,Math.ceil(Number(set.minimum_reviewed_cases||20)*0.12));
  const minVectors=Math.min(5,Math.max(2,Math.ceil(Math.max(reviewed,1)*0.2)));
  const scoreStats=stats(actualScores);
  const warnings:string[]=[];
  if(positives<minClass)warnings.push(`positive_class_insufficient:${positives}<${minClass}`);
  if(negatives<minClass)warnings.push(`negative_class_insufficient:${negatives}<${minClass}`);
  if(reviewed>=10&&scoreStats.distinct<=Math.max(1,Math.floor(reviewed*0.08)))warnings.push(`score_collapse:${scoreStats.distinct}_distinct_for_${reviewed}_reviewed`);
  if(reviewed>=10&&uniqueVectors<minVectors)warnings.push(`feature_vector_collapse:${uniqueVectors}<${minVectors}`);
  const dominant=Math.max(predictions.review_priority,predictions.not_priority,predictions.insufficient_evidence,predictions.other);
  if(scored.length>=10&&dominant/scored.length>=0.95)warnings.push(`prediction_collapse:${dominant}/${scored.length}_same_class`);
  const fullyCollapsed=signals.filter(s=>s.n>=Math.max(5,Math.floor(reviewed*0.5))&&s.distinct<=1).map(s=>s.signal_id);
  if(fullyCollapsed.length&&fullyCollapsed.length===signals.length)warnings.push("all_observed_signals_collapsed");
  return{
    calibration_set_id:set.id,model_key:set.model_key,model_version:set.model_version,status:set.status,
    reviewed_cases:reviewed,binary_cases:binary.length,positive_cases:positives,negative_cases:negatives,uncertain_cases:uncertain,
    prediction_counts:predictions,score_stats:scoreStats,unique_feature_vectors:uniqueVectors,minimum_unique_vectors:minVectors,
    signal_diversity:signals,collapsed_signals:fullyCollapsed,warnings,representative_ready:warnings.length===0,
    interpretation:warnings.length?"Do not use this reviewed set as promotion proof for a repaired model. Build a fresh representative holdout with broader governed feature variation and independent labels.":"This set clears the structural diversity checks; model quality gates still remain separate."
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pub||!secret)return out(req,503,{error:"Calibration diversity configuration incomplete"});
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:who}=await uc.auth.getUser(),user=who?.user;if(!user)return out(req,401,{error:"Session invalid"});
  const {data:profile}=await admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle();if(String(profile?.account_role||"")!=="developer")return out(req,403,{error:"Developer access required"});
  let body:any={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const requested=clean(body?.calibration_set_id,80);
  let q=admin.from("intelligence_calibration_sets").select("*").order("created_at",{ascending:false});if(requested)q=q.eq("id",requested);
  const {data:sets,error:setError}=await q;if(setError)throw setError;if(requested&&!sets?.length)return out(req,404,{error:"Calibration set not found"});
  const results=[];
  for(const set of sets||[]){
    const {data:cases,error:caseError}=await admin.from("intelligence_calibration_cases").select("id,expected_class,evidence_snapshot").eq("calibration_set_id",set.id);if(caseError)throw caseError;
    const ids=(cases||[]).map((c:any)=>c.id);let reviews:any[]=[];if(ids.length){const r=await admin.from("intelligence_calibration_reviews").select("calibration_case_id,predicted_class,actual_score,evidence_coverage").in("calibration_case_id",ids);if(r.error)throw r.error;reviews=r.data||[]}
    results.push(diagnose(set,cases||[],reviews));
  }
  return out(req,200,{engine:ENGINE,generated_at:new Date().toISOString(),privacy:"aggregate_calibration_structure_only_no_property_identifiers",results});
});
