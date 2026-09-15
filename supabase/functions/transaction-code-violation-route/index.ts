import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row=Record<string,any>;
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safe=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const district=(tx:Row)=>{const p=clean(tx.pams_pin,100);return /^\d{4}/.test(p)?p.slice(0,4):""};
const families=(r:Row)=>Array.isArray(r.evidence_families)?r.evidence_families.map((x:unknown)=>clean(x,80)):[];
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"});
const respond=(r:Request,s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
async function digest(v:unknown){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function preserveStronger(item:Row){
  const evidence=clean(item.evidence_state,80),source=clean(item.source_type,80),payload=safe(item.payload);
  if(evidence==="issue_observed"||evidence==="clear_observed")return true;
  return Boolean(payload.search_state==="completed"||(item.source_checked_at&&(source==="live_municipal_account"||source==="public_record"||source==="official_search_completed")));
}
function routeScore(r:Row){
  if(!r.provider_url)return -1;
  if(clean(r.provider_key,80)==="municipal_code_enforcement")return 100;
  if(families(r).includes("code_violations")&&clean(r.provider_key,80)==="official_municipal_site")return 50;
  if(families(r).includes("code_violations"))return 25;
  return -1;
}
function bestRoute(rows:Row[]){return [...rows].sort((a,b)=>routeScore(b)-routeScore(a))[0]||null}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return respond(req,503,{error:"Code-violation routing unavailable"});
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:ent},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);
  const plan=profile?.account_role==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}
  const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);if(!ids.length)return respond(req,400,{error:"transaction_ids required"});
  const {data:txs,error:txErr}=await admin.from("transaction_workspaces").select("id,user_id,address,municipality,county,pams_pin,block,lot,qualifier").eq("user_id",user.id).in("id",ids);if(txErr)return respond(req,503,{error:"Transactions unavailable"});
  const dists=[...new Set((txs||[]).map((x:Row)=>district(x)).filter(Boolean))];
  const {data:routes}=dists.length?await admin.from("transaction_provider_registry").select("jurisdiction_key,jurisdiction_name,county,provider_key,provider_label,provider_url,evidence_families,access_mode,adapter_status,source_url,last_verified_at,metadata").eq("jurisdiction_type","municipality").in("jurisdiction_key",dists):{data:[]};
  const routeMap=new Map<string,Row[]>();for(const r of routes||[]){if(routeScore(r)<0)continue;const key=String(r.jurisdiction_key);routeMap.set(key,[...(routeMap.get(key)||[]),r])}
  const {data:items}=await admin.from("transaction_items").select("id,transaction_id,item_key,evidence_state,severity,state,source_type,source_label,source_url,source_checked_at,description,payload").eq("user_id",user.id).in("transaction_id",ids).eq("item_key","open_violations");
  const itemMap=new Map<string,Row>();for(const i of items||[])itemMap.set(i.transaction_id,i);
  const routedAt=new Date().toISOString(),results:Row[]=[];
  for(const tx of txs||[]){
    const d=district(tx),item=itemMap.get(tx.id),route=bestRoute(routeMap.get(d)||[]);
    if(!item){results.push({transaction_id:tx.id,status:"item_missing"});continue}
    if(preserveStronger(item)){results.push({transaction_id:tx.id,status:"preserved_stronger_evidence",evidence_state:item.evidence_state,source_type:item.source_type});continue}
    if(!route){results.push({transaction_id:tx.id,status:"no_official_code_route"});continue}
    const curated=clean(route.provider_key,80)==="municipal_code_enforcement";
    const label=curated?(clean(route.provider_label,180)||`${clean(tx.municipality,140)||"Municipality"} Code Enforcement`):`${clean(tx.municipality,140)||clean(route.jurisdiction_name,140)||"Municipality"} · Official municipal code/violations source`;
    const semantics=curated
      ?"Watchdog identified the official municipal Code Enforcement or Property Maintenance office, but no parcel-specific violation search has been completed. Contact the office or use an authorized municipal process to verify open violations. The existence of this route cannot support a clean/no-violation conclusion."
      :"Watchdog's source registry identified code/violation coverage on this municipality's official site, but a direct parcel-specific Code Enforcement search or department workflow has not been certified. Use the official municipal source to reach the responsible office/process and verify open violations. This source route cannot support a clean/no-violation conclusion.";
    const payload={...safe(item.payload),provider_family:clean(route.provider_key,80)||"official_municipal_site",official_code_enforcement_route:curated,official_code_source_discovered:true,route_quality:curated?"curated_department":"official_site_discovery",provider_registry_status:route.adapter_status,provider_access_mode:route.access_mode,route_verified_at:route.last_verified_at||null,route_metadata:safe(route.metadata),search_state:"not_run",search_completed:false,can_report_none:false,automation_authorized:false,manual_verification_required:true,block:clean(tx.block,60)||null,lot:clean(tx.lot,60)||null,qualifier:clean(tx.qualifier,60)||null,result_semantics:semantics};
    const updated=await admin.from("transaction_items").update({evidence_state:"verify",severity:"review",source_type:"official_manual",source_label:label,source_url:route.provider_url,source_checked_at:null,description:semantics,payload,updated_at:routedAt}).eq("id",item.id).eq("user_id",user.id).select("id").single();
    if(updated.error){results.push({transaction_id:tx.id,status:"update_failed"});continue}
    const observation={district:d,municipality:tx.municipality||route.jurisdiction_name,provider_url:route.provider_url,route_quality:curated?"curated_department":"official_site_discovery",search_state:"not_run",manual_verification_required:true,automation_authorized:false};
    await admin.from("transaction_evidence_observations").upsert({transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,evidence_key:"code_violation_official_route",provider_key:`municipal-code-${d}`,evidence_status:"verify",value:observation,source_label:label,source_url:route.provider_url,source_checked_at:route.last_verified_at||routedAt,facts_hash:await digest(observation),metadata:{routing_only:true,search_completed:false,can_report_none:false,automation_authorized:false,route_quality:observation.route_quality}},{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});
    results.push({transaction_id:tx.id,status:"manual_verification_required",district:d,route_quality:observation.route_quality,provider_url:route.provider_url});
  }
  return respond(req,200,{ok:true,routed_at:routedAt,results});
});
