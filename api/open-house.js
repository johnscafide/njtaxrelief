const crypto=require('crypto');
const CODE_RE=/^[a-z0-9]{16,40}$/;
const AUTOMATION_UA=/\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
function backend(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('security backend unavailable');return{url,key}}
function clean(v,n){return String(v??'').trim().slice(0,n)}
function clientHash(req,key){const f=String(req.headers?.['x-forwarded-for']||'').split(',')[0].trim();return f?crypto.createHmac('sha256',key).update(f).digest('hex'):''}
async function rpc(name,body,c){const r=await fetch(`${c.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${name} http ${r.status}`);const t=await r.text();return t?JSON.parse(t):null}
async function rest(path,c){const r=await fetch(c.url+'/rest/v1/'+path,{headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,Accept:'application/json'}});if(!r.ok)throw new Error('data http '+r.status);return r.json()}
async function gate(req,code,write){const c=backend(),h=clientHash(req,c.key);if(!h)throw new Error('client identity unavailable');const automation=AUTOMATION_UA.test(String(req.headers?.['user-agent']||''));if(automation)return{allowed:false,automation,c,h};const rows=await rpc('consume_public_request_budget',{p_client_hash:h,p_bucket:write?'open_house_lead_minute':'open_house_view_minute',p_window_seconds:60,p_limit:write?12:40},c),row=Array.isArray(rows)?rows[0]||{}:rows||{};return{allowed:row.allowed===true,c,h,retryAfter:60}}
module.exports=async function handler(req,res){
res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
const body=req.body&&typeof req.body==='object'?req.body:{},code=clean(req.method==='GET'?req.query?.code:body.code,40).toLowerCase();
if(!CODE_RE.test(code))return res.status(400).json({error:'A valid open-house code is required.'});
let access;try{access=await gate(req,code,req.method==='POST')}catch(e){console.error('open-house gate',e.message);return res.status(503).json({error:'Open-house check-in is temporarily unavailable.'})}
if(access.automation)return res.status(403).json({error:'Automated access is not supported.'});if(!access.allowed){res.setHeader('Retry-After','60');return res.status(429).json({error:'Please wait and try again.'})}
if(req.method==='GET'){
 try{
   const rows=await rest('agent_open_houses?select=id,user_id,title,address,city,municipality,county,postal_code,event_at,status,pams_pin&event_code=eq.'+encodeURIComponent(code)+'&limit=1',access.c),event=rows[0];
   if(!event)return res.status(404).json({error:'This open house is unavailable.'});
   const profs=await rest('profiles?select=id,pro_agent,photo_url,avatar_url&id=eq.'+encodeURIComponent(event.user_id)+'&limit=1',access.c),p=profs[0]||{},brand=p.pro_agent&&typeof p.pro_agent==='object'?p.pro_agent:{};
   return res.status(200).json({event:{id:event.id,title:event.title||'Open House',address:event.address,city:event.city,municipality:event.municipality,county:event.county,postal_code:event.postal_code,event_at:event.event_at,status:event.status},agent:{brokerage_name:brand.brokerage_name||null,business_phone:brand.business_phone||null,business_email:brand.business_email||null,photo_url:brand.headshot_url||p.photo_url||p.avatar_url||null}});
 }catch(e){console.error('open-house get',e.message);return res.status(500).json({error:'Open-house details could not load.'})}
}
if(req.method==='POST'){
 if(clean(body.website,100))return res.status(201).json({ok:true});
 const name=clean(body.full_name,120),email=clean(body.email,254).toLowerCase(),phone=clean(body.phone,40);
 if(!name||(!email&&!phone)||body.contact_consent!==true)return res.status(422).json({error:'Name, contact method and consent are required.'});
 try{const out=await rpc('capture_agent_open_house_lead_v1',{p_event_code:code,p_full_name:name,p_email:email||null,p_phone:phone||null,p_contact_consent:true},access.c);if(!out?.accepted)return res.status(404).json({error:'This open house is not accepting check-ins.'});return res.status(201).json({ok:true})}catch(e){console.error('open-house post',e.message);return res.status(500).json({error:'We could not save your check-in right now.'})}
}
res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});
};