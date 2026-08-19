import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Obj=Record<string,any>;
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const PLANS=new Set(["pro_plus","teams","developer"]);
const FIELDS=["contact_name","lead_stage","relationship","last_activity_at","tags","property_ref","property_address","source","system_source","deal_type","assigned_agent_id","assigned_agent_external_id","source_updated_at","updated_at"];
function clean(v:unknown,max=220){return String(v??"").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);}
function namedEnv(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacyName)||"";}
function cors(req:Request){const o=req.headers.get("origin")||"";const allow=ORIGINS.has(o)||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)?o:"https://njpropertytaxrelief.com";return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function out(req:Request,status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}});}
function plan(v:unknown){return clean(v,30).toLowerCase().replace("pro+","pro_plus")||"standard";}
function safeContext(v:unknown){const x=v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};return{source:clean(x.source,120)||null,system_source:clean(x.system_source,120)||null,deal_type:clean(x.deal_type,100)||null,assigned_agent_id:x.assigned_agent_id==null?null:clean(x.assigned_agent_id,80),assigned_agent_external_id:clean(x.assigned_agent_external_id,120)||null};}
function publicRow(x:Obj,providerByConnection:Map<string,Obj>){const c=safeContext(x.context),conn=providerByConnection.get(String(x.connection_id))||{};return{crm_context_id:x.id,connection_id:x.connection_id,provider:clean(conn.provider||c.source||"crm",80),account_label:clean(conn.external_account_label||conn.name||"CRM",120),contact_name:clean(x.contact_name,180)||null,lead_stage:clean(x.lead_stage,100)||null,relationship:clean(x.relationship,100)||null,last_activity_at:x.last_activity_at||null,tags:Array.isArray(x.tags)?x.tags.map((t:unknown)=>clean(t,80)).filter(Boolean).slice(0,20):[],property_ref:clean(x.property_ref,120)||null,property_address:clean(x.property_address,220)||null,source:c.source,system_source:c.system_source,deal_type:c.deal_type,assigned_agent_id:c.assigned_agent_id,assigned_agent_external_id:c.assigned_agent_external_id,source_updated_at:x.source_updated_at||null,updated_at:x.updated_at||null};}
async function hash(v:string){if(!v)return null;const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,24);}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return out(req,405,{error:"Method not allowed"});
  const origin=req.headers.get("origin")||"";if(origin&&!ORIGINS.has(origin)&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))return out(req,403,{error:"Origin not allowed"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return out(req,503,{error:"CRM Intelligence service unavailable"});
  const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userDb.auth.getUser();if(authError||!authData.user)return out(req,401,{error:"Session could not be verified"});const user=authData.user;
  const {data:ent,error:entError}=await userDb.rpc("get_my_entitlement");if(entError)return out(req,403,{error:"Plan could not be verified"});const erow=Array.isArray(ent)?ent[0]:ent,p=plan(erow?.plan_tier);if(!PLANS.has(p))return out(req,403,{error:"CRM-aware Watchdog Intelligence requires Pro+ with an authorized integration or Teams",required_plan:"pro_plus",plan:p});
  let body:Obj={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}
  const mode=["overview","property","search"].includes(clean(body.mode,20))?clean(body.mode,20):"overview",limit=Math.max(1,Math.min(Number(body.limit||10),50)),search=clean(body.query,160),sessionId=clean(body.session_id,80)||null,pins=[...new Set((Array.isArray(body.pams_pins)?body.pams_pins:[]).map((x:unknown)=>clean(x,120)).filter((x:string)=>/^\d{4}_.+/.test(x)))].slice(0,50);
  if(mode==="property"&&!pins.length)return out(req,400,{error:"A governed Watchdog property is required for property-scoped CRM context"});
  if(mode==="search"&&!search)return out(req,400,{error:"Search text is required"});

  const {data:connections,error:connError}=await admin.from("integration_connections").select("id,provider,name,external_account_label,scopes,intelligence_access,status").eq("user_id",user.id).eq("status","active").eq("intelligence_access",true);if(connError)return out(req,503,{error:"Authorized CRM connections could not be loaded"});
  const allowed=(connections||[]).filter((c:Obj)=>Array.isArray(c.scopes)&&c.scopes.includes("intelligence.context.read"));if(!allowed.length)return out(req,403,{error:"CRM context is not authorized for Watchdog Intelligence",permission_required:true});
  const connectionIds=allowed.map((c:Obj)=>String(c.id)),providerByConnection=new Map(allowed.map((c:Obj)=>[String(c.id),c]));
  await admin.rpc("integration_refresh_explicit_crm_links",{p_user_id:user.id,p_connection_id:null});

  let contextIds:string[]|null=null,verifiedLinks:Obj[]=[];
  if(mode==="property"){
    const links=await admin.from("integration_crm_property_links").select("crm_context_id,pams_pin,link_method,confidence,status").eq("user_id",user.id).eq("status","verified").in("pams_pin",pins).in("connection_id",connectionIds).limit(250);
    if(links.error)return out(req,503,{error:"CRM property relationships could not be loaded"});verifiedLinks=links.data||[];contextIds=[...new Set(verifiedLinks.map((x:Obj)=>String(x.crm_context_id)))];
  }

  let q=admin.from("integration_crm_context").select("id,connection_id,contact_name,lead_stage,relationship,last_activity_at,tags,property_ref,property_address,context,source_updated_at,updated_at").eq("user_id",user.id).in("connection_id",connectionIds).order("source_updated_at",{ascending:false,nullsFirst:false}).order("updated_at",{ascending:false}).limit(limit);
  if(contextIds!==null){if(!contextIds.length){q=q.in("id",["00000000-0000-0000-0000-000000000000"]);}else q=q.in("id",contextIds);}
  if(mode==="search"){
    const escaped=search.replace(/[%_,]/g," ").trim();q=q.or(`contact_name.ilike.%${escaped}%,lead_stage.ilike.%${escaped}%,relationship.ilike.%${escaped}%`);
  }
  const rows=await q;if(rows.error)return out(req,503,{error:"CRM context could not be loaded"});
  const totalQ=await admin.from("integration_crm_context").select("*",{count:"exact",head:true}).eq("user_id",user.id).in("connection_id",connectionIds);
  const linkedQ=await admin.from("integration_crm_property_links").select("*",{count:"exact",head:true}).eq("user_id",user.id).eq("status","verified").in("connection_id",connectionIds);
  const safeRows=(rows.data||[]).map((x:Obj)=>publicRow(x,providerByConnection));
  const stages:Record<string,number>={};for(const x of safeRows){const k=x.lead_stage||"Unspecified";stages[k]=(stages[k]||0)+1;}
  const fp=await hash(search.toLowerCase());
  await admin.from("intelligence_crm_access_log").insert({user_id:user.id,session_id:sessionId&&/^[0-9a-f-]{36}$/i.test(sessionId)?sessionId:null,connection_ids:connectionIds,access_mode:mode,record_count:safeRows.length,property_scope_count:pins.length,fields_returned:FIELDS,query_fingerprint:fp});
  await admin.from("integration_audit_log").insert({user_id:user.id,connection_id:connectionIds.length===1?connectionIds[0]:null,action:"intelligence.crm_context.read",actor:"user",details:{mode,record_count:safeRows.length,authorized_connection_count:connectionIds.length,property_scope_count:pins.length,query_fingerprint:fp}});
  return out(req,200,{ok:true,mode,plan:p,permission:{authorized:true,connection_count:allowed.length,connections:allowed.map((c:Obj)=>({id:c.id,provider:c.provider,label:c.external_account_label||c.name}))},summary:{authorized_records:Number(totalQ.count||0),verified_property_links:Number(linkedQ.count||0),returned_records:safeRows.length,returned_stage_mix:stages},property_scope:pins,verified_links:verifiedLinks,records:safeRows,truth_policy:{crm_authority:"relationship_and_workflow_context_only",watchdog_authority:"governed_property_facts",property_links:"explicit_or_user_verified_only",seller_intent_inference:false},privacy:{email_returned:false,phone_returned:false,raw_crm_payload_returned:false,external_prose_provider_required:false}});
});
