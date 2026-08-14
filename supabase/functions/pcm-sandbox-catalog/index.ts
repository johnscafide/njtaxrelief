import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const PCM='https://v3.pcmintegrations.com';
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);

function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store','Vary':'Origin'}}
function reply(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8'}})}
function clean(v:unknown,max=240){return String(v??'').trim().replace(/[\u0000-\u001f]/g,'').slice(0,max)}
function tokenFrom(d:any){return clean(d?.token??d?.accessToken??d?.access_token??d?.code,4000)}
async function token(){const apiKey=Deno.env.get('PCM_SANDBOX_API_KEY')||'',apiSecret=Deno.env.get('PCM_API_SECRET')||'';if(!apiKey||!apiSecret)throw new Error('PCM sandbox credentials are incomplete');const r=await fetch(PCM+'/auth/login',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({apiKey,apiSecret})});const text=await r.text();let d:any={};try{d=JSON.parse(text)}catch{}const t=tokenFrom(d);if(!r.ok||!t)throw new Error(`PCM sandbox login failed (${r.status})`);return t}
function primitives(obj:any){if(!obj||typeof obj!=='object'||Array.isArray(obj))return{};const out:Record<string,unknown>={};for(const [k,v] of Object.entries(obj)){if(Object.keys(out).length>=14)break;if(['string','number','boolean'].includes(typeof v)||v===null)out[k]=typeof v==='string'?clean(v,180):v}return out}
function rows(data:any){if(Array.isArray(data))return data;if(!data||typeof data!=='object')return[];for(const k of ['data','items','results','orders','batches','designs','records'])if(Array.isArray(data[k]))return data[k];return[]}
function summary(data:any){const list=rows(data);return{count:list.length,sample:list.slice(0,12).map(primitives),top_level:Array.isArray(data)?['array']:Object.keys(data||{}).slice(0,20)}}
async function getRoute(t:string,path:string){const r=await fetch(PCM+path,{headers:{Authorization:`Bearer ${t}`,Accept:'application/json'}});const text=await r.text();let d:any=null;try{d=JSON.parse(text)}catch{d={}};return{path,status:r.status,ok:r.ok,...summary(d)}}
function designMatch(data:any,id:string){const target=String(id).trim();if(!target)return false;for(const row of rows(data)){for(const k of ['id','designID','designId','design_id'])if(String(row?.[k]??'')===target)return true}return false}

Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return reply(req,405,{error:'Method not allowed'});const origin=req.headers.get('origin')||'';if(origin&&!ORIGINS.has(origin))return reply(req,403,{error:'Origin not allowed'});const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return reply(req,401,{error:'Sign in required'});const client=createClient(URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const{data:{user},error:authError}=await client.auth.getUser();if(authError||!user)return reply(req,401,{error:'Session could not be verified'});const access=await client.rpc('marketing_studio_bootstrap');if(access.error)return reply(req,403,{error:'Marketing Studio access required'});let body:any={};try{body=await req.json()}catch{};const action=clean(body.action||'catalog',40);let t='';try{t=await token()}catch(e){return reply(req,502,{error:clean(e instanceof Error?e.message:e,300)})}
if(action==='catalog'){const [designs,orders,batches]=await Promise.all([getRoute(t,'/design'),getRoute(t,'/order'),getRoute(t,'/batch')]);return reply(req,200,{environment:'sandbox',read_only:true,checked_at:new Date().toISOString(),designs,orders,batches})}
if(action==='design.validate'){const id=clean(body.design_id,100);if(!id)return reply(req,400,{error:'design_id is required'});const r=await fetch(PCM+'/design',{headers:{Authorization:`Bearer ${t}`,Accept:'application/json'}});const text=await r.text();let d:any={};try{d=JSON.parse(text)}catch{};return reply(req,200,{environment:'sandbox',read_only:true,design_id:id,valid:r.ok&&designMatch(d,id),http_status:r.status,catalog_count:rows(d).length})}
return reply(req,400,{error:'Unknown action'});
});
