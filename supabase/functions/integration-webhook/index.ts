import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Obj=Record<string,any>;
const MAX_BODY=262144;
function namedEnv(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacyName)||"";}
function reply(status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
function clean(v:unknown,max=200){return String(v??"").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function same(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function arr(v:unknown,max=30){return Array.isArray(v)?[...new Set(v.map(x=>clean(x,80)).filter(Boolean))].slice(0,max):[];}
function email(v:unknown){const x=clean(v,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)?x:null;}
function phone(v:unknown){const x=clean(v,40);return /^[+()\d .-]{7,40}$/.test(x)?x:null;}
function eventType(v:unknown){const x=clean(v,100).toLowerCase();return x==="integration.test"||/^crm\.(contact|activity|lead|property)\.[a-z0-9_.-]{1,60}$/.test(x)?x:null;}
function parseDate(v:unknown){if(!v)return null;const d=new Date(String(v));return Number.isFinite(d.getTime())?d.toISOString():null;}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
  const length=Number(req.headers.get("content-length")||0);if(length>MAX_BODY)return reply(413,{error:"Payload too large"});
  const url=Deno.env.get("SUPABASE_URL")||"",secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!secret)return reply(503,{error:"Integration service unavailable"});const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const u=new URL(req.url),connectionId=clean(req.headers.get("x-watchdog-connection")||u.searchParams.get("connection"),80);if(!/^[0-9a-f-]{36}$/i.test(connectionId))return reply(400,{error:"Connection identifier required"});
  const {data:c,error:ce}=await admin.from("integration_connections").select("id,user_id,name,status,direction,inbound_token_hash,scopes,intelligence_access").eq("id",connectionId).maybeSingle();if(ce||!c||c.status!=="active"||!["inbound","bidirectional"].includes(c.direction))return reply(404,{error:"Connection unavailable"});
  const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""),token=clean(req.headers.get("x-watchdog-token")||bearer,500);if(!token||!c.inbound_token_hash)return reply(401,{error:"Webhook token required"});const tokenHash=await sha256(token);if(!same(tokenHash,String(c.inbound_token_hash)))return reply(401,{error:"Webhook token invalid"});if(!(c.scopes||[]).includes("crm.context.ingest"))return reply(403,{error:"Connection does not allow CRM context ingestion"});
  const raw=await req.text();if(raw.length>MAX_BODY)return reply(413,{error:"Payload too large"});let body:Obj;try{body=JSON.parse(raw)}catch{return reply(400,{error:"Invalid JSON"})}if(!body||typeof body!=="object"||Array.isArray(body))return reply(400,{error:"JSON object required"});
  const type=eventType(body.event_type);if(!type)return reply(400,{error:"Unsupported event_type"});const suppliedKey=clean(body.event_id||req.headers.get("x-idempotency-key"),180),eventKey=suppliedKey||`sha256:${await sha256(raw)}`;
  const contact=(body.contact&&typeof body.contact==="object"&&!Array.isArray(body.contact)?body.contact:{}) as Obj,property=(body.property&&typeof body.property==="object"&&!Array.isArray(body.property)?body.property:{}) as Obj;
  const externalContactId=clean(contact.id||body.external_contact_id,180),propertyRef=clean(contact.property_ref||property.pams_pin||property.id,180)||null,propertyAddress=clean(contact.property_address||property.address,220)||null;
  if(type!=="integration.test"&&!externalContactId)return reply(400,{error:"contact.id is required for CRM context events"});
  const sanitized={event_type:type,event_id:eventKey,contact:externalContactId?{id:externalContactId,name:clean(contact.name,180)||null,email:email(contact.email),phone:phone(contact.phone),lead_stage:clean(contact.lead_stage||body.lead_stage,100)||null,relationship:clean(contact.relationship||body.relationship,100)||null,last_activity_at:parseDate(contact.last_activity_at||body.last_activity_at),tags:arr(contact.tags||body.tags)}:null,property:(propertyRef||propertyAddress)?{ref:propertyRef,address:propertyAddress,municipality:clean(property.municipality,120)||null,county:clean(property.county,120)||null}:null,source_updated_at:parseDate(body.source_updated_at)};
  const inserted=await admin.from("integration_events").insert({user_id:c.user_id,connection_id:c.id,direction:"inbound",event_type:type,event_key:eventKey,source:"customer.crm",status:"accepted",payload:sanitized,occurred_at:new Date().toISOString()}).select("id").single();
  if(inserted.error){if((inserted.error as any).code==="23505")return reply(200,{ok:true,duplicate:true,event_key:eventKey});return reply(503,{error:"Inbound event could not be recorded"});}
  if(type!=="integration.test"){
    let q=admin.from("integration_crm_context").select("id").eq("user_id",c.user_id).eq("connection_id",c.id).eq("external_contact_id",externalContactId);q=propertyRef?q.eq("property_ref",propertyRef):q.is("property_ref",null);const existing=await q.limit(1).maybeSingle();
    const patch={user_id:c.user_id,connection_id:c.id,external_contact_id:externalContactId,property_ref:propertyRef,property_address:propertyAddress,contact_name:sanitized.contact?.name||null,contact_email:sanitized.contact?.email||null,contact_phone:sanitized.contact?.phone||null,lead_stage:sanitized.contact?.lead_stage||null,relationship:sanitized.contact?.relationship||null,last_activity_at:sanitized.contact?.last_activity_at||null,tags:sanitized.contact?.tags||[],context:{municipality:sanitized.property?.municipality||null,county:sanitized.property?.county||null,event_type:type,intelligence_eligible:!!c.intelligence_access},source_updated_at:sanitized.source_updated_at||null,updated_at:new Date().toISOString()};
    const saved=existing.data?.id?await admin.from("integration_crm_context").update(patch).eq("id",existing.data.id).eq("user_id",c.user_id):await admin.from("integration_crm_context").insert(patch);if(saved.error){await admin.from("integration_events").update({status:"rejected"}).eq("id",inserted.data.id);return reply(503,{error:"CRM context could not be stored"});}
  }
  await Promise.all([admin.from("integration_connections").update({last_inbound_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("id",c.id),admin.from("integration_audit_log").insert({user_id:c.user_id,connection_id:c.id,action:"webhook.inbound.accepted",actor:"external",details:{event_type:type,event_id:inserted.data.id}})]);
  return reply(202,{ok:true,event_id:inserted.data.id,event_type:type});
});
