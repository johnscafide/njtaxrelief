import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Obj=Record<string,any>;
const RETRY_MINUTES=[1,5,30,120,720];
function namedEnv(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacyName)||"";}
function reply(status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
function clean(v:unknown,max=500){return String(v??"").replace(/[\u0000-\u001f]/g,"").trim().slice(0,max);}
function same(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function publicHttps(v:unknown){try{const u=new URL(String(v||""));if(u.protocol!=="https:")return null;const h=u.hostname.toLowerCase();if(!h||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal"))return null;if(/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(h))return null;const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return null;if(h==="::1"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe80:"))return null;u.username="";u.password="";u.hash="";return u.toString();}catch{return null;}}
async function hmac(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]),sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return Array.from(new Uint8Array(sig)).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function health(db:any,userId:string,connectionId:string,component:string,state:string,reasonCode:string|null,summary:string,details:Obj={}){const now=new Date().toISOString();await db.from("integration_health_states").upsert({user_id:userId,connection_id:connectionId,component,state,reason_code:reasonCode,summary:clean(summary,240)||null,details,observed_at:now,updated_at:now},{onConflict:"user_id,connection_id,component"});}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
  const url=Deno.env.get("SUPABASE_URL")||"",secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!secret)return reply(503,{error:"Integration worker unavailable"});const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const gotAutomation=req.headers.get("x-watchdog-automation-secret")||"",expectedAutomation=Deno.env.get("WATCHDOG_AUTOMATION_SECRET")||Deno.env.get("AGENT_DIGEST_CRON_SECRET")||"",gotWorker=req.headers.get("x-watchdog-worker-token")||"";let authorized=!!expectedAutomation&&same(gotAutomation,expectedAutomation);
  if(!authorized&&gotWorker){const internal=await db.rpc("integration_get_named_secret",{p_name:"integration_delivery_worker_token"});authorized=!internal.error&&same(gotWorker,String(internal.data||""));}
  if(!authorized)return reply(401,{error:"Unauthorized"});
  let body:Obj={};try{body=await req.json()}catch{}const requested=clean(body.delivery_id,80),now=new Date().toISOString();
  let q=db.from("integration_deliveries").select("id,event_id,connection_id,user_id,status,attempt_count,max_attempts,next_attempt_at,manual_replay_count").eq("status","pending").lte("next_attempt_at",now).order("next_attempt_at",{ascending:true}).limit(requested?1:25);if(requested)q=q.eq("id",requested);const due=await q;if(due.error)return reply(503,{error:"Pending deliveries could not be loaded"});
  let delivered=0,retried=0,failed=0,canceled=0,skipped=0;
  for(const d of due.data||[]){
    const attemptNo=Number(d.attempt_count||0)+1,claim=await db.from("integration_deliveries").update({status:"processing",attempt_count:attemptNo,last_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",d.id).eq("status","pending").select("id").maybeSingle();if(claim.error||!claim.data){skipped++;continue;}
    const [cr,er,controlResult]=await Promise.all([
      db.from("integration_connections").select("id,user_id,name,status,direction,outbound_url,outbound_secret_id,event_types").eq("id",d.connection_id).maybeSingle(),
      db.from("integration_events").select("id,event_type,event_key,source,status,payload,occurred_at").eq("id",d.event_id).maybeSingle(),
      db.from("integration_connection_controls").select("outbound_enabled,disabled_event_types,reason").eq("connection_id",d.connection_id).eq("user_id",d.user_id).maybeSingle()
    ]);const c=cr.data,e=er.data,control=controlResult.data;
    if(!c||!e||c.user_id!==d.user_id||c.status!=="active"||!["outbound","bidirectional"].includes(c.direction)||!(c.event_types||[]).includes(e.event_type)){
      await db.from("integration_deliveries").update({status:"canceled",last_error:"Connection inactive or event no longer subscribed",updated_at:new Date().toISOString()}).eq("id",d.id);
      if(c)await health(db,d.user_id,d.connection_id,"connection",c.status==="paused"?"paused":"disabled","connection_inactive","Connection is not available for outbound delivery",{connection_status:c.status,event_type:e?.event_type||null});
      canceled++;continue;
    }
    const disabledTypes=Array.isArray(control?.disabled_event_types)?control.disabled_event_types:[];
    if(control&&(!control.outbound_enabled||disabledTypes.includes(e.event_type))){
      const why=!control.outbound_enabled?"outbound_disabled":"event_type_disabled";
      await db.from("integration_deliveries").update({status:"canceled",last_error:clean(control.reason||"Outbound delivery disabled by Watchdog control plane",500),updated_at:new Date().toISOString()}).eq("id",d.id);
      await health(db,d.user_id,d.connection_id,"connection","disabled",why,control.reason||"Outbound automation paused by Watchdog control plane",{event_type:e.event_type});
      canceled++;continue;
    }
    const destination=publicHttps(c.outbound_url);if(!destination||!c.outbound_secret_id){
      const message="Outbound URL or signing secret unavailable";
      await db.from("integration_deliveries").update({status:"failed",last_error:message,updated_at:new Date().toISOString()}).eq("id",d.id);
      await health(db,d.user_id,d.connection_id,"delivery","failing","destination_unavailable",message,{event_type:e.event_type});
      failed++;continue;
    }
    const sec=await db.rpc("integration_get_secret",{p_secret_id:c.outbound_secret_id});if(sec.error||!sec.data){
      const message="Signing secret unavailable";
      await db.from("integration_deliveries").update({status:"failed",last_error:message,updated_at:new Date().toISOString()}).eq("id",d.id);
      await health(db,d.user_id,d.connection_id,"delivery","failing","signing_secret_unavailable",message,{event_type:e.event_type});
      failed++;continue;
    }
    const timestamp=Math.floor(Date.now()/1000).toString(),payload={schema_version:"2026-08-19",delivery_id:d.id,event_id:e.id,event_type:e.event_type,event_key:e.event_key,occurred_at:e.occurred_at,source:e.source||"watchdog",data:e.payload||{}},raw=JSON.stringify(payload),signature=await hmac(String(sec.data),`${timestamp}.${raw}`),started=Date.now();let ok=false,status:number|null=null,excerpt="",errorCode="";
    try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),res=await fetch(destination,{method:"POST",redirect:"manual",signal:controller.signal,headers:{"Content-Type":"application/json","User-Agent":"Watchdog-Integrations/1.0","X-Watchdog-Event":e.event_type,"X-Watchdog-Delivery":d.id,"X-Watchdog-Connection":c.id,"X-Watchdog-Timestamp":timestamp,"X-Watchdog-Signature":`v1=${signature}`,"Idempotency-Key":e.id},body:raw});clearTimeout(timer);status=res.status;excerpt=clean(await res.text(),500);ok=res.status>=200&&res.status<300;if(!ok)errorCode=`http_${res.status}`;}catch(err){errorCode=err instanceof DOMException&&err.name==="AbortError"?"timeout":"network_error";excerpt=clean(err instanceof Error?err.message:err,500);}
    const duration=Date.now()-started;if(ok){
      await Promise.all([
        db.from("integration_deliveries").update({status:"delivered",delivered_at:new Date().toISOString(),last_http_status:status,last_error:null,updated_at:new Date().toISOString()}).eq("id",d.id),
        db.from("integration_delivery_attempts").insert({delivery_id:d.id,user_id:d.user_id,attempt_no:attemptNo,status:"delivered",response_status:status,response_excerpt:excerpt||null,duration_ms:duration}),
        db.from("integration_connections").update({last_outbound_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("id",c.id),
        health(db,d.user_id,d.connection_id,"delivery","healthy","delivery_succeeded","Outbound delivery is healthy",{event_type:e.event_type,http_status:status,duration_ms:duration})
      ]);delivered++;continue;
    }
    const exhausted=attemptNo>=Number(d.max_attempts||5),mins=RETRY_MINUTES[Math.min(attemptNo-1,RETRY_MINUTES.length-1)],next=new Date(Date.now()+mins*60000).toISOString(),message=clean(excerpt||errorCode||"Delivery failed",500);
    await Promise.all([
      db.from("integration_deliveries").update({status:exhausted?"failed":"pending",next_attempt_at:next,last_http_status:status,last_error:message,updated_at:new Date().toISOString()}).eq("id",d.id),
      db.from("integration_delivery_attempts").insert({delivery_id:d.id,user_id:d.user_id,attempt_no:attemptNo,status:"failed",response_status:status,response_excerpt:excerpt||null,error_code:errorCode||null,duration_ms:duration}),
      db.from("integration_connections").update({last_error:message,updated_at:new Date().toISOString()}).eq("id",c.id),
      health(db,d.user_id,d.connection_id,"delivery",exhausted?"failing":"degraded",errorCode||"delivery_failed",exhausted?"Outbound delivery exhausted automatic retries":"Outbound delivery will retry automatically",{event_type:e.event_type,http_status:status,error:message,attempt_no:attemptNo,max_attempts:d.max_attempts,next_attempt_at:exhausted?null:next,duration_ms:duration})
    ]);if(exhausted)failed++;else retried++;
  }
  return reply(200,{ok:true,processed:(due.data||[]).length,delivered,retried,failed,canceled,skipped,run_at:new Date().toISOString()});
});
