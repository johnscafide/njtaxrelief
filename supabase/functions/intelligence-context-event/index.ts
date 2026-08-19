import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION="watchdog-context-event-v2-canonical-lineage";
const EVENTS=new Set(["exposed","opened","useful","not_relevant","dismissed"]);
const LEARNING=new Set(["useful","not_relevant","dismissed"]);
type O=Record<string,any>;
const clean=(v:unknown,n=300)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const env=(j:string,l:string)=>{const raw=Deno.env.get(j)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(l)||""};
function origin(req:Request){const o=req.headers.get("origin")||"";if(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"].includes(o))return o;if(/^https:\/\/njtaxrelief(?:-git)?-[a-z0-9-]+-johnscafides-projects\.vercel\.app$/i.test(o))return o;return"https://njpropertytaxrelief.com"}
const cors=(r:Request)=>({"Access-Control-Allow-Origin":origin(r),"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return out(req,405,{error:"POST required"});
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
 const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return out(req,503,{error:"Context feedback configuration incomplete"});
 const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),{data:au}=await uc.auth.getUser(),user=au?.user;if(!user)return out(req,401,{error:"Session invalid"});
 let body:O={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
 const eventType=clean(body.event_type,40),suggestion=body.suggestion&&typeof body.suggestion==="object"&&!Array.isArray(body.suggestion)?body.suggestion:{};if(!EVENTS.has(eventType))return out(req,400,{error:"Unsupported context event"});
 const suppliedSuggestionId=clean(suggestion.suggestion_id,220),findingId=clean(suggestion.finding_id,80),surface=clean(suggestion.surface||body.surface,80)||"unknown",contextKey=clean(body.context_key,180);if(!findingId)return out(req,409,{error:"This suggestion has no persisted finding lineage"});
 const finding=await admin.from("intelligence_findings").select("id,run_id,user_id,pams_pin,facts_hash,score,confidence,evidence_coverage").eq("id",findingId).eq("user_id",user.id).maybeSingle();if(finding.error||!finding.data)return out(req,404,{error:"Owned Intelligence finding not found"});
 const run=await admin.from("intelligence_runs").select("id,model_key,model_version,user_id").eq("id",finding.data.run_id).eq("user_id",user.id).maybeSingle();if(run.error||!run.data)return out(req,404,{error:"Owned Intelligence run not found"});
 const modelKey=clean(run.data.model_key,100),runId=clean(run.data.id,80),pamsPin=clean(finding.data.pams_pin,120),factsHash=clean(finding.data.facts_hash,180),suggestionId=`${modelKey}:${factsHash||findingId}`;if(suppliedSuggestionId&&suppliedSuggestionId!==suggestionId)return out(req,409,{error:"Suggestion lineage does not match the persisted finding"});
 const [{data:ent},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier,profession").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]),plan=String(profile?.account_role||"")==="developer"?"developer":String(ent?.plan_tier||"standard"),profession=clean(ent?.profession||"general",80)||"general";
 let learning:any=null;if(LEARNING.has(eventType)){
   const lr=await fetch(`${url}/functions/v1/intelligence-learning`,{method:"POST",headers:{Authorization:auth,apikey:pub,"Content-Type":"application/json"},body:JSON.stringify({action:"record",finding_id:findingId,event_type:eventType,profession,objective:modelKey,reason_code:"context_intelligence"})}),ld=await lr.json().catch(()=>({}));if(!lr.ok)return out(req,lr.status,{error:clean(ld?.error||`Learning service returned ${lr.status}`,400)});learning={recorded:true,status:ld?.profile?.status||null,sample_size:ld?.profile?.sample_size??null};
 }
 const usage=await admin.from("intelligence_usage_events").insert({user_id:user.id,plan_tier:plan,event_type:`context_suggestion_${eventType}`,request_units:0,metadata:{version:VERSION,suggestion_id:suggestionId,finding_id:findingId,run_id:runId,model_key:modelKey,model_version:run.data.model_version,surface,pams_pin:pamsPin||null,facts_hash:factsHash||null,context_key:contextKey||null,score:Number(finding.data.score||0),confidence:Number(finding.data.confidence||0),evidence_coverage:Number(finding.data.evidence_coverage||0),learning_recorded:Boolean(learning)}}).select("id,created_at").single();if(usage.error)return out(req,503,{error:"Could not record context event"});
 return out(req,200,{ok:true,version:VERSION,event_type:eventType,usage_event_id:usage.data.id,lineage:{suggestion_id:suggestionId,finding_id:findingId,run_id:runId,model_key:modelKey,model_version:run.data.model_version,pams_pin:pamsPin||null,facts_hash:factsHash||null},learning});
});
