import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const ENGINE_VERSION='watchdog-derived-v6-fiscal';
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);
function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}}
function out(req:Request,status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'private, no-store'}})}
function clean(v:any,max=140){return String(v||'').trim().slice(0,max)}
function num(v:any){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function present(v:any){return v!==null&&v!==undefined&&v!==''}
function truth(v:any){return v===true||v===1||v==='1'||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes'}
function clamp(v:number,min=0,max=100){return Math.max(min,Math.min(max,v))}
function round(v:number,p=0){const f=10**p;return Math.round(v*f)/f}
function floodBand(v:any){const z=String(v||'').toUpperCase();if(!z)return 0;if(/^(A|AE|AH|AO|AR|A99|V|VE)/.test(z))return 100;if(/^(X.*0\.2|B)/.test(z))return 66;if(/^(X|C)/.test(z))return 0;return 33}
function positivePct5(v:any){const x=num(v);return x==null?null:clamp(Math.max(0,x)/0.05*100)}
function collectionScore(v:any){const x=num(v);return x==null?null:clamp((x-0.90)/0.10*100)}
function inverseDebtShare(v:any){const x=num(v);return x==null?null:clamp(100-x/0.20*100)}
function signal(v:any,t='bool'){
 if(t==='identity')return clamp(num(v)??0);
 if(t==='inverse_identity')return clamp(100-(num(v)??100));
 if(t==='bool')return truth(v)||(num(v)!=null&&Number(v)>0)?100:0;
 if(t==='flood100')return floodBand(v);
 if(t==='positive_pct5')return positivePct5(v)??0;
 if(t==='inverse_positive_pct5')return 100-(positivePct5(v)??100);
 if(t==='collection90_100')return collectionScore(v)??0;
 if(t==='inverse_share20')return inverseDebtShare(v)??0;
 if(t==='share35'){const x=num(v);return x==null?0:clamp(x/0.35*100)}
 const cap=Number(String(t).replace('count',''))||1;return clamp(((num(v)||0)/cap)*100)
}
const ROW:Record<string,(r:any)=>any>={
 'property.address':r=>r?.address,'property.municipality':r=>r?.town,'property.county':r=>r?.county,'property.zip':r=>r?.zip,'property.block':r=>r?.block,'property.lot':r=>r?.lot,'property.qualifier':r=>r?.qualifier,'property.pams_pin':r=>r?.pams_pin,
 'property.property_class':r=>r?.prop_class,'property.class':r=>r?.prop_class,'property.year_built':r=>r?.year_built,'property.lot_area':r=>r?.acres,'property.acres':r=>r?.acres,'property.units':r=>r?.dwelling_units,
 'property.assessed_value':r=>r?.assessed_value,'property.annual_tax':r=>r?.last_year_tax,'property.land_assessment':r=>r?.land_value,'property.land_value':r=>r?.land_value,'property.improvement_assessment':r=>r?.improvement_value,'property.improvement_value':r=>r?.improvement_value,
 'property.sale_price':r=>r?.last_sale_price,'property.last_sale_price':r=>r?.last_sale_price,'property.sale_date':r=>r?.deed_date??r?.last_sale_year,'property.deed_date':r=>r?.deed_date??r?.last_sale_year,'property.deed_book':r=>r?.deed_book,'property.deed_page':r=>r?.deed_page
};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return out(req,405,{error:'POST required'});
 const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return out(req,401,{error:'Sign in required'});
 const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),{data:who}=await uc.auth.getUser();if(!who.user)return out(req,401,{error:'Session invalid'});
 const {data:pd}=await admin.rpc('watchdog_effective_plan',{p_user_id:who.user.id}),plan=String(pd||'standard');if(!['pro','pro_plus','teams','developer'].includes(plan))return out(req,403,{error:'Pro plan required'});
 let b:any={};try{b=await req.json()}catch{return out(req,400,{error:'Invalid JSON'})}
 const pins=[...new Set((Array.isArray(b.pams_pins)?b.pams_pins:[b.pams_pin]).map((x:any)=>clean(x,80)).filter(Boolean))].slice(0,500),rawIds=[...new Set((Array.isArray(b.marker_ids)?b.marker_ids:[]).map((x:any)=>clean(x)).filter(Boolean))].slice(0,250);
 if(!pins.length||!rawIds.length)return out(req,200,{records:[],markers:{},meta:{},engine_version:ENGINE_VERSION});
 const {data:defs,error:defErr}=await admin.from('derived_formula_registry').select('marker_id,formula,dependencies,confidence,status,explanation,operation,config').eq('status','live');if(defErr)return out(req,503,{error:'Formula registry unavailable'});
 const defMap=new Map((defs||[]).map((d:any)=>[String(d.marker_id),d])),requested=rawIds.filter(id=>defMap.has(id));if(!requested.length)return out(req,200,{records:[],markers:{},meta:{},engine_version:ENGINE_VERSION});
 const rawDeps=new Set<string>(),seen=new Set<string>();const walk=(id:string)=>{if(seen.has(id))return;seen.add(id);const d:any=defMap.get(id);for(const dep of d?.dependencies||[]){if(defMap.has(dep))walk(dep);else rawDeps.add(dep)}};requested.forEach(walk);
 const hr=await fetch(url+'/functions/v1/workbench-hydrate',{method:'POST',headers:{Authorization:auth,apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:pins,marker_ids:[...rawDeps]})});if(!hr.ok)return out(req,503,{error:'Dependency resolver unavailable',status:hr.status});const hydrated=await hr.json();
 const rowMap=new Map((hydrated.records||[]).map((r:any)=>[String(r.pams_pin),r])),markers:any={},meta:any={},now=new Date().toISOString();
 for(const pin of pins){markers[pin]={};meta[pin]={};const row=rowMap.get(pin)||{pams_pin:pin},rawVals:any=hydrated.markers?.[pin]||{},rawMeta:any=hydrated.meta?.[pin]||{},memo=new Map<string,any>(),stack=new Set<string>();
   const rawValue=(dep:string)=>{const rv=ROW[dep]?.(row);if(present(rv))return rv;if(present(rawVals[dep]))return rawVals[dep];const st=rawMeta[dep]?.status;if((dep.startsWith('preflight.')||dep.startsWith('njplus.nj-dca-permits-raw.'))&&st==='source_checked_no_value')return 0;return rv??rawVals[dep]??null};
   const checked=(dep:string)=>{if(present(ROW[dep]?.(row))||present(rawVals[dep]))return true;return ['available','source_checked_no_value'].includes(String(rawMeta[dep]?.status||''))};
   const evalId=(id:string):any=>{if(memo.has(id))return memo.get(id);const d:any=defMap.get(id);if(!d||stack.has(id))return null;stack.add(id);const value=(dep:string)=>defMap.has(dep)?evalId(dep):rawValue(dep);const cfg=d.config||{};let v:any=null;
     if(d.operation==='year_delta'){const x=value(cfg.dep);let y=num(x);if(cfg.date_year&&!y){const m=String(x||'').match(/(19|20)\d{2}/);if(m)y=Number(m[0])}if(y&&y>1600)v=new Date().getUTCFullYear()-y}
     else if(d.operation==='ratio'){const a=num(value(cfg.num)),z=num(value(cfg.den));if(a!=null&&z!=null){if(z===0)v=cfg.zero_as_100&&a===0?100:null;else v=round(a/z*Number(cfg.scale??1),Number(cfg.precision??3))}}
     else if(d.operation==='completeness'){const reqs:any[]=Array.isArray(cfg.requirements)?cfg.requirements:(d.dependencies||[]);if(reqs.length){const ok=(q:any)=>{if(cfg.mode==='checked'&&typeof q==='string')return defMap.has(q)?present(value(q)):checked(q);if(typeof q==='string')return present(value(q));if(q?.all)return q.all.every((x:string)=>present(value(x)));if(q?.ratio){const a=num(value(q.ratio[0])),z=num(value(q.ratio[1]));return a!=null&&z!=null&&z!==0}return false};v=Math.round(reqs.filter(ok).length/reqs.length*100)}}
     else if(d.operation==='inverse'){const x=num(value(cfg.dep));if(x!=null)v=clamp(100-x)}
     else if(d.operation==='permit_closure'){const pc=num(value('preflight.permit_count')),oc=num(value('preflight.open_permit_count'));if(pc!=null||oc!=null){if((pc||0)<=0)v=(oc||0)>0?0:100;else v=Math.round((1-Math.min((oc||0)/pc!,1))*100)}}
     else if(d.operation==='permit_activity'){const pc=num(value('preflight.permit_count')),oc=num(value('preflight.open_permit_count'));if(pc!=null||oc!=null)v=clamp(Math.round(Math.min(pc||0,20)*3+Math.min(oc||0,10)*8))}
     else if(d.operation==='weighted_signals'){const ss:any[]=cfg.signals||[],vals=ss.map(s=>({s,v:value(s.dep)}));if(vals.some(x=>present(x.v)))v=clamp(Math.round(vals.reduce((a,x)=>a+signal(x.v,x.s.transform)*Number(x.s.weight||0)/100,0)))}
     else if(d.operation==='signal_count'||d.operation==='signal_density'){const deps:any[]=d.dependencies||[];if(deps.some(x=>checked(x)||present(value(x)))){const active=deps.filter(x=>x===cfg.flood_dep?floodBand(value(x))>0:(truth(value(x))||(num(value(x))||0)>0)).length;v=d.operation==='signal_count'?active:Math.round(active/deps.length*100)}}
     else if(d.operation==='weighted_scores'){const configured:any[]=cfg.items||[],items:any[]=configured.map((s:any)=>({s,v:value(s.dep)})).filter((x:any)=>present(x.v));if(items.length&&(!cfg.require_all||items.length===configured.length)){const w=items.reduce((a:any,x:any)=>a+Number(x.s.weight||0),0);if(w>0)v=Math.round(items.reduce((a:any,x:any)=>a+signal(x.v,x.s.transform)*Number(x.s.weight||0),0)/w)}}
     else if(d.operation==='tax_rate_position'){const rateDefs:any[]=cfg.rate_deps||[],points=rateDefs.map((x:any)=>({year:Number(x.year),rate:num(value(x.dep))})).filter((x:any)=>Number.isFinite(x.year)&&x.rate!=null&&x.rate>0).sort((a:any,b:any)=>a.year-b.year);if(points.length>=3){const first=points[0],last=points[points.length-1],span=last.year-first.year;if(span>=2){const cagr=Math.pow(last.rate/first.rate,1/span)-1;v=Math.round(100-(positivePct5(cagr)??100))}}}
     else if(d.operation==='municipal_cost_absorption'){const levy=num(value(cfg.levy_dep)),ratable=num(value(cfg.ratable_dep)),collection=num(value(cfg.collection_dep));if(levy!=null&&ratable!=null&&collection!=null){const gap=Math.max(0,levy-ratable),growth=clamp(100-(positivePct5(gap)??100)),collections=collectionScore(collection);if(collections!=null)v=Math.round(growth*0.70+collections*0.30)}}
     else if(d.operation==='fiscal_resilience'){const pressure=num(value(cfg.pressure_dep)),absorption=num(value(cfg.absorption_dep)),collection=num(value(cfg.collection_dep)),debt=num(value(cfg.debt_dep));if(pressure!=null&&absorption!=null&&collection!=null&&debt!=null){const collections=collectionScore(collection),debtScore=inverseDebtShare(debt);if(collections!=null&&debtScore!=null)v=Math.round(clamp(100-pressure)*0.35+clamp(absorption)*0.30+collections*0.20+debtScore*0.15)}}
     stack.delete(id);memo.set(id,v);return v};
   for(const id of requested){const d:any=defMap.get(id),v=evalId(id);if(v!==null&&v!==undefined&&!Number.isNaN(v)){markers[pin][id]=v;meta[pin][id]={status:'available',provider_kind:'derived_governed',source:'Watchdog governed formula registry · '+ENGINE_VERSION,engine_version:ENGINE_VERSION,formula:d.formula,dependencies:d.dependencies,confidence:d.confidence,explanation:d.explanation,observed_at:now}}else meta[pin][id]={status:'dependency_missing',provider_kind:'derived_governed',source:'Watchdog governed formula registry · '+ENGINE_VERSION,engine_version:ENGINE_VERSION,dependencies:d.dependencies,checked_at:now}}
 }
 if(pins.length===1)return out(req,200,{pams_pin:pins[0],values:markers[pins[0]],records:hydrated.records||[],markers,meta,engine_version:ENGINE_VERSION});return out(req,200,{records:hydrated.records||[],markers,meta,engine_version:ENGINE_VERSION});
});