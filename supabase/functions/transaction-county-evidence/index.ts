import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row=Record<string,any>;
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const ADAPTER_RANK:Record<string,number>={live:50,review_required:35,source_only:25,adapter_pending:15,provider_missing:0};
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safe=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const countyKey=(v:unknown)=>clean(v,100).replace(/\s+county$/i,"").trim().toUpperCase();
const title=(v:unknown)=>clean(v,100).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const cors=(r:Request)=>({"Access-Control-Allow-Origin":"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"});
const out=(r:Request,s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
async function hash(v:unknown){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function families(r:Row){return Array.isArray(r.evidence_families)?r.evidence_families.map((x:unknown)=>clean(x,80)):[]}
function label(r:Row,county:string){const raw=clean(r.provider_label,180);if(!raw||/click here|register|subscription|premium access/i.test(raw))return `${title(county)} County Clerk / Recorder`;return raw}
function routeText(r:Row){return `${clean(r.provider_label,220)} ${clean(r.provider_url,600)} ${clean(r.source_url,600)} ${clean(r.provider_key,120)}`.toLowerCase()}
function isNoise(r:Row){return /military|veteran|standard[- ]form[- ]180|passport|election|voter|medical[- ]emergency|payment[- ]program[- ]for[- ]aliens|roadway[- ]capital|completed[- ]projects/.test(routeText(r))}
function score(r:Row,wanted:string[]){
 if(isNoise(r))return -10000;
 let s=ADAPTER_RANK[clean(r.adapter_status,40)]??5;
 const fs=families(r);for(let i=0;i<wanted.length;i++){if(fs.includes(wanted[i]))s+=140-(i*14)}
 const key=clean(r.provider_key,80),access=clean(r.access_mode,100),hay=routeText(r);
 if(key==='search_portal'||fs.includes('search_portal'))s+=80;
 if(key==='clerk_land_records')s+=30;if(key==='deeds_mortgages')s+=20;if(key==='liens')s+=20;
 if(access==='official_public_search')s+=55;else if(/public|guest|free/.test(access))s+=15;
 if(/press|recordsng|searchanywhere|uslandrecords|public records search|online property records|land records/.test(hay))s+=45;
 if(/recording fees|about the county clerk|history of|requirements for|cover sheets|e-recording registration|e-recordings/.test(hay))s-=45;
 return s;
}
function bestRoute(rows:Row[],wanted:string[]){return [...rows].filter(r=>r.provider_url&&!isNoise(r)).sort((a,b)=>score(b,wanted)-score(a,wanted)||label(a,'').localeCompare(label(b,'')))[0]||null}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return out(req,405,{error:"POST required"});
 const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return out(req,401,{error:"Sign in required"});const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!anon||!service)return out(req,503,{error:"County routing unavailable"});
 const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,service,{auth:{persistSession:false}});const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return out(req,401,{error:"Session invalid"});const [{data:ent},{data:prof}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);const plan=prof?.account_role==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return out(req,403,{error:"Pro+ required"});
 let body:Row={};try{body=await req.json()}catch{return out(req,400,{error:"Invalid JSON"})}const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);if(!ids.length)return out(req,400,{error:"transaction_ids required"});
 const {data:txs}=await admin.from("transaction_workspaces").select("id,user_id,address,county,pams_pin").eq("user_id",user.id).in("id",ids);const counties=[...new Set((txs||[]).map((t:Row)=>countyKey(t.county)).filter(Boolean))];const {data:routes}=counties.length?await admin.from("transaction_provider_registry").select("jurisdiction_key,jurisdiction_name,provider_key,provider_label,provider_url,evidence_families,access_mode,adapter_status,source_url,last_verified_at,metadata").eq("jurisdiction_type","county").in("jurisdiction_key",counties):{data:[]};const routeMap=new Map<string,Row[]>();for(const r of routes||[]){const k=countyKey(r.jurisdiction_key);routeMap.set(k,[...(routeMap.get(k)||[]),r])}
 const keys=["judgment_lien_search","lis_pendens_title_exceptions","deed_recording_reference"];const {data:items}=await admin.from("transaction_items").select("id,transaction_id,item_key,payload").eq("user_id",user.id).in("transaction_id",ids).in("item_key",keys);const itemMap=new Map<string,Row>();for(const i of items||[])itemMap.set(`${i.transaction_id}:${i.item_key}`,i);const checkedAt=new Date().toISOString(),results:Row[]=[];
 for(const tx of txs||[]){
  const ck=countyKey(tx.county),all=(routeMap.get(ck)||[]).filter(r=>r.provider_url&&!isNoise(r));if(!all.length){results.push({transaction_id:tx.id,county:ck,status:"no_registry_route"});continue}
  const lienRoute=bestRoute(all,["liens","search_portal","clerk_land_records","deeds_mortgages"]),lisRoute=bestRoute(all,["search_portal","clerk_land_records","legal_notices","liens"]),deedRoute=bestRoute(all,["search_portal","deeds_mortgages","clerk_land_records"]);
  const publicRoutes=all.map(r=>({provider_key:r.provider_key,label:label(r,ck),url:r.provider_url,access_mode:r.access_mode,adapter_status:r.adapter_status,evidence_families:r.evidence_families,last_verified_at:r.last_verified_at})).sort((a,b)=>String(a.label).localeCompare(String(b.label)));
  const patch=async(key:string,v:Row)=>{const it=itemMap.get(`${tx.id}:${key}`);if(!it)return;await admin.from("transaction_items").update({...v,payload:{...safe(it.payload),...safe(v.payload)},updated_at:checkedAt}).eq("id",it.id).eq("user_id",user.id)};
  if(lienRoute){
   const l=label(lienRoute,ck),routeText=`${l} is the routed ${title(ck)} County recording source. Watchdog has identified the official/public access path, but has not completed an authoritative lien or judgment search.`;
   await patch("judgment_lien_search",{evidence_state:"verify",severity:"review",source_type:"official_search_required",source_label:l,source_url:lienRoute.provider_url,source_checked_at:null,description:`${routeText} County-recorded liens can be researched through this route; statewide judgment identity matching remains a separate New Jersey Judiciary search.`,payload:{county:ck,provider_routes:publicRoutes,route_checked_at:checkedAt,search_state:"not_run",search_completed:false,can_report_none:false,records:[],result_semantics:"A county source route is not a completed lien/judgment search. No-record language is allowed only after an authoritative search completes with a documented scope and identity basis."}});
  }
  if(lisRoute){
   const l=label(lisRoute,ck),routeText=`${l} is the routed ${title(ck)} County recording source. Watchdog has identified the access path but has not completed a Lis Pendens/title-filing search.`;
   await patch("lis_pendens_title_exceptions",{evidence_state:"verify",severity:"review",source_type:"official_search_required",source_label:l,source_url:lisRoute.provider_url,source_checked_at:null,description:`${routeText} Watchdog will only report “none found” after the applicable county index search actually completes within its documented date/record scope.`,payload:{county:ck,provider_routes:publicRoutes,route_checked_at:checkedAt,search_state:"not_run",search_completed:false,can_report_none:false,records:[],result_semantics:"Routing or opening the county site is not a completed Lis Pendens/title-exception search."}});
  }
  if(deedRoute){
   const l=label(deedRoute,ck);await patch("deed_recording_reference",{source_type:"county_provider_route",source_label:l,source_url:deedRoute.provider_url,payload:{county:ck,county_provider_routes:publicRoutes,route_checked_at:checkedAt,recording_authority:l}});
  }
  const evidence={county:ck,routes:publicRoutes,selected:{judgment_lien_search:lienRoute?{provider_key:lienRoute.provider_key,label:label(lienRoute,ck),url:lienRoute.provider_url}:null,lis_pendens_title_exceptions:lisRoute?{provider_key:lisRoute.provider_key,label:label(lisRoute,ck),url:lisRoute.provider_url}:null,deed_recording_reference:deedRoute?{provider_key:deedRoute.provider_key,label:label(deedRoute,ck),url:deedRoute.provider_url}:null}};
  await admin.from("transaction_evidence_observations").upsert({transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,evidence_key:"county_provider_route",provider_key:`county-${ck.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,evidence_status:"verify",value:evidence,source_label:label(lienRoute||lisRoute||deedRoute||all[0],ck),source_url:(lienRoute||lisRoute||deedRoute||all[0]).provider_url,source_checked_at:checkedAt,facts_hash:await hash(evidence),metadata:{routing_only:true,search_completed:false,title_clearance:false,family_ranked:true,noise_filtered:true}},{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});
  results.push({transaction_id:tx.id,county:ck,status:"routed",route_count:publicRoutes.length,selected:{liens:lienRoute?.provider_key||null,lis_pendens:lisRoute?.provider_key||null,deed:deedRoute?.provider_key||null}})
 }
 return out(req,200,{ok:true,checked_at:checkedAt,results});
});
