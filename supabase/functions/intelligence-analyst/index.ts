import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ANALYST_VERSION="watchdog-analyst-v4-semantic-context";
const TOOL_VERSION="watchdog-analyst-tools-v3-semantic";
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const PLAN_RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const DAILY_LIMIT:Record<string,number>={pro:75,pro_plus:300,teams:1500,developer:10000};
const ACTIONS=new Set(["create_case","create_report","watch_property"]);
type O=Record<string,any>;
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=1200)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const uniq=(v:string[])=>[...new Set(v.filter(Boolean))];
const safeObj=(v:unknown,max=25000):O=>{if(!v||typeof v!=="object"||Array.isArray(v))return{};try{return JSON.stringify(v).length<=max?v as O:{} }catch{return{}}};
const namedEnv=(jsonName:string,legacyName:string)=>{const raw=Deno.env.get(jsonName)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacyName)||""};
const safeUrl=(v:unknown)=>{try{const u=new URL(String(v||""));return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function refusal(prompt:string){
  const target=/\b(find|rank|target|filter|exclude|include|prioritize|prospect)\b/i.test(prompt);
  const protectedTerm=/\b(race|racial|ethnic|ethnicity|religion|religious|disability|disabled|familial status|families with children|national origin|sex|gender|sexual orientation|pregnan|marital status)\b/i.test(prompt);
  if(target&&protectedTerm)return"Watchdog cannot rank, target, include, or exclude housing opportunities using protected or sensitive personal characteristics.";
  if(/\b(likely to sell|will sell|motivated seller|distressed owner|desperate owner|foreclosure likelihood|divorce|death|health condition)\b/i.test(prompt))return"Watchdog does not infer seller intent, personal distress, private life events, or a person's likelihood to transact.";
  if(/\b(guarantee|guaranteed|certain profit|sure profit|guaranteed appeal|win probability)\b/i.test(prompt))return"Watchdog cannot guarantee profits, appeal outcomes, values, or transaction results. It can show governed evidence and user-controlled scenarios.";
  return null;
}
function route(prompt:string,context:O){
  const p=prompt.toLowerCase();let tool="run_intelligence_model",model="assessment_anomaly";
  if(/\b(create|open|start)\b.*\bcase\b/.test(p))tool="create_case";
  else if(/\b(create|draft|start)\b.*\breport\b/.test(p))tool="create_report";
  else if(/\b(watch|monitor|track)\b.*\b(property|this|result|finding)\b/.test(p))tool="watch_property";
  else if(/\b(score history|historical score|score trend)\b/.test(p))tool="get_score_history";
  else if(/\b(source|formula|lineage|where did|why flagged|why this)\b/.test(p))tool="inspect_lineage";
  else if(/\b(changed|changes|what changed|update history)\b/.test(p)&&!/\b(rank|top|find|priority|prioritize)\b/.test(p))tool="get_property_changes";
  else{
    const factIntent=/\b(property facts?|what do (?:you|we) know|tell me about|property details?|assessment|assessed value|annual tax|property tax|taxes|sale price|last sale|sale date|municipality|county|block|lot|property class|permit|certificate|flood|wetland|tideland|uniformity|appeal|budget|levy|revaluation)\b/.test(p);
    const analysisIntent=/\b(analy(?:ze|sis)|rank|priority|prioritize|flag|opportunit|review queue|closing review|change intelligence|anomaly|which .*needs attention|what deserves attention)\b/.test(p);
    if(factIntent&&!analysisIntent)tool="get_property_facts";
  }
  if(/\b(closing|permit|title|due diligence|transaction exception)\b/.test(p))model="closing_review";
  else if(/\b(change intelligence|recent changes|material changes|changed properties)\b/.test(p))model="property_change_priority";
  const m=p.match(/\b(?:top|find|show|rank)\s+(\d{1,3})\b/);
  return{tool,model,limit:Math.max(1,Math.min(Number(m?.[1]||10),50)),farm:/\bfarm\b/.test(p),savedView:/\b(saved view|workbench view)\b/.test(p)&&!!context.saved_view_id,compare:/\bcompare\b/.test(p)};
}
function semanticPacks(prompt:string,model:string,context:O){
  const p=prompt.toLowerCase(),packs=new Set<string>(["identity"]),section=clean(context?.section,80).toLowerCase();
  if(/assessment|assessed|tax|chapter.?123/.test(p)||section==="assessment")packs.add("assessment_tax");
  if(/sale|market|price|deed/.test(p))packs.add("sale_market");
  if(/appeal|uniformity|chapter.?123|common level/.test(p))packs.add("appeal_uniformity");
  if(/permit|closing|title|certificate|due diligence|deed notice/.test(p)||section==="closing")packs.add("permits_closing");
  if(/flood|wetland|tideland|environment|contamin|highlands|pinelands|ust/.test(p)||section==="closing")packs.add("environment_risk");
  if(/municipal|budget|levy|tax pressure|revaluation|fiscal/.test(p))packs.add("municipal_pressure");
  if(model==="assessment_anomaly"){packs.add("assessment_tax");packs.add("sale_market");packs.add("appeal_uniformity")}
  if(model==="closing_review"){packs.add("permits_closing");packs.add("environment_risk");packs.add("sale_market")}
  if(model==="property_change_priority"){packs.add("sale_market");packs.add("municipal_pressure");packs.add("agent_opportunity")}
  if(packs.size===1){packs.add("assessment_tax");packs.add("sale_market");packs.add("municipal_pressure")}
  return[...packs];
}
async function semanticContext(url:string,pub:string,auth:string,pins:string[],packs:string[]){
  const call=await fetch(`${url}/functions/v1/intelligence-semantic-context`,{method:"POST",headers:{Authorization:auth,apikey:pub,"Content-Type":"application/json"},body:JSON.stringify({pams_pins:pins.slice(0,5),packs})});
  const data=await call.json().catch(()=>({}));
  if(!call.ok)return{ok:false,status:call.status,error:clean(data?.error||`Semantic context failed (${call.status})`,400),data:null};
  return{ok:true,status:call.status,error:null,data};
}
function factValue(v:unknown){if(v===null||v===undefined)return"not available";if(typeof v==="number")return Number.isInteger(v)?v.toLocaleString("en-US"):v.toLocaleString("en-US",{maximumFractionDigits:4});if(typeof v==="boolean")return v?"yes":"no";if(typeof v==="object"){try{return clean(JSON.stringify(v),240)}catch{return"structured value"}}return clean(v,240)}
function semanticLineage(data:O){return{contract_version:data?.contract_version||null,engine_version:data?.engine_version||null,authority_policy:data?.authority_policy||null,registry_version:data?.registry_version||null,facts_hashes:(Array.isArray(data?.snapshots)?data.snapshots:[]).map((s:O)=>({pams_pin:s.pams_pin,facts_hash:s.facts_hash||s.snapshot_hash||null,retrieval_hash:s.retrieval_hash||null,cache_hit:Boolean(s.cache_hit)}))}}
function addSemanticFacts(base:O,data:O,maxPerProperty=6){
  const snaps=Array.isArray(data?.snapshots)?data.snapshots:[],preferred=["property.assessed_value","property.annual_tax","property.sale_price","property.sale_date","property.municipality","property.county"],extra:string[]=[];
  for(const snap of snaps.slice(0,5)){
    const items=Array.isArray(snap?.markers)?snap.markers:[],byId=new Map(items.map((m:O)=>[m.id,m])),chosen:O[]=[];
    for(const id of preferred){const m=byId.get(id);if(m?.state==="available"&&!chosen.includes(m))chosen.push(m)}
    for(const m of items.filter((x:O)=>x?.state==="available").sort((a:O,b:O)=>Number(b.authority_rank||0)-Number(a.authority_rank||0)))if(chosen.length<maxPerProperty&&!chosen.includes(m))chosen.push(m);
    const label=clean(snap.address||snap.pams_pin||"Property",180);for(const m of chosen.slice(0,maxPerProperty))extra.push(`${label}: ${clean(m.label||m.id,140)} = ${factValue(m.value)}. Source: ${clean(m.source||m.source_id||"governed source",180)}; ${clean(m.truth_class||"resolved value",80)}; authority ${Number(m.authority_rank||0)}/100.`)
  }
  base.evidence=uniq([...(Array.isArray(base.evidence)?base.evidence:[]),...extra]);base.semantic_context=semanticLineage(data);return base;
}
function deterministic(tool:string,result:O){
  const evidence:string[]=[],missing:string[]=[],caveats:string[]=[],suggested:string[]=[],sources:{label:string,url:string|null}[]=[];
  if(tool==="get_property_facts"){
    const data=result.semantic_context||result,snaps=Array.isArray(data?.snapshots)?data.snapshots:[];
    for(const snap of snaps.slice(0,5)){
      const label=clean(snap.address||snap.pams_pin||"Property",180),items=Array.isArray(snap?.markers)?snap.markers:[],available=items.filter((m:O)=>m?.state==="available").sort((a:O,b:O)=>Number(b.authority_rank||0)-Number(a.authority_rank||0)||clean(a.label).localeCompare(clean(b.label)));
      for(const m of available.slice(0,18)){evidence.push(`${label}: ${clean(m.label||m.id,160)} = ${factValue(m.value)}. Source: ${clean(m.source||m.source_id||"governed source",180)}; ${clean(m.truth_class||"resolved value",80)}; authority ${Number(m.authority_rank||0)}/100.`);}
      for(const m of items.filter((x:O)=>x?.state!=="available").slice(0,8))missing.push(`${label}: ${clean(m.label||m.id,160)} (${clean(m.state||"missing",100)}).`);
    }
    const availableCount=snaps.reduce((n:number,s:O)=>n+Number(s.available_count||0),0),missingCount=snaps.reduce((n:number,s:O)=>n+Number(s.missing_count||0),0);
    caveats.push("These are governed property facts and Watchdog-derived markers. Missing or unavailable evidence remains explicit.");
    caveats.push("Source-authority policy preserves source observations and does not let AI silently replace source truth.");
    return{conclusion:snaps.length?`Watchdog resolved ${availableCount} governed values across ${snaps.length} propert${snaps.length===1?"y":"ies"}, with ${missingCount} values unavailable or not resolved in this semantic scope.`:"No governed property snapshot was resolved. Watchdog did not fill the gap with a guess.",evidence,missing_evidence:uniq(missing),caveats,suggested_actions:["run_intelligence_model","review_evidence"],sources:[],semantic_context:semanticLineage(data)};
  }
  if(tool==="run_intelligence_model"){
    const findings=Array.isArray(result.findings)?result.findings:[];
    for(const f of findings.slice(0,5)){
      const label=clean(f.property_address||f.pams_pin||"Property",180);
      evidence.push(`${label}: Watchdog review score ${Math.round(Number(f.score||0))}/100, confidence ${Math.round(Number(f.confidence||0))}%, evidence ${Math.round(Number(f.evidence_coverage||0))}%.`);
      for(const w of (Array.isArray(f.why_now)?f.why_now:[]).slice(0,2))evidence.push(`${label}: ${clean(w.signal_id,140)} normalized ${Math.round(Number(w.score||0))}/100${w.explanation?`: ${clean(w.explanation,260)}`:""}.`);
      for(const x of (Array.isArray(f.missing_evidence)?f.missing_evidence:[]).slice(0,3))missing.push(`${label}: ${clean(x.signal_id,140)} (${clean(x.reason||"missing",120)}).`);
      for(const x of Array.isArray(f.evidence)?f.evidence:[]){const u=safeUrl(x.source_url);if(u)sources.push({label:clean(x.signal_id||x.source_key||"Source",140),url:u})}
      for(const a of Array.isArray(f.recommended_actions)?f.recommended_actions:[])suggested.push(clean(a,80));
    }
    if(result.warning)caveats.push(clean(result.warning,400));
    caveats.push("Scores rank governed evidence for review. They are not valuations, legal conclusions, seller predictions, or guaranteed outcomes.");
    const base:O={conclusion:findings.length?`Watchdog found ${findings.length} evidence-backed review finding${findings.length===1?"":"s"}. The strongest findings are shown first.`:"No evidence-backed finding was produced for this governed scope. Watchdog did not fill the gap with a guess.",evidence,missing_evidence:uniq(missing),caveats:uniq(caveats),suggested_actions:uniq(suggested),sources:[...new Map(sources.map(x=>[x.url,x])).values()]};
    return result.semantic_context?addSemanticFacts(base,result.semantic_context,5):base;
  }
  if(tool==="get_score_history"){
    const rows=Array.isArray(result.rows)?result.rows:[];
    return{conclusion:rows.length?`I found ${rows.length} recorded Watchdog score observation${rows.length===1?"":"s"}.`:"No user-linked Watchdog score history is available for this property yet.",evidence:rows.slice(0,10).map((x:O)=>`${clean(x.marker_id||"Watchdog score",120)}: ${clean(x.score,40)} on ${clean(x.observed_on||x.observed_at,40)}.`),missing_evidence:rows.length?[]:["Historical score observations are not available for this user/property combination."],caveats:["Historical observations keep the formula and model version recorded at the time."],suggested_actions:["review_evidence"],sources:[]};
  }
  if(tool==="get_property_changes"){
    const rows=Array.isArray(result.rows)?result.rows:[];for(const x of rows){const u=safeUrl(x.source_url);if(u)sources.push({label:clean(x.title||x.event_type||"Source",140),url:u})}
    return{conclusion:rows.length?`I found ${rows.length} governed property change event${rows.length===1?"":"s"}.`:"No governed property change events are available for this property in your Watchdog history.",evidence:rows.slice(0,10).map((x:O)=>`${clean(x.title||x.event_type,160)}${x.summary?`: ${clean(x.summary,260)}`:""} (${clean(x.occurred_at,40)}).`),missing_evidence:[],caveats:["A public-record change is not evidence of seller intent or guaranteed financial impact."],suggested_actions:["review_evidence","watch_property"],sources:[...new Map(sources.map(x=>[x.url,x])).values()]};
  }
  if(tool==="inspect_lineage"){
    const f=result.finding;if(!f)return{conclusion:"No owned Intelligence finding is available to inspect for this property.",evidence:[],missing_evidence:["Run Watchdog Intelligence for this property first."],caveats:[],suggested_actions:["run_intelligence_model"],sources:[]};
    for(const x of Array.isArray(f.evidence)?f.evidence:[]){evidence.push(`${clean(x.signal_id,140)}: normalized ${Math.round(Number(x.score||0))}/100${x.value!=null?`, source value ${clean(x.value,80)}`:""}.`);const u=safeUrl(x.source_url);if(u)sources.push({label:clean(x.signal_id,140),url:u})}
    for(const x of Array.isArray(f.missing_evidence)?f.missing_evidence:[])missing.push(`${clean(x.signal_id,140)}: ${clean(x.reason||"missing",120)}.`);
    return{conclusion:`This finding is traceable to run ${clean(f.run_id,60)} and facts hash ${clean(f.facts_hash||"not recorded",32)}.`,evidence,missing_evidence:missing,caveats:["Lineage explains how Watchdog produced a finding. It does not turn a derived signal into a source record."],suggested_actions:["create_case","create_report","watch_property"],sources:[...new Map(sources.map(x=>[x.url,x])).values()]};
  }
  return{conclusion:clean(result.message||"The requested Watchdog action was completed.",500),evidence:Array.isArray(result.evidence)?result.evidence:[],missing_evidence:[],caveats:["The action preserves the source Intelligence lineage for later review."],suggested_actions:[],sources:[]};
}
function extractText(data:O){if(typeof data.output_text==="string")return data.output_text;for(const item of Array.isArray(data.output)?data.output:[])for(const part of Array.isArray(item?.content)?item.content:[])if(typeof part?.text==="string")return part.text;return""}
async function openAIOnce(apiKey:string,model:string,promptRow:O,prompt:string,base:O){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:ctl.signal,headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,reasoning:{effort:"low"},instructions:clean(promptRow.system_contract,5000),input:`User request:\n${prompt}\n\nApproved Watchdog response:\n${JSON.stringify(base).slice(0,30000)}\n\nRewrite only conclusion and caveats for clarity. Do not add facts, evidence, sources, actions, values, probabilities, or claims.`,text:{format:{type:"json_schema",name:"watchdog_analyst_prose",strict:true,schema:{type:"object",additionalProperties:false,properties:{conclusion:{type:"string"},caveats:{type:"array",items:{type:"string"}}},required:["conclusion","caveats"]}}}})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error:any=new Error(clean(data?.error?.message||`OpenAI ${response.status}`,300));error.status=response.status;throw error}
    let parsed:O={};try{parsed=JSON.parse(extractText(data))}catch{}
    return{ok:true,data,response:{...base,conclusion:clean(parsed.conclusion||base.conclusion,1400),caveats:Array.isArray(parsed.caveats)?uniq(parsed.caveats.map((x:unknown)=>clean(x,500))):base.caveats}};
  }finally{clearTimeout(timer)}
}
async function optionalProse(promptRow:O,prompt:string,base:O){
  const apiKey=Deno.env.get("OPENAI_API_KEY")||"";if(!apiKey)return{status:"provider_unavailable",provider:null,model:null,response:base,usage:null,retries:0};
  const model=clean(Deno.env.get("WATCHDOG_ANALYST_MODEL")||promptRow.model||"gpt-5.6-luna",80);let lastError="",retries=0;
  for(let attempt=0;attempt<2;attempt++){
    try{const result=await openAIOnce(apiKey,model,promptRow,prompt,base);return{status:"complete",provider:"openai",model,response:result.response,usage:result.data?.usage||null,retries}}
    catch(error){const status=Number((error as any)?.status||0),transient=status===429||status>=500||String((error as any)?.name||'')==='AbortError'||status===0;lastError=clean((error as any)?.message||error,300);if(attempt===0&&transient){retries++;await sleep(350);continue}break}
  }
  return{status:"provider_unavailable",provider:"openai",model,response:base,usage:null,retries,error:lastError};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return out(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return out(req,503,{error:"Analyst configuration incomplete"});
  const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:authData}=await userClient.auth.getUser(),user=authData?.user;if(!user)return out(req,401,{error:"Session invalid"});
  let body:O={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}const prompt=clean(body.prompt,1800);if(!prompt)return out(req,400,{error:"prompt is required"});const context=safeObj(body.context,20000);
  const [{data:ent},{data:profile},{data:promptRows}]=await Promise.all([admin.from("account_entitlements").select("plan_tier,profession").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),admin.from("intelligence_prompt_versions").select("prompt_key,version,model,system_contract,status").eq("prompt_key","watchdog_analyst").in("status",["preview","live"]).order("version",{ascending:false}).limit(1)]);
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((PLAN_RANK[plan]??0)<PLAN_RANK.pro)return out(req,403,{error:"Pro plan required",minimum_plan:"pro"});const profession=clean(ent?.profession||context.profession||"general",80)||"general";
  const since=new Date(Date.now()-86400000).toISOString(),{count}=await admin.from("intelligence_usage_events").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("event_type","analyst_request").gte("created_at",since);if(Number(count||0)>=(DAILY_LIMIT[plan]||DAILY_LIMIT.pro))return out(req,429,{error:"Watchdog Analyst preview usage limit reached for this rolling 24-hour window."});
  const promptRow=Array.isArray(promptRows)?promptRows[0]:null;if(!promptRow)return out(req,503,{error:"Analyst prompt registry unavailable"});
  let sessionId=clean(body.session_id,80),session:O|null=null;if(sessionId){const q=await admin.from("intelligence_analyst_sessions").select("id,user_id,context,profession").eq("id",sessionId).eq("user_id",user.id).maybeSingle();session=q.data;if(!session)return out(req,404,{error:"Analyst session not found"})}else{const q=await admin.from("intelligence_analyst_sessions").insert({user_id:user.id,profession,context,title:prompt.slice(0,90)}).select("id,context,profession").single();if(q.error||!q.data)return out(req,503,{error:"Could not start Analyst session"});session=q.data;sessionId=String(q.data.id)}
  const blocked=refusal(prompt),userMessage=await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"user",content:{text:prompt},prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:blocked?"refused":"complete"}).select("id").single();
  if(blocked){const response={conclusion:blocked,evidence:[],missing_evidence:[],caveats:["Watchdog did not run a property tool for this request."],suggested_actions:[],sources:[]};await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:response,prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:"refused"});await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:"analyst_request",metadata:{status:"refused",reason:"guardrail",analyst_version:ANALYST_VERSION}});return out(req,200,{ok:true,session_id:sessionId,status:"refused",provider_status:"not_called",response})}
  const routed=route(prompt,{...safeObj(session?.context),...context}),pins=uniq((Array.isArray(context.pams_pins)?context.pams_pins:[]).map((x:unknown)=>clean(x,100))).slice(0,100),started=Date.now();let result:O={},toolStatus="complete";
  try{
    if(routed.tool==="get_property_facts"){
      if(!pins.length)throw new Error("Load or select a governed property before asking Watchdog for property facts.");const factPins=pins.slice(0,routed.compare?5:1),sem=await semanticContext(url,pub,auth,factPins,semanticPacks(prompt,routed.model,context));if(!sem.ok)throw new Error(sem.error);result={semantic_context:sem.data};
      const hashes=(Array.isArray(sem.data?.snapshots)?sem.data.snapshots:[]).map((s:O)=>({pams_pin:s.pams_pin,facts_hash:s.facts_hash||s.snapshot_hash||null}));await admin.from("intelligence_analyst_sessions").update({context:{...safeObj(session?.context),...context,last_semantic_facts:hashes,last_semantic_contract:sem.data?.contract_version||null},updated_at:new Date().toISOString()}).eq("id",sessionId).eq("user_id",user.id);
    }else if(routed.tool==="run_intelligence_model"){
      let fn=routed.model==="closing_review"?"intelligence-closing-run-preview":routed.model==="property_change_priority"?"intelligence-change-run-preview":"intelligence-assessment-run-preview";let payload:O;
      if(routed.savedView){fn="intelligence-workbench-view-preview";payload={model_key:routed.model,scope_id:clean(context.saved_view_id,80),limit:routed.limit}}
      else if(routed.farm)payload={model_key:routed.model,scope_type:"farm",scope_value:{source:"watchdog_analyst"},limit:routed.limit};
      else{if(!pins.length)throw new Error("Load or select governed Workbench properties before asking Watchdog to analyze them.");payload={model_key:routed.model,scope_type:pins.length===1?"property":"custom",scope_value:{source:"watchdog_analyst",compare:routed.compare},pams_pins:pins,limit:routed.limit}}
      const call=await fetch(`${url}/functions/v1/${fn}`,{method:"POST",headers:{Authorization:auth,apikey:pub,"Content-Type":"application/json"},body:JSON.stringify(payload)});result=await call.json().catch(()=>({}));if(!call.ok)throw new Error(clean(result.error||`Intelligence tool failed (${call.status})`,400));
      if(pins.length&&!routed.farm&&!routed.savedView){const sem=await semanticContext(url,pub,auth,pins.slice(0,5),semanticPacks(prompt,routed.model,context));if(sem.ok)result.semantic_context=sem.data;else result.semantic_context_error=sem.error}
      const runId=clean(result.run_id,80);let ids:string[]=[];if(runId){const q=await admin.from("intelligence_findings").select("id").eq("run_id",runId).eq("user_id",user.id).order("rank",{ascending:true}).limit(100);ids=(q.data||[]).map((x:O)=>String(x.id))}
      await admin.from("intelligence_analyst_sessions").update({context:{...safeObj(session?.context),...context,last_run_id:runId||null,last_finding_ids:ids,last_model_key:result?.model?.key||routed.model,last_model_version:result?.model?.version||null,last_semantic_contract:result.semantic_context?.contract_version||null,last_semantic_facts:(Array.isArray(result.semantic_context?.snapshots)?result.semantic_context.snapshots:[]).map((s:O)=>({pams_pin:s.pams_pin,facts_hash:s.facts_hash||s.snapshot_hash||null}))},updated_at:new Date().toISOString()}).eq("id",sessionId).eq("user_id",user.id);
    }else if(routed.tool==="get_score_history"){
      const pin=pins[0];if(!pin)throw new Error("Select one property first.");const q=await admin.from("score_observations").select("marker_id,score,observed_on,observed_at,model_version,evidence_coverage,formula").eq("user_id",user.id).eq("pams_pin",pin).order("observed_at",{ascending:false}).limit(25);if(q.error)throw q.error;result={rows:q.data||[],pams_pin:pin};
    }else if(routed.tool==="get_property_changes"){
      const pin=pins[0];if(!pin)throw new Error("Select one property first.");const q=await admin.from("property_update_events").select("event_type,severity,title,summary,occurred_at,marker_id,old_value,new_value,delta_numeric,source_url").eq("user_id",user.id).eq("pams_pin",pin).order("occurred_at",{ascending:false}).limit(50);if(q.error)throw q.error;result={rows:q.data||[],pams_pin:pin};
    }else{
      const lastIds=Array.isArray(session?.context?.last_finding_ids)?session!.context.last_finding_ids:[],pin=pins[0];let fq=admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,evidence,missing_evidence,recommended_actions,facts_hash,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1);if(lastIds.length)fq=fq.in("id",lastIds);else if(pin)fq=fq.eq("pams_pin",pin);const found=await fq.maybeSingle();if(found.error)throw found.error;const f=found.data;
      if(routed.tool==="inspect_lineage")result={finding:f||null};else{
        if(!ACTIONS.has(routed.tool))throw new Error("That Analyst operation is not approved yet.");if(!f)throw new Error("Run Watchdog Intelligence first so this action has an evidence-backed finding to preserve.");const markers=uniq((Array.isArray(f.evidence)?f.evidence:[]).map((x:O)=>clean(x.signal_id,140)));
        if(routed.tool==="create_case"){const q=await admin.from("professional_cases").insert({user_id:user.id,pams_pin:f.pams_pin,title:`Intelligence Review: ${f.property_address||f.pams_pin}`.slice(0,240),property_address:f.property_address||null,profession,pinned_marker_ids:markers,evidence_snapshot:{kind:"watchdog_intelligence",finding_id:f.id,run_id:f.run_id,score:f.score,confidence:f.confidence,evidence_coverage:f.evidence_coverage,why_now:f.why_now,evidence:f.evidence,missing_evidence:f.missing_evidence,facts_hash:f.facts_hash,captured_at:new Date().toISOString()},notes:"Created by Watchdog Analyst from an evidence-backed finding."}).select("id").single();if(q.error)throw q.error;result={message:"Created a Professional Case from the current evidence-backed finding.",artifact_type:"case",artifact_id:q.data.id,evidence:[`Finding ${f.id}: score ${f.score}, evidence ${f.evidence_coverage}%`]}}
        if(routed.tool==="create_report"){const q=await admin.from("professional_reports").insert({user_id:user.id,pams_pin:f.pams_pin||null,title:`Watchdog Intelligence: ${f.property_address||f.pams_pin||"Review"}`.slice(0,240),profession,preset:"custom",selected_marker_ids:markers,source_manifest:[{source_kind:"watchdog_intelligence_finding",finding_id:f.id,run_id:f.run_id,facts_hash:f.facts_hash,evidence_signals:markers}]}).select("id").single();if(q.error)throw q.error;result={message:"Created a draft Professional Report with the Intelligence lineage attached.",artifact_type:"report",artifact_id:q.data.id,evidence:[`Finding ${f.id}: ${markers.length} evidence signals preserved`]}}
        if(routed.tool==="watch_property"){const ex=await admin.from("saved_properties").select("id").eq("user_id",user.id).eq("pams_pin",f.pams_pin).eq("kind","watch").maybeSingle();let id=ex.data?.id;if(!id){const q=await admin.from("saved_properties").insert({user_id:user.id,pams_pin:f.pams_pin,address:f.property_address||f.pams_pin,kind:"watch",source_ref:`watchdog_analyst:${f.id}`}).select("id").single();if(q.error)throw q.error;id=q.data.id}result={message:"This property is now on your Watchdog watchlist.",artifact_type:"watch",artifact_id:id,evidence:[`Finding ${f.id} remains the source lineage for this action.`]}}
        const run=await admin.from("intelligence_runs").select("model_key,model_version").eq("id",f.run_id).eq("user_id",user.id).maybeSingle();await admin.from("intelligence_outcome_events").insert({finding_id:f.id,run_id:f.run_id,user_id:user.id,event_type:routed.tool==="create_case"?"case_created":routed.tool==="create_report"?"report_created":"watch_started",artifact_type:result.artifact_type,artifact_id:String(result.artifact_id||""),model_key:run.data?.model_key||f.opportunity_type||"unknown",model_version:Number(run.data?.model_version||1),facts_hash:f.facts_hash,signal_snapshot:Array.isArray(f.evidence)?f.evidence:[],metadata:{source:"watchdog_analyst",profession,objective:f.opportunity_type||"general",tool_version:TOOL_VERSION}});
      }
    }
  }catch(error){toolStatus="failed";result={error:clean((error as any)?.message||error,500)}}
  const latency=Date.now()-started,toolCall=await admin.from("intelligence_tool_calls").insert({session_id:sessionId,message_id:userMessage.data?.id||null,user_id:user.id,tool_name:routed.tool,tool_version:TOOL_VERSION,arguments:{model:routed.model,pams_pin_count:pins.length,farm:routed.farm,saved_view:routed.savedView,compare:routed.compare,limit:routed.limit,semantic_packs:routed.tool==="get_property_facts"?semanticPacks(prompt,routed.model,context):null},result_summary:toolStatus==="complete"?{run_id:result.run_id||null,finding_count:result.finding_count??null,artifact_type:result.artifact_type||null,artifact_id:result.artifact_id||null,row_count:Array.isArray(result.rows)?result.rows.length:null,semantic_contract:result.semantic_context?.contract_version||null,semantic_snapshot_count:Array.isArray(result.semantic_context?.snapshots)?result.semantic_context.snapshots.length:null}:{error:result.error},status:toolStatus,duration_ms:latency}).select("id").single();
  if(toolStatus!=="complete"){
    const response={conclusion:"Watchdog could not complete that approved operation.",evidence:[],missing_evidence:[result.error],caveats:["No factual conclusion was generated from a failed tool call."],suggested_actions:[],sources:[]};await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:response,prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:"failed"});await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:"analyst_request",latency_ms:latency,metadata:{status:"failed",tool:routed.tool,analyst_version:ANALYST_VERSION}});return out(req,200,{ok:false,session_id:sessionId,status:"failed",tool:{name:routed.tool,version:TOOL_VERSION,id:toolCall.data?.id||null},provider_status:"not_called",response});
  }
  const base=deterministic(routed.tool,result),provider=await optionalProse(promptRow,prompt,base),messageStatus=provider.status==="complete"?"complete":"provider_unavailable",assistant=await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:provider.response,provider:provider.provider,model:provider.model,prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:messageStatus}).select("id").single();
  await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:"analyst_request",provider:provider.provider,model:provider.model,request_units:1,input_tokens:Number(provider.usage?.input_tokens||0)||null,output_tokens:Number(provider.usage?.output_tokens||0)||null,latency_ms:Date.now()-started,metadata:{status:messageStatus,tool:routed.tool,tool_version:TOOL_VERSION,prompt_version:promptRow.version,analyst_version:ANALYST_VERSION,provider_retries:provider.retries||0,semantic_contract:base.semantic_context?.contract_version||null}});
  return out(req,200,{ok:true,session_id:sessionId,message_id:assistant.data?.id||null,status:messageStatus,provider_status:provider.status,provider:provider.provider,model:provider.model,prompt:{key:promptRow.prompt_key,version:promptRow.version},tool:{name:routed.tool,version:TOOL_VERSION,id:toolCall.data?.id||null},response:provider.response,provider_retries:provider.retries||0,provider_error:provider.error||null});
});
