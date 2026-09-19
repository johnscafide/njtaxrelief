const crypto=require('crypto');
const CODE=/^[a-f0-9]{24}$/;
const AUTOMATION_UA=/\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const READ_BUDGETS=[{bucket:'open_house_read_minute',seconds:60,limit:120},{bucket:'open_house_read_hour',seconds:3600,limit:500}];
const WRITE_BUDGETS=[{bucket:'open_house_lead_minute',seconds:60,limit:10},{bucket:'open_house_lead_hour',seconds:3600,limit:40}];
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key}}
function clean(v,n=500){return String(v??'').replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n)}
function hash(req,key){const f=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();return f?crypto.createHmac('sha256',key).update(f).digest('hex'):''}
async function rpc(name,body,c){const r=await fetch(`${c.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${name} http ${r.status}`);const t=await r.text();return t?JSON.parse(t):null}
async function restOne(c,path){const r=await fetch(c.url+'/rest/v1/'+path,{headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,Accept:'application/json'}});if(!r.ok)throw new Error('data lookup failed');const data=await r.json();return Array.isArray(data)?data[0]||null:data||null}
async function event(c,type,h,scope,automation,detail={}){try{await rpc('record_public_request_security_event',{p_event_type:type,p_client_hash:h||null,p_route:'/api/agent-open-house',p_scope:scope||null,p_automation_hint:Boolean(automation),p_detail:detail},c)}catch(e){console.error('agent-open-house security-event',e.message)}}
async function gate(req,code,write){const c=backend(),h=hash(req,c.key);if(!h)throw new Error('client identity unavailable');const automation=AUTOMATION_UA.test(String(req.headers?.['user-agent']||''));if(automation){await event(c,'automation_client_blocked',h,code,true);return{allowed:false,automation,c,h}}for(const b of(write?WRITE_BUDGETS:READ_BUDGETS)){const rows=await rpc('consume_public_request_budget',{p_client_hash:h,p_bucket:b.bucket,p_window_seconds:b.seconds,p_limit:b.limit},c),row=Array.isArray(rows)?rows[0]||{}:rows||{};if(row.allowed!==true){await event(c,'rate_limited',h,code,false);return{allowed:false,retryAfter:60,c,h}}}return{allowed:true,c,h}}
function json(res,status,body){res.statusCode=status;res.end(JSON.stringify(body))}
async function publicEvent(c,code){
  const ev=await restOne(c,'agent_open_houses?event_code=eq.'+encodeURIComponent(code)+'&status=in.(scheduled,open)&select=id,user_id,title,address,city,municipality,county,postal_code,event_at,status&limit=1');
  if(!ev)return null;
  const p=await restOne(c,'profiles?id=eq.'+encodeURIComponent(ev.user_id)+'&select=display_name,full_name,photo_url,avatar_url,pro_agent,account_role&limit=1');
  if(!p)return null;
  if(p.account_role!=='developer'){const e=await restOne(c,'account_entitlements?user_id=eq.'+encodeURIComponent(ev.user_id)+'&select=plan_tier,billing_tier,subscription_status&limit=1'),tier=String(e&&(e.billing_tier||e.plan_tier)||'').toLowerCase().replace('pro+','pro_plus');if(!e||!['active','trialing','past_due','cancel_scheduled'].includes(String(e.subscription_status||''))||!['agent','pro','pro_plus','teams'].includes(tier))return null}
  const a=p.pro_agent&&typeof p.pro_agent==='object'?p.pro_agent:{};
  return{event:{title:ev.title||'Open House',address:ev.address,city:ev.city,municipality:ev.municipality,county:ev.county,postal_code:ev.postal_code,event_at:ev.event_at},agent:{display_name:p.display_name||p.full_name||'Your real estate professional',brokerage_name:a.brokerage_name||null,headshot_url:a.headshot_url||p.photo_url||p.avatar_url||null,brokerage_logo_url:a.brokerage_logo_url||null}};
}
module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{error:'Method not allowed'})}
  const raw=req.method==='GET'?req.query&&req.query.event:req.body&&req.body.event,code=clean(raw,24).toLowerCase();
  if(!CODE.test(code))return json(res,400,{error:'Invalid open-house link.'});
  let access;try{access=await gate(req,code,req.method==='POST')}catch(e){console.error('agent-open-house gate',e.message);res.setHeader('Retry-After','60');return json(res,503,{error:'Open-house access is temporarily unavailable.'})}
  if(access.automation)return json(res,403,{error:'Automated submissions are not supported.'});if(!access.allowed){res.setHeader('Retry-After',String(access.retryAfter||60));return json(res,429,{error:'Request limit exceeded. Please retry later.'})}
  if(req.method==='GET'){try{const data=await publicEvent(access.c,code);if(!data)return json(res,404,{error:'This open house is not currently available.'});return json(res,200,{available:true,...data})}catch(e){console.error('agent-open-house read',e.message);return json(res,503,{error:'Open-house details are temporarily unavailable.'})}}
  const body=req.body&&typeof req.body==='object'?req.body:{};if(clean(body.website,120))return json(res,201,{ok:true});
  const name=clean(body.full_name,120),email=clean(body.email,254).toLowerCase(),phone=clean(body.phone,40);if(!name||(!email&&!phone)||body.contact_consent!==true)return json(res,422,{error:'Name, email or phone, and contact consent are required.'});
  try{const out=await rpc('capture_agent_open_house_lead',{p_event_code:code,p_full_name:name,p_email:email||null,p_phone:phone||null,p_contact_consent:true},access.c);if(!out||out.accepted!==true)return json(res,404,{error:'This open house is not currently accepting visitors.'});return json(res,201,{ok:true})}catch(e){console.error('agent-open-house capture',e.message);return json(res,500,{error:'We could not save your visit right now.'})}
};