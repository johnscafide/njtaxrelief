import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row=Record<string,any>;
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const CSRR="https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer/24/query";
const FEMA="https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";
const NJ_GEOCODER="https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates";
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safe=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"});
const respond=(r:Request,s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const district=(tx:Row)=>{const p=clean(tx.pams_pin,80).replace(/\D/g,"");return p.length>=4?p.slice(0,4):""};
const part=(v:unknown)=>clean(v,80).toUpperCase().replace(/\s+/g,"");
const parcelToken=(tx:Row)=>part(tx.block)&&part(tx.lot)?`${part(tx.block)}-${part(tx.lot)}`:"";
const sql=(v:string)=>v.replace(/'/g,"''");
async function jsonFetch(url:string,timeout=5500){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{signal:c.signal,headers:{accept:"application/json","user-agent":"Watchdog-Transaction/1.0 (+https://www.watchdogindex.com/)"}});if(!r.ok)return{ok:false,error:`http_${r.status}`,data:null};const data=await r.json();if(data?.error)return{ok:false,error:"provider_error",data};return{ok:true,data,error:null}}catch(e){return{ok:false,error:e instanceof DOMException&&e.name==="AbortError"?"timeout":"unavailable",data:null}}finally{clearTimeout(t)}}
async function exactCsrr(tx:Row){
  const d=district(tx),token=parcelToken(tx);if(!/^\d{4}$/.test(d)||!token)return{status:"dependency_missing",records:[],reason:"parcel_key_unavailable"};
  const q=new URLSearchParams({f:"json",where:`COMU_CODE='${sql(d)}' AND PARCELS LIKE '%${sql(token)}%'`,outFields:"PREFERRED_ID,SITE_ID,CASE_STATUS,KCSL,COMU_CODE,PARCELS,DATALOAD_DATE,DEED_NOTICE,DN_DATE,CEA,CEA_DATE,REGULATED_UST,BROWNFIELDS_DEVELOPMENT_AREA",returnGeometry:"false",resultRecordCount:"2000"});
  const r=await jsonFetch(`${CSRR}?${q}`);if(!r.ok)return{status:"provider_error",records:[],reason:r.error};
  const records=(Array.isArray(r.data?.features)?r.data.features:[]).map((f:Row)=>safe(f.attributes)).filter((a:Row)=>String(a.PARCELS||"").split(";").map(part).includes(token));
  return{status:"checked",records,reason:records.length?"exact_srp_parcel_match":"no_exact_srp_parcel_record"};
}
async function geocode(tx:Row){
  const line=[tx.address,tx.city,tx.state||"NJ",tx.postal_code].filter(Boolean).join(", ");if(!line)return null;
  const q=new URLSearchParams({SingleLine:line,f:"json",outFields:"*",maxLocations:"1",outSR:"4326"});const r=await jsonFetch(`${NJ_GEOCODER}?${q}`);if(!r.ok)return null;const c=r.data?.candidates?.[0];const x=Number(c?.location?.x),y=Number(c?.location?.y);return Number.isFinite(x)&&Number.isFinite(y)?{lon:x,lat:y,score:Number(c?.score)||null,matched_address:clean(c?.address,240)||null}:null;
}
async function femaFlood(point:Row|null){
  if(!point)return{status:"dependency_missing",zones:[],reason:"coordinates_unavailable"};
  const q=new URLSearchParams({f:"json",where:"1=1",geometry:`${point.lon},${point.lat}`,geometryType:"esriGeometryPoint",inSR:"4326",spatialRel:"esriSpatialRelIntersects",outFields:"FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DEPTH,LEN_UNIT",returnGeometry:"false",resultRecordCount:"10"});
  const r=await jsonFetch(`${FEMA}?${q}`);if(!r.ok)return{status:"provider_error",zones:[],reason:r.error};const zones=(Array.isArray(r.data?.features)?r.data.features:[]).map((f:Row)=>safe(f.attributes));return{status:"checked",zones,reason:zones.length?"nfhl_zone_intersection":"no_nfhl_zone_returned"};
}
function truthy(v:unknown){const s=String(v??"").trim().toLowerCase();return Boolean(s)&&!["0","false","no","n","none","null","na","n/a"].includes(s)}
function recordSummary(a:Row){return{preferred_id:clean(a.PREFERRED_ID,100)||null,site_id:clean(a.SITE_ID,100)||null,case_status:clean(a.CASE_STATUS,120)||null,kcsl:clean(a.KCSL,120)||null,deed_notice:clean(a.DEED_NOTICE,160)||null,deed_notice_date:clean(a.DN_DATE,80)||null,cea:clean(a.CEA,160)||null,cea_date:clean(a.CEA_DATE,80)||null,regulated_ust:clean(a.REGULATED_UST,160)||null,brownfield:clean(a.BROWNFIELDS_DEVELOPMENT_AREA,160)||null}}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!anon||!service)return respond(req,503,{error:"Environmental evidence configuration incomplete"});
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:ent},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);const plan=profile?.account_role==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,25);if(!ids.length)return respond(req,400,{error:"transaction_ids required"});
  const {data:txs,error}=await admin.from("transaction_workspaces").select("id,user_id,address,city,state,postal_code,municipality,county,pams_pin,block,lot,qualifier").eq("user_id",user.id).in("id",ids);if(error)return respond(req,503,{error:"Transactions unavailable"});const now=new Date().toISOString(),results:Row[]=[];
  for(const tx of txs||[]){
    const [csrr,point]=await Promise.all([exactCsrr(tx),geocode(tx)]),flood=await femaFlood(point),records=(csrr.records||[]).map(recordSummary);
    const controls=records.some((r:Row)=>truthy(r.deed_notice)||truthy(r.cea)||truthy(r.regulated_ust)),caseMatch=records.some((r:Row)=>truthy(r.case_status)||truthy(r.kcsl)||truthy(r.preferred_id));
    const zone=flood.zones?.[0]||null;
    const payload={parcel:{pams_pin:tx.pams_pin||null,block:tx.block||null,lot:tx.lot||null,qualifier:tx.qualifier||null},njdep:{search_state:csrr.status,reason:csrr.reason,exact_parcel_match:records.length>0,records,control_or_ust_observed:controls,case_record_observed:caseMatch,source_url:"https://dep.nj.gov/srp/gis/"},fema:{search_state:flood.status,reason:flood.reason,geocode:point,zones:flood.zones||[],flood_zone:zone?clean(zone.FLD_ZONE,80)||null:null,zone_subtype:zone?clean(zone.ZONE_SUBTY,160)||null:null,sfha:zone?clean(zone.SFHA_TF,40)||null:null,source_url:"https://www.fema.gov/flood-maps/national-flood-hazard-layer"},result_semantics:"NJDEP site-remediation evidence uses an exact municipality + block/lot parcel match. FEMA evidence uses the subject-address geocode against NFHL. No exact match is limited to the checked sources and is not an environmental clearance."};
    const issue=controls||caseMatch,severity=controls?"attention":caseMatch?"review":"info",description=issue?"Watchdog found exact-parcel NJDEP remediation/control evidence that should be reviewed during the transaction.":"Watchdog checked exact-parcel NJDEP remediation records and FEMA NFHL evidence. No environmental clearance is implied.";
    const up=await admin.from("transaction_items").upsert({transaction_id:tx.id,user_id:user.id,item_key:"environmental_controls",category:"permits_property",title:"Environmental / deed controls",description,state:"resolved",evidence_state:issue?"issue_observed":"verify",severity,assigned_role:"title",sort_order:94,source_type:"official_public_record",source_label:"NJDEP CSRR + FEMA NFHL",source_url:"https://dep.nj.gov/srp/gis/",source_checked_at:now,payload,updated_at:now},{onConflict:"transaction_id,item_key"}).select("id").single();
    if(up.error){results.push({transaction_id:tx.id,status:"update_failed",error:up.error.message});continue}
    results.push({transaction_id:tx.id,status:"available",exact_njdep_records:records.length,environmental_attention:issue,flood_zone:payload.fema.flood_zone});
  }
  return respond(req,200,{ok:true,checked_at:now,results});
});
