import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION = "watchdog-analyst-v1";
const TOOL_VERSION = "watchdog-analyst-tools-v1";
const ORIGINS = new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const DAILY_LIMIT:Record<string,number>={pro:75,pro_plus:300,teams:1500,developer:10000};
const ALLOWED_ACTIONS=new Set(["create_case","create_report","watch_property"]);

type Json=Record<string,unknown>;
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://njpropertytaxrelief.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const reply=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const clean=(v:unknown,n=1200)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const env=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(l)||""};
const safeObj=(v:unknown,max=25000):Json=>{if(!v||typeof v!=="object"||Array.isArray(v))return{};try{return JSON.stringify(v).length<=max?v as Json:{} }catch{return{}}};
const uniq=(a:string[])=>[...new Set(a.filter(Boolean))];
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null};
function safeUrl(v:unknown){try{const u=new URL(String(v||""));return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}}
function guard(prompt:string){
  const targeting=/\b(find|rank|target|filter|exclude|include|prioritize|prospect)\b/i.test(prompt);
  const protectedTerms=/\b(race|racial|ethnicity|ethnic|religion|religious|disability|disabled|familial status|families with children|national origin|sex|gender|sexual orientation|pregnan|marital status)\b/i.test(prompt);
  if(targeting&&protectedTerms)return "Watchdog cannot rank, target, include, or exclude housing opportunities using protected or sensitive personal characteristics.";
  if(/\b(likely to sell|will sell|motivated seller|distressed owner|desperate owner|foreclosure likelihood|divorce|death|health condition)\b/i.test(prompt))return "Watchdog does not infer seller intent, personal distress, private life events, or a person’s likelihood to transact.";
  if(/\b(guarantee|guaranteed|certain profit|sure profit|guaranteed appeal|win probability)\b/i.test(prompt))return "Watchdog cannot guarantee profits, appeal outcomes, values, or transaction results. It can show governed evidence and user-controlled scenarios.";
  return null;
}
function intent(prompt:string,context:Json){
  const p=prompt.toLowerCase();
  let action:string|null=null;
  if(/\b(create|open|start)\b.*\bcase\b/.test(p))action="create_case";
  else if(/\b(create|draft|start)\b.*\breport\b/.test(p))action="create_report";
  else if(/\b(watch|monitor|track)\b.*\b(property|this|result|finding)\b/.test(p))action="watch_property";
  let tool="run_intelligence_model",model="assessment_anomaly";
  if(action)tool=action;
  else if(/\b(score history|historical score|score trend)\b/.test(p))tool="get_score_history";
  else if(/\b(source|formula|lineage|where did|why flagged|why this)\b/.test(p))tool="inspect_lineage";
  else if(/\b(changed|changes|recent change|what changed|update history)\b/.test(p)&&!/\b(rank|top|find|priority|prioritize)\b/.test(p))tool="get_property_changes";
  if(/\b(closing|permit|title|due diligence|transaction exception)\b/.test(p))model="closing_review";
  else if(/\b(change intelligence|recent changes|material changes|changed properties)\b/.test(p))model="property_change_priority";
  const compare=/\bcompare\b/.test(p);
  const countMatch=p.match(/\b(?:top|find|show|rank)\s+(\d{1,3})\b/),limit=Math.max(1,Math.min(Number(countMatch?.[1]||10),50));
  let scopeType="custom",scopeValue:Json={source:"watchdog_analyst"};
  if(/\bfarm\b/.test(p)){scopeType="farm";scopeValue={source:"agent_farm_properties",requested_by:"watchdog_analyst"}}
  else if(/\bsaved view\b|\bworkbench view\b/.test(p)&&context.saved_view_id){scopeType="workbench_view";scopeValue={scope_id:clean(context.saved_view_id,80)}}
  else if(Array.isArray(context.pams_pins)&&context.pams_pins.length===1)scopeType="property";
  return{tool,model,compare,limit,scopeType,scopeValue,action};
}
function deterministic(tool:string,result:any){
  const evidence:string[]=[],missing:string[]=[],caveats:string[]=[],actions:string[]=[],sources:{label:string,url:string|null}[]=[];
  if(tool==="run_intelligence_model"){
    const findings=Array.isArray(result?.findings)?result.findings:[];
    const top=findings.slice(0,Math.min(findings.length,5));
    for(const f of top){
      const label=clean(f.property_address||f.pams_pin||"Property",180);
      const why=Array.isArray(f.why_now)?f.why_now:[];
      evidence.push(`${label}: Watchdog review score ${Math.round(Number(f.score||0))}/100, confidence ${Math.round(Number(f.confidence||0))}%, evidence ${Math.round(Number(f.evidence_coverage||0))}%.`);
      for(const w of why.slice(0,2))evidence.push(`${label}: ${clean(w.signal_id,140)} normalized ${Math.round(Number(w.score||0))}/100${w.explanation?` — ${clean(w.explanation,260)}`:""}.`);
      for(const m of (Array.isArray(f.missing_evidence)?f.missing_evidence:[]).slice(0,3))missing.push(`${label}: ${clean(m.signal_id,140)} (${clean(m.reason||"missing",120)}).`);
      for(const e of (Array.isArray(f.evidence)?f.evidence:[])){const u=safeUrl(e.source_url);if(u)sources.push({label:clean(e.signal_id||e.source_key||"Source",140),url:u})}
      for(const a of (Array.isArray(f.recommended_actions)?f.recommended_actions:[]))actions.push(clean(a,80));
    }
    if(result?.warning)caveats.push(clean(result.warning,400));
    caveats.push("Scores rank evidence for review. They are not valuations, legal conclusions, seller predictions, or guaranteed outcomes.");
    const conclusion=findings.length?`Watchdog found ${findings.length} evidence-backed review finding${findings.length===1?"":"s"}. The strongest ${findings.length===1?"finding is":"findings are"} shown first.`:"No evidence-backed finding was produced for this governed scope. Watchdog did not fill the gap with a guess.";
    return{conclusion,evidence,missing_evidence:uniq(missing),caveats:uniq(caveats),suggested_actions:uniq(actions),sources:[...new Map(sources.map(x=>[x.url,x])).values()]};
  }
  if(tool==="get_score_history"){
    const rows=Array.isArray(result?.rows)?result.rows:[];
    return{conclusion:rows.length?`I found ${rows.length} recorded Watchdog score observation${rows.length===1?"":"s"} for this property.`:"No user-linked Watchdog score history is available for this property yet.",evidence:rows.slice(0,8).map((x:any)=>`${clean(x.marker_id||"Watchdog score",120)}: ${clean(x.score,40)} on ${clean(x.observed_on||x.observed_at,40)}.`),missing_evidence:rows.length?[]:["Historical score observations are not available for this user/property combination."],caveats:["Historical scores reflect the model/formula version recorded at the time and are not rewritten retroactively."],suggested_actions:["review_evidence"],sources:[]};
  }
  if(tool==="get_property_changes"){
    const rows=Array.isArray(result?.rows)?result.rows:[];
    return{conclusion:rows.length?`I found ${rows.length} governed property change event${rows.length===1?"":"s"} in your Watchdog history.`:"No governed property change events are available for this property in your Watchdog history.",evidence:rows.slice(0,10).map((x:any)=>`${clean(x.title||x.event_type,160)}${x.summary?` — ${clean(x.summary,300)}`:""} (${clean(x.occurred_at,40)}).`),missing_evidence:[],caveats:["A recorded change is a public-record update, not evidence of seller intent or a guaranteed financial impact."],suggested_actions:["review_evidence","watch_property"],sources:[...new Map(rows.map((x:any)=>{const u=safeUrl(x.source_url);return u?[u,{label:clean(x.title||x.event_type||"Source",140),url:u}]:null}).filter(Boolean) as any).values()] as any};
  }
  if(tool==="inspect_lineage"){
    const f=result?.finding;
    if(!f)return{conclusion:"No owned Intelligence finding is available to inspect for this property.",evidence:[],missing_evidence:["Run Watchdog Intelligence for this property first."],caveats:[],suggested_actions:["run_intelligence_model"],sources:[]};
    for(const e of Array.isArray(f.evidence)?f.evidence:[]){evidence.push(`${clean(e.signal_id,140)}: normalized ${Math.round(Number(e.score||0))}/100${e.value!=null?`, source value ${clean(e.value,80)}`:""}.`);const u=safeUrl(e.source_url);if(u)sources.push({label:clean(e.signal_id,140),url:u})}
    for(const m of Array.isArray(f.missing_evidence)?f.missing_evidence:[])missing.push(`${clean(m.signal_id,140)}: ${clean(m.reason||"missing",120)}.`);
    return{conclusion:`This finding is traceable to run ${clean(f.run_id,60)} and facts hash ${clean(f.facts_hash||"not recorded",32)}.`,evidence,missing_evidence:missing,caveats:["Lineage explains how Watchdog produced the review finding; it does not turn a derived signal into a source record."],suggested_actions:["create_case","create_report","watch_property"],sources:[...new Map(sources.map(x=>[x.url,x])).values()]};
  }
  if(ALLOWED_ACTIONS.has(tool))return{conclusion:clean(result?.message||"The requested Watchdog action was completed.",400),evidence:Array.isArray(result?.evidence)?result.evidence:[],missing_evidence:[],caveats:["The action preserves the source Intelligence lineage for later review."],suggested_actions:[],sources:[]};
  return{conclusion:"Watchdog completed the approved tool request.",evidence:[],missing_evidence:[],caveats:[],suggested_actions:[],sources:[]};
}
async function maybeOpenAI(promptRow:any,prompt:string,base:any,toolSummary:any){
  const key=Deno.env.get("OPENAI_API_KEY")||"";
  if(!key)return{provider_status:"provider_unavailable",provider:null,model:null,response:base,usage:null};
  const model=clean(Deno.env.get("WATCHDOG_ANALYST_MODEL")||promptRow?.model||"gpt-5.6-luna",80);
  const schema=promptRow?.response_schema&&typeof promptRow.response_schema==="object"?promptRow.response_schema:{};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:controller.signal,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,reasoning:{effort:"low"},instructions:clean(promptRow?.system_contract,5000),input:[{role:"user",content:[{type:"input_text",text:`User request:\n${prompt}\n\nApproved Watchdog tool result:\n${JSON.stringify(toolSummary).slice(0,40000)}\n\nDeterministic safe response to preserve:\n${JSON.stringify(base).slice(0,30000)}\n\nRewrite only the conclusion and caveats for clarity. Do not add facts, sources, evidence, missing evidence, actions, values, or claims.`}]}],text:{format:{type:"json_schema",name:"watchdog_analyst_response",schema,strict:true}}})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(clean(data?.error?.message||`OpenAI ${r.status}`,300));
    const text=String(data?.output_text||"").trim();let parsed:any={};try{parsed=JSON.parse(text)}catch{}
    const response={...base,conclusion:clean(parsed?.conclusion||base.conclusion,1400),caveats:Array.isArray(parsed?.caveats)?uniq(parsed.caveats.map((x:unknown)=>clean(x,500))):base.caveats};
    return{provider_status:"complete",provider:"openai",model,response,usage:data?.usage||null};
  }catch(e){return{provider_status:"provider_unavailable",provider:"openai",model,response:base,usage:null,error:clean((e as any)?.message||e,300)}}finally{clearTimeout(timer)}
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return reply(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return reply(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!publishable||!secret)return reply(req,503,{error:"Analyst configuration incomplete"});
  const uc=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:au}=await uc.auth.getUser(),user=au?.user;if(!user)return reply(req,401,{error:"Session invalid"});
  let body:any={};try{body=await req.json()}catch{return reply(req,400,{error:"Invalid JSON"})}
  const prompt=clean(body?.prompt,1800);if(!prompt)return reply(req,400,{error:"prompt is required"});
  const context=safeObj(body?.context,20000),blocked=guard(prompt);
  const [{data:ent},{data:profile},{data:promptRows}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role,profession").eq("id",user.id).maybeSingle(),admin.from("intelligence_prompt_versions").select("prompt_key,version,provider,model,system_contract,response_schema,tool_manifest,status").eq("prompt_key","watchdog_analyst").in("status",["preview","live"]).order("version",{ascending:false}).limit(1)]);
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro)return reply(req,403,{error:"Pro plan required",minimum_plan:"pro"});
  const dayAgo=new Date(Date.now()-86400000).toISOString(),{count:used}=await admin.from("intelligence_usage_events").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("event_type","analyst_request").gte("created_at",dayAgo),limit=DAILY_LIMIT[plan]||DAILY_LIMIT.pro;if(Number(used||0)>=limit)return reply(req,429,{error:"Watchdog Analyst preview usage limit reached for this rolling 24-hour window.",retry_after_seconds:3600});
  const promptRow=Array.isArray(promptRows)?promptRows[0]:null;if(!promptRow)return reply(req,503,{error:"Analyst prompt registry unavailable"});
  let sessionId=clean(body?.session_id,80),session:any=null;
  if(sessionId){const r=await admin.from("intelligence_analyst_sessions").select("id,user_id,context,profession").eq("id",sessionId).eq("user_id",user.id).maybeSingle();session=r.data;if(!session)return reply(req,404,{error:"Analyst session not found"})}
  else{const r=await admin.from("intelligence_analyst_sessions").insert({user_id:user.id,profession:clean(profile?.profession||context.profession||"general",80),context,title:prompt.slice(0,90)}).select("id,user_id,context,profession").single();if(r.error||!r.data)return reply(req,503,{error:"Could not start Analyst session"});session=r.data;sessionId=String(r.data.id)}
  const um=await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"user",content:{text:prompt},prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:blocked?"refused":"complete"}).select("id").single();
  if(blocked){await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:{conclusion:blocked,evidence:[],missing_evidence:[],caveats:["Watchdog only supports property-level and professional workflow analysis that does not use protected or sensitive personal attributes."],suggested_actions:[],sources:[]},prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:"refused"});await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:"analyst_request",request_units:1,metadata:{status:"refused",reason:"guardrail"}});return reply(req,200,{ok:true,session_id:sessionId,status:"refused",provider_status:"not_called",response:{conclusion:blocked,evidence:[],missing_evidence:[],caveats:["Watchdog did not run a property tool for this request."],suggested_actions:[],sources:[]}})}
  const start=Date.now(),parsed=intent(prompt,{...safeObj(session?.context),...context}),contextPins=uniq((Array.isArray(context.pams_pins)?context.pams_pins:[]).map((x:unknown)=>clean(x,100))).slice(0,100);
  let toolResult:any={};let toolStatus="complete";
  try{
    if(parsed.tool==="run_intelligence_model"){
      if(parsed.scopeType!=="farm"&&!contextPins.length)throw new Error("Load or select governed Workbench properties before asking Watchdog to analyze them.");
      const fn=parsed.model==="closing_review"?"intelligence-closing-run-preview":parsed.model==="property_change_priority"?"intelligence-change-run-preview":"intelligence-assessment-run-preview";
      const tr=await fetch(`${url}/functions/v1/${fn}`,{method:"POST",headers:{Authorization:auth,apikey:publishable,"Content-Type":"application/json"},body:JSON.stringify(parsed.scopeType==="farm"?{model_key:parsed.model,scope_type:"farm",scope_value:parsed.scopeValue,limit:parsed.limit}:{model_key:parsed.model,scope_type:contextPins.length===1?"property":"custom",scope_value:{...parsed.scopeValue,compare:parsed.compare},pams_pins:contextPins,limit:parsed.limit})});toolResult=await tr.json().catch(()=>({}));if(!tr.ok)throw new Error(clean(toolResult?.error||`Intelligence tool failed (${tr.status})`,400));
      const ids=(Array.isArray(toolResult?.findings)?toolResult.findings:[]).map((f:any)=>f?.id).filter(Boolean);await admin.from("intelligence_analyst_sessions").update({context:{...safeObj(session?.context),...context,last_run_id:toolResult?.run_id||null,last_finding_ids:ids,last_model_key:toolResult?.model?.key||parsed.model},updated_at:new Date().toISOString()}).eq("id",sessionId).eq("user_id",user.id);
    } else if(parsed.tool==="get_score_history"){
      const pin=contextPins[0];if(!pin)throw new Error("Select one property first.");const r=await admin.from("score_observations").select("marker_id,score,observed_on,observed_at,model_version,evidence_coverage,formula").eq("user_id",user.id).eq("pams_pin",pin).order("observed_at",{ascending:false}).limit(25);if(r.error)throw r.error;toolResult={rows:r.data||[],pams_pin:pin};
    } else if(parsed.tool==="get_property_changes"){
      const pin=contextPins[0];if(!pin)throw new Error("Select one property first.");const r=await admin.from("property_update_events").select("event_type,severity,title,summary,occurred_at,marker_id,old_value,new_value,delta_numeric,source_url").eq("user_id",user.id).eq("pams_pin",pin).order("occurred_at",{ascending:false}).limit(50);if(r.error)throw r.error;toolResult={rows:r.data||[],pams_pin:pin};
    } else if(parsed.tool==="inspect_lineage"){
      const lastIds=Array.isArray(session?.context?.last_finding_ids)?session.context.last_finding_ids:[],pin=contextPins[0];let q=admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,score,confidence,evidence_coverage,why_now,evidence,missing_evidence,recommended_actions,facts_hash,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1);if(lastIds.length)q=q.in("id",lastIds);else if(pin)q=q.eq("pams_pin",pin);const r=await q.maybeSingle();if(r.error)throw r.error;toolResult={finding:r.data||null};
    } else if(ALLOWED_ACTIONS.has(parsed.tool)){
      const lastIds=Array.isArray(session?.context?.last_finding_ids)?session.context.last_finding_ids:[],pin=contextPins[0];let q=admin.from("intelligence_findings").select("id,run_id,pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,evidence,missing_evidence,recommended_actions,facts_hash,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1);if(lastIds.length)q=q.in("id",lastIds);else if(pin)q=q.eq("pams_pin",pin);const fr=await q.maybeSingle(),f=fr.data;if(fr.error||!f)throw new Error("Run Watchdog Intelligence first so this action has an evidence-backed finding to preserve.");const markers=uniq((Array.isArray(f.evidence)?f.evidence:[]).map((e:any)=>clean(e?.signal_id,140)));
      if(parsed.tool==="create_case"){const r=await admin.from("professional_cases").insert({user_id:user.id,pams_pin:f.pams_pin,title:`Intelligence Review · ${f.property_address||f.pams_pin}`.slice(0,240),property_address:f.property_address||null,profession:clean(profile?.profession||session?.profession||"general",80),pinned_marker_ids:markers,evidence_snapshot:{kind:"watchdog_intelligence",finding_id:f.id,run_id:f.run_id,score:f.score,confidence:f.confidence,evidence_coverage:f.evidence_coverage,why_now:f.why_now,evidence:f.evidence,missing_evidence:f.missing_evidence,facts_hash:f.facts_hash,captured_at:new Date().toISOString()},notes:"Created by Watchdog Analyst from an evidence-backed finding. Review the underlying evidence before making a professional conclusion."}).select("id").single();if(r.error)throw r.error;toolResult={message:"Created a Professional Case from the current evidence-backed finding.",artifact_type:"case",artifact_id:r.data.id,evidence:[`Finding ${f.id} · score ${f.score} · evidence ${f.evidence_coverage}%`]}}
      if(parsed.tool==="create_report"){const r=await admin.from("professional_reports").insert({user_id:user.id,pams_pin:f.pams_pin||null,title:`Watchdog Intelligence · ${f.property_address||f.pams_pin||"Review"}`.slice(0,240),profession:clean(profile?.profession||session?.profession||"general",80),preset:"custom",selected_marker_ids:markers,source_manifest:[{source_kind:"watchdog_intelligence_finding",finding_id:f.id,run_id:f.run_id,facts_hash:f.facts_hash,evidence_signals:markers}]}).select("id").single();if(r.error)throw r.error;toolResult={message:"Created a draft Professional Report with the Intelligence lineage attached.",artifact_type:"report",artifact_id:r.data.id,evidence:[`Finding ${f.id} · ${markers.length} evidence signals preserved`]}}
      if(parsed.tool==="watch_property"){const existing=await admin.from("saved_properties").select("id").eq("user_id",user.id).eq("pams_pin",f.pams_pin).eq("kind","watch").maybeSingle();let id=existing.data?.id;if(!id){const r=await admin.from("saved_properties").insert({user_id:user.id,pams_pin:f.pams_pin,address:f.property_address||f.pams_pin,kind:"watch",source_ref:`watchdog_analyst:${f.id}`}).select("id").single();if(r.error)throw r.error;id=r.data.id}toolResult={message:"This property is now on your Watchdog watchlist.",artifact_type:"watch",artifact_id:id,evidence:[`Finding ${f.id} remains the source lineage for this action.`]}}
      await admin.from("intelligence_outcome_events").insert({finding_id:f.id,run_id:f.run_id,user_id:user.id,event_type:parsed.tool==="create_case"?"case_created":parsed.tool==="create_report"?"report_created":"watch_started",artifact_type:toolResult.artifact_type,artifact_id:String(toolResult.artifact_id||""),model_key:clean(session?.context?.last_model_key||f.opportunity_type||"unknown",140),model_version:Number(session?.context?.last_model_version||1),facts_hash:f.facts_hash,signal_snapshot:Array.isArray(f.evidence)?f.evidence:[],metadata:{source:"watchdog_analyst",tool_version:TOOL_VERSION}});
    } else throw new Error("That Analyst operation is not approved yet.");
  }catch(e){toolStatus="failed";toolResult={error:clean((e as any)?.message||e,500)}}
  const duration=Date.now()-start;const tc=await admin.from("intelligence_tool_calls").insert({session_id:sessionId,message_id:um.data?.id||null,user_id:user.id,tool_name:parsed.tool,tool_version:TOOL_VERSION,arguments:{model:parsed.model,scope_type:parsed.scopeType,scope_value:parsed.scopeValue,pams_pin_count:contextPins.length,compare:parsed.compare,limit:parsed.limit},result_summary:toolStatus==="complete"?{run_id:toolResult?.run_id||null,finding_count:toolResult?.finding_count??null,artifact_type:toolResult?.artifact_type||null,artifact_id:toolResult?.artifact_id||null,row_count:Array.isArray(toolResult?.rows)?toolResult.rows.length:null}:{error:toolResult.error},status:toolStatus,duration_ms:duration}).select("id").single();
  if(toolStatus!=="complete"){const response={conclusion:"Watchdog could not complete that approved operation.",evidence:[],missing_evidence:[toolResult.error],caveats:["No factual conclusion was generated from a failed tool call."],suggested_actions:[],sources:[]};await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:response,prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status:"failed"});await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:"analyst_request",request_units:1,latency_ms:duration,metadata:{status:"failed",tool:parsed.tool}});return reply(req,200,{ok:false,session_id:sessionId,status:"failed",tool:{name:parsed.tool,version:TOOL_VERSION,id:tc.data?.id||null},provider_status:"not_called",response})}
  const base=deterministic(parsed.tool,toolResult),provider=await maybeOpenAI(promptRow,prompt,base,{tool:parsed.tool,version:TOOL_VERSION,result:toolResult}),status=provider.provider_status==="complete"?"complete":"provider_unavailable";
  const am=await admin.from("intelligence_analyst_messages").insert({session_id:sessionId,user_id:user.id,role:"assistant",content:provider.response,provider:provider.provider,model:provider.model,prompt_key:promptRow.prompt_key,prompt_version:promptRow.version,tool_contract_version:TOOL_VERSION,status}).select("id").single();
  const inputTokens=num(provider.usage?.input_tokens),outputTokens=num(provider.usage?.output_tokens);await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:"analyst_request",provider:provider.provider,model:provider.model,request_units:1,input_tokens:inputTokens,output_tokens:outputTokens,latency_ms:Date.now()-start,metadata:{status,tool:parsed.tool,tool_version:TOOL_VERSION,prompt_version:promptRow.version}});
  return reply(req,200,{ok:true,session_id:sessionId,message_id:am.data?.id||null,status,provider_status:provider.provider_status,provider:provider.provider,model:provider.model,prompt:{key:promptRow.prompt_key,version:promptRow.version},tool:{name:parsed.tool,version:TOOL_VERSION,id:tc.data?.id||null},response:provider.response,provider_error:provider.error||null});
});
