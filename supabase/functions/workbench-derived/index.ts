import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { derive, DERIVED_ENGINE_VERSION, isGovernedDerived, derivedDependencies } from '../workbench-hydrate/derived-engine.ts';
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);
function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}}
function out(req:Request,status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'private, no-store'}})}
function clean(v:any,max=140){return String(v||'').trim().slice(0,max)}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
 if(req.method!=='POST')return out(req,405,{error:'POST required'});
 const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return out(req,401,{error:'Sign in required'});
 const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),{data:who}=await uc.auth.getUser();if(!who.user)return out(req,401,{error:'Session invalid'});
 const {data:pd}=await admin.rpc('watchdog_effective_plan',{p_user_id:who.user.id}),plan=String(pd||'standard');if(!['pro','pro_plus','teams','developer'].includes(plan))return out(req,403,{error:'Pro plan required'});
 let b:any={};try{b=await req.json()}catch{return out(req,400,{error:'Invalid JSON'})}
 const pins=[...new Set((Array.isArray(b.pams_pins)?b.pams_pins:[b.pams_pin]).map((x:any)=>clean(x,80)).filter(Boolean))].slice(0,500);
 const requested=[...new Set((Array.isArray(b.marker_ids)?b.marker_ids:[]).map((x:any)=>clean(x)).filter((x:string)=>isGovernedDerived(x)))].slice(0,250);
 if(!pins.length||!requested.length)return out(req,200,{records:[],markers:{},meta:{},engine_version:DERIVED_ENGINE_VERSION});
 const rawDeps=new Set<string>(),seen=new Set<string>();
 const walk=(id:string)=>{if(seen.has(id))return;seen.add(id);for(const dep of derivedDependencies(id)){if(isGovernedDerived(dep))walk(dep);else rawDeps.add(dep)}};
 requested.forEach(walk);
 let hydrated:any={records:[],markers:{},meta:{}};
 if(rawDeps.size){
   const hr=await fetch(url+'/functions/v1/workbench-hydrate',{method:'POST',headers:{Authorization:auth,apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:pins,marker_ids:[...rawDeps]})});
   if(!hr.ok)return out(req,503,{error:'Dependency resolver unavailable',status:hr.status});
   hydrated=await hr.json();
 }
 const rowMap=new Map((hydrated.records||[]).map((r:any)=>[String(r.pams_pin),r])),markers:any={},meta:any={},now=new Date().toISOString();
 for(const pin of pins){
   markers[pin]={};meta[pin]={};const row=rowMap.get(pin)||{pams_pin:pin},depValues:any=hydrated.markers?.[pin]||{};
   const local=new Map<string,any>(Object.entries(depValues));
   const getter=(k:string)=>local.get(k);
   for(const id of requested){const d=derive(id,getter,row);if(d){markers[pin][id]=d.v;local.set(id,d.v);meta[pin][id]={status:'available',provider_kind:'derived_governed',source:'Watchdog governed formula engine · '+DERIVED_ENGINE_VERSION,engine_version:DERIVED_ENGINE_VERSION,formula:d.formula,dependencies:d.dependencies,confidence:d.confidence,explanation:d.explanation,observed_at:now}}else meta[pin][id]={status:'dependency_missing',provider_kind:'derived_governed',source:'Watchdog governed formula engine · '+DERIVED_ENGINE_VERSION,engine_version:DERIVED_ENGINE_VERSION,checked_at:now}}
 }
 if(pins.length===1)return out(req,200,{pams_pin:pins[0],values:markers[pins[0]],markers,meta,records:hydrated.records||[],engine_version:DERIVED_ENGINE_VERSION});
 return out(req,200,{records:hydrated.records||[],markers,meta,engine_version:DERIVED_ENGINE_VERSION});
});
