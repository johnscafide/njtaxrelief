import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row=Record<string,any>;
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const COACH_URL="https://dep.nj.gov/dshw/rhwm/recycle-coach/";
const COORD_URL="https://dep.nj.gov/dshw/rhwm/recycoor/county-municipal-recycling-coordinators/";
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safe=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"});
const respond=(r:Request,s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const district=(tx:Row)=>{const p=clean(tx.pams_pin,100);return /^\d{4}/.test(p)?p.slice(0,4):""};
const families=(r:Row)=>Array.isArray(r.evidence_families)?r.evidence_families.map((x:unknown)=>clean(x,80)):[];
const normalize=(v:unknown)=>clean(v,160).toUpperCase().replace(/\b(TOWNSHIP|TWP\.?|BOROUGH|BORO\.?|CITY|TOWN|VILLAGE)\b/g,"").replace(/[^A-Z0-9]/g,"");
function decodeHtml(s:string){return s.replace(/&amp;/gi,"&").replace(/&nbsp;/gi," ").replace(/&#8217;|&rsquo;/gi,"'").replace(/&#8211;|&ndash;/gi,"-").replace(/&#8212;|&mdash;/gi,"-").replace(/&#\d+;/g," ").replace(/\s+/g," ").trim()}
function textCell(s:string){return decodeHtml(s.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]+>/g," "))}
let coordinatorHtml:string|null=null;
async function coordinatorFor(tx:Row){
  try{
    if(coordinatorHtml===null){const c=new AbortController(),t=setTimeout(()=>c.abort(),5000);try{const r=await fetch(COORD_URL,{signal:c.signal,headers:{accept:"text/html","user-agent":"Watchdog-Transaction/1.0 (+https://www.watchdogindex.com/)"}});coordinatorHtml=r.ok?await r.text():""}finally{clearTimeout(t)}}
    if(!coordinatorHtml)return null;
    const want=normalize(tx.municipality),county=normalize(tx.county);
    for(const row of coordinatorHtml.match(/<tr[\s\S]*?<\/tr>/gi)||[]){
      const cells=(row.match(/<td[\s\S]*?<\/td>/gi)||[]).map(textCell);
      if(cells.length<10)continue;
      const joined=normalize(cells.join(" "));
      if(want&&!joined.includes(want))continue;
      if(county&&!joined.includes(county))continue;
      const email=(row.match(/mailto:([^"'>\s]+)/i)||[])[1]||cells.find(x=>/@/.test(x))||"";
      const phone=cells.find(x=>/(\d{3}).*\d{3}.*\d{4}/.test(x))||"";
      return {municipality:clean(tx.municipality,140),county:clean(tx.county,80),contact_cells:cells.slice(0,18),phone:clean(phone,80)||null,email:clean(email,160)||null,source_url:COORD_URL};
    }
  }catch(e){console.warn("Municipal recycling coordinator parse failed",e)}
  return null;
}
function score(r:Row){
  const f=families(r);if(!f.includes("municipal_services"))return -1;
  if(clean(r.provider_key,80)==="municipal_public_works"&&clean(r.adapter_status,80)==="structured_schedule")return 100;
  if(clean(r.provider_key,80)==="municipal_public_works")return 80;
  if(clean(r.provider_key,80)==="njdep_recycle_coach")return 30;
  return 10;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return respond(req,503,{error:"Municipal services configuration incomplete"});
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:ent},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);
  const plan=profile?.account_role==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}
  const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);if(!ids.length)return respond(req,400,{error:"transaction_ids required"});
  const {data:txs,error:txErr}=await admin.from("transaction_workspaces").select("id,user_id,address,municipality,county,pams_pin,block,lot,qualifier").eq("user_id",user.id).in("id",ids);if(txErr)return respond(req,503,{error:"Transactions unavailable"});
  const dists=[...new Set((txs||[]).map((x:Row)=>district(x)).filter(Boolean))];
  const {data:routes}=dists.length?await admin.from("transaction_provider_registry").select("jurisdiction_key,jurisdiction_name,county,provider_key,provider_label,provider_url,evidence_families,access_mode,adapter_status,source_url,last_verified_at,metadata").eq("jurisdiction_type","municipality").in("jurisdiction_key",dists):{data:[]};
  const routeMap=new Map<string,Row[]>();for(const r of routes||[]){if(score(r)<0)continue;const k=String(r.jurisdiction_key);routeMap.set(k,[...(routeMap.get(k)||[]),r])}
  const now=new Date().toISOString(),results:Row[]=[];
  for(const tx of txs||[]){
    const d=district(tx),candidates=(routeMap.get(d)||[]).sort((a,b)=>score(b)-score(a)),best=candidates[0]||null;
    const structured=candidates.find(r=>clean(r.provider_key,80)==="municipal_public_works"&&clean(r.adapter_status,80)==="structured_schedule")||null;
    const md=structured?safe(structured.metadata):{},coordinator=await coordinatorFor(tx);
    const sources=candidates.slice(0,6).map(r=>({label:clean(r.provider_label,180),url:clean(r.provider_url,1000),provider_key:clean(r.provider_key,80),access_mode:clean(r.access_mode,80),adapter_status:clean(r.adapter_status,80),verified_at:r.last_verified_at||null}));
    if(!sources.some(s=>s.url===COACH_URL))sources.push({label:"NJDEP Recycle Coach",url:COACH_URL,provider_key:"njdep_recycle_coach",access_mode:"official_interactive_schedule",adapter_status:"source_only",verified_at:now});
    const addressResolved=md.address_day_resolved===true&&Boolean(md.address_trash_day||md.trash_day);
    const payload={
      district:d||null,municipality:clean(tx.municipality,140)||best?.jurisdiction_name||null,county:clean(tx.county,80)||best?.county||null,
      service_provider:clean(md.department||structured?.provider_label||best?.provider_label||"NJDEP Recycle Coach",180),
      department_url:clean(md.department_url||structured?.provider_url||best?.provider_url||COACH_URL,1000),
      phone:clean(md.phone,80)||coordinator?.phone||null,
      recycling_coordinator:coordinator,
      schedule_scope:addressResolved?"address":"municipality_or_route",
      address_schedule_resolved:addressResolved,
      trash_day:addressResolved?clean(md.address_trash_day||md.trash_day,100):null,
      trash_routes:Array.isArray(md.trash_routes)?md.trash_routes:[],
      recycling:clean(md.recycling,800)||null,
      bulk_trash:clean(md.bulk_trash,800)||null,
      yard_waste:clean(md.yard_waste,800)||null,
      special_collections:Array.isArray(md.special_collections)?md.special_collections:[],
      official_sources:sources,
      recycle_coach_available:true,
      recycle_coach_url:COACH_URL,
      coordinator_registry_url:COORD_URL,
      last_checked_at:now,
      result_semantics:addressResolved?"Watchdog resolved an authoritative address-level municipal collection schedule.":structured?"Watchdog retrieved authoritative municipal service rules for this municipality. The published source did not safely resolve this address to a specific regular trash day, so Watchdog is not guessing one.":"Watchdog connected the property to its municipality and statewide NJDEP recycling/trash service sources. A property-specific pickup day is shown only when an authoritative address or route match is available."
    };
    const sourceLabel=structured?clean(structured.provider_label,180):best?clean(best.provider_label,180):"NJDEP Recycle Coach";
    const sourceUrl=structured?clean(structured.provider_url,1000):best?clean(best.provider_url,1000):COACH_URL;
    const description=payload.result_semantics;
    const up=await admin.from("transaction_items").upsert({transaction_id:tx.id,user_id:user.id,item_key:"municipal_services",category:"move_in",title:"Municipal services / move-in",description,state:"resolved",evidence_state:"verify",severity:"info",assigned_role:"other",sort_order:96,source_type:structured?"official_structured_service":"official_service_source",source_label:sourceLabel,source_url:sourceUrl,source_checked_at:now,payload,updated_at:now},{onConflict:"transaction_id,item_key"}).select("id").single();
    if(up.error){results.push({transaction_id:tx.id,status:"update_failed",error:up.error.message});continue}
    results.push({transaction_id:tx.id,status:"available",municipality:payload.municipality,address_schedule_resolved:addressResolved,structured:!!structured,service_provider:payload.service_provider});
  }
  return respond(req,200,{ok:true,checked_at:now,results});
});
