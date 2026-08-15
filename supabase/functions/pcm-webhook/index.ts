import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function clean(v:unknown,max=200){return String(v??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max)}
function bytesToHex(bytes:Uint8Array){return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')}
function bytesToBase64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function constantTimeEqual(a:string,b:string){const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let x=0;for(let i=0;i<aa.length;i++)x|=aa[i]^bb[i];return x===0}
async function sha256Hex(text:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return bytesToHex(new Uint8Array(d))}
async function hmacSha256(secret:string,text:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));return new Uint8Array(sig)}
function normalizedProvidedSignature(raw:string){return raw.trim().replace(/^sha256=/i,'')}
function contract(){return{secret:Deno.env.get('PCM_WEBHOOK_SIGNATURE_SECRET')||'',header:clean(Deno.env.get('PCM_WEBHOOK_SIGNATURE_HEADER')||'',100).toLowerCase(),format:clean(Deno.env.get('PCM_WEBHOOK_SIGNATURE_FORMAT')||'',60).toLowerCase()}}
function eventType(payload:any){return clean(payload?.eventType??payload?.event_type??payload?.type??payload?.event??payload?.status,120)||'pcm.webhook'}
function providerEventKey(payload:any,rawHash:string){return clean(payload?.eventId??payload?.event_id??payload?.webhookId??payload?.webhook_id??payload?.id,180)||rawHash}

Deno.serve(async(req)=>{
  if(req.method==='GET'){
    const c=contract();
    return json(200,{provider:'pcm',receiver:'ready',signature_contract_ready:Boolean(c.secret&&c.header&&['hmac-sha256-hex','hmac-sha256-base64'].includes(c.format)),signature_header_configured:Boolean(c.header),signature_format:c.format||null,processing_mode:'inbox_only_until_pcm_payload_contract_verified'});
  }
  if(req.method!=='POST')return json(405,{error:'Method not allowed'});
  const c=contract();
  if(!c.secret||!c.header||!['hmac-sha256-hex','hmac-sha256-base64'].includes(c.format))return json(503,{error:'PCM webhook signature contract is not configured yet',code:'PCM_WEBHOOK_SIGNATURE_CONTRACT_PENDING'});
  const providedRaw=req.headers.get(c.header)||'';
  if(!providedRaw)return json(401,{error:'Missing PCM webhook signature',code:'PCM_WEBHOOK_SIGNATURE_MISSING'});
  const raw=await req.text();
  if(!raw)return json(400,{error:'Empty webhook body'});
  const mac=await hmacSha256(c.secret,raw);
  const expected=c.format==='hmac-sha256-base64'?bytesToBase64(mac):bytesToHex(mac);
  const provided=normalizedProvidedSignature(providedRaw);
  if(!constantTimeEqual(expected,provided))return json(401,{error:'Invalid PCM webhook signature',code:'PCM_WEBHOOK_SIGNATURE_INVALID'});
  let payload:any;try{payload=JSON.parse(raw)}catch{return json(400,{error:'Webhook body must be JSON'})}
  const rawHash=await sha256Hex(raw),key=providerEventKey(payload,rawHash),type=eventType(payload);
  const admin=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});
  const saved=await admin.from('marketing_provider_webhook_events').upsert({provider_key:'pcm',event_key:key,event_type:type,signature_verified:true,payload,raw_body_sha256:rawHash,status:'received_unmapped'},{onConflict:'provider_key,event_key',ignoreDuplicates:true}).select('id,status').maybeSingle();
  if(saved.error){console.error('PCM_WEBHOOK_INBOX_ERROR',saved.error);return json(503,{error:'Webhook inbox unavailable'})}
  return json(202,{accepted:true,event_key:key,status:'received_unmapped',duplicate:!saved.data});
});
