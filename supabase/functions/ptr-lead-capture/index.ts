const allowed = new Set(['http://127.0.0.1:8765','http://localhost:8765','https://nj-property-tax-relief-review.nice-grass-9688.chatgpt.site','https://nj-property-tax-relief-review.jscafs.chatgpt.site']);
const previewOrigin = Deno.env.get('PTR_PREVIEW_ORIGIN');
if (previewOrigin) allowed.add(previewOrigin);
const clean = (v:unknown,n:number)=>typeof v==='string'?v.trim().slice(0,n):'';
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(allowed.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(!allowed.has(origin))return reply(403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'JSON required'});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply(503,{error:'Temporarily unavailable'});
 const apiHeaders={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 try{
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Body required'});let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply(413,{error:'Request too large'});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  let data;try{data=JSON.parse(text);}catch{return reply(400,{error:'Invalid JSON'});}
  if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,{error:'Invalid request'});
  const email=clean(data.email,255).toLowerCase();
  if(data.website)return reply(200,{ok:true});
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||data.contact_consent!==true||data.environment!=='preview'||data.consent_version!=='2026-09-09')return reply(422,{error:'Email and consent are required'});
  const source=clean(data.source_path,300);if(!source.startsWith('/propertytaxrelief/')||source.includes('?')||source.length>=300)return reply(422,{error:'Invalid source'});
  // The gateway verifies the legacy anon JWT. Public callers can only append preview leads.
  // A durable global budget and email budget bound abuse across distributed edge isolates.
  const signing=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',signing,new TextEncoder().encode(email)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  for(const budget of [{p_client_hash:'ptr-preview-global',p_bucket:'ptr_preview_global',p_window_seconds:3600,p_limit:60},{p_client_hash:hash,p_bucket:'ptr_preview_email',p_window_seconds:3600,p_limit:3}]){
   const r=await fetch(`${url}/rest/v1/rpc/consume_public_request_budget`,{method:'POST',headers:apiHeaders,body:JSON.stringify(budget)});if(!r.ok)return reply(503,{error:'Temporarily unavailable'});const v=await r.json(),row=Array.isArray(v)?v[0]:v;if(row?.allowed!==true)return reply(429,{error:'Please try again later'});
  }
  const campaign:Record<string,string>={};for(const k of ['utm_source','utm_medium','utm_campaign']){const v=data.campaign?.[k];if(typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v))campaign[k]=v;}
  const r=await fetch(`${url}/rest/v1/ptr_preview_leads?on_conflict=email,environment`,{method:'POST',headers:{...apiHeaders,Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({email,contact_consent:true,consent_version:'2026-09-09',source_path:source,campaign,environment:'preview'})});
  return r.ok?reply(201,{ok:true}):reply(503,{error:'Could not save your request'});
 }catch{return reply(503,{error:'Could not save your request'});}
});
