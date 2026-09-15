import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const RANK: Record<string, number> = { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 };
const REQUIREMENT_RANK: Record<string, number> = { verify:0, statewide_baseline:1, official_process_found:2, explicit_required:3 };
const ORIGINS = new Set(["https://watchdogindex.com","https://www.watchdogindex.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safe=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"});
const respond=(r:Request,s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const district=(tx:Row)=>{const p=clean(tx.pams_pin,100);return /^\d{4}/.test(p)?p.slice(0,4):""};
async function hash(v:unknown){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function existingStrength(item:Row){
  const p=safe(item.payload), requirements=Array.isArray(p.requirements)?p.requirements:[];
  if(item.source_type!=="official_requirement"||!requirements.length)return {rank:-1,count:0,state:"none"};
  const state=clean(p.requirement_state,60);
  // Older hand-verified municipal evidence predates requirement_state. Treat it as
  // strong official evidence so a generic statewide crawl can never erase it.
  const rank=state in REQUIREMENT_RANK?REQUIREMENT_RANK[state]:3;
  return {rank,count:requirements.length,state:state||"legacy_verified_official"};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});

  const url=Deno.env.get("SUPABASE_URL")||"", anon=Deno.env.get("SUPABASE_ANON_KEY")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return respond(req,503,{error:"Municipal requirements configuration incomplete"});
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}), admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:who}=await uc.auth.getUser(); const user=who?.user;
  if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:ent},{data:prof}]=await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle(),
  ]);
  const plan=prof?.account_role==="developer"?"developer":String(ent?.plan_tier||"standard");
  if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ required"});

  let body:Row={}; try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}
  const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);
  if(!ids.length)return respond(req,400,{error:"transaction_ids required"});

  const {data:txs,error:txErr}=await admin.from("transaction_workspaces").select("id,user_id,address,municipality,county,pams_pin").eq("user_id",user.id).in("id",ids);
  if(txErr)return respond(req,503,{error:"Transactions unavailable"});
  const districts=[...new Set((txs||[]).map((t:Row)=>district(t)).filter(Boolean))];
  const {data:reqRows,error:reqErr}=districts.length
    ? await admin.from("transaction_municipal_requirements").select("*").in("municipality_code",districts)
    : {data:[],error:null};
  if(reqErr)return respond(req,503,{error:"Municipal requirements registry unavailable"});
  const reqMap=new Map<string,Row>(); for(const r of reqRows||[])reqMap.set(`${r.municipality_code}:${r.requirement_key}`,r);

  const itemKeys=["resale_cco","smoke_fire_cert"];
  const {data:items}=await admin.from("transaction_items")
    .select("id,transaction_id,item_key,title,evidence_state,severity,source_type,source_label,source_url,source_checked_at,description,payload")
    .eq("user_id",user.id).in("transaction_id",ids).in("item_key",itemKeys);
  const itemMap=new Map<string,Row>(); for(const i of items||[])itemMap.set(`${i.transaction_id}:${i.item_key}`,i);
  const checkedAt=new Date().toISOString(), results:Row[]=[];

  for(const tx of txs||[]){
    const code=district(tx);
    if(!code){results.push({transaction_id:tx.id,status:"municipality_code_missing"});continue}
    const txResult:Row={transaction_id:tx.id,municipality_code:code,requirements:{}};

    for(const key of itemKeys){
      const r=reqMap.get(`${code}:${key}`), item=itemMap.get(`${tx.id}:${key}`);
      if(!r||!item){txResult.requirements[key]="registry_or_item_missing";continue}
      const requirements=Array.isArray(r.requirements)?r.requirements:[], fees=Array.isArray(r.fees)?r.fees:[], sources=Array.isArray(r.source_urls)?r.source_urls:[];
      const registryRank=REQUIREMENT_RANK[clean(r.requirement_state,60)]??0;
      const prior=existingStrength(item);

      // Never downgrade hand-verified/local official evidence with a weaker or less
      // detailed statewide crawl. The registry observation is still preserved below.
      const preserveExisting=prior.rank>registryRank || (prior.rank===registryRank && prior.count>requirements.length);
      const explicit=r.requirement_state==="explicit_required", process=r.requirement_state==="official_process_found", baseline=r.requirement_state==="statewide_baseline";
      const sourceUrl=r.application_url||r.department_url||r.ordinance_url||sources?.[0]?.url||null;
      const registryEvidence={requirement_key:key,requirement_state:r.requirement_state,requirements,fees,application_url:r.application_url,department_url:r.department_url,ordinance_url:r.ordinance_url,sources};

      await admin.from("transaction_evidence_observations").upsert({
        transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,
        evidence_key:`municipal_requirement_${key}`,provider_key:`municipal-requirements-${code}`,
        evidence_status:"verify",value:registryEvidence,source_label:`${r.municipality_name} official requirements`,source_url:sourceUrl,
        source_checked_at:r.last_verified_at||checkedAt,facts_hash:await hash(registryEvidence),
        metadata:{requirement_state:r.requirement_state,not_required_inferred:false,completion_clearance:false,promotion_suppressed:preserveExisting,prior_official_strength:prior.state},
      },{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});

      if(preserveExisting){
        txResult.requirements[key]=`preserved_stronger_existing:${prior.state}`;
        continue;
      }

      let description="";
      if(key==="resale_cco"){
        if(explicit)description=`Official municipal source material contains affirmative resale/occupancy requirement language for ${r.municipality_name}. Review the exact requirements, fees and application evidence below and track completion before closing.`;
        else if(process)description=`Watchdog found an official municipal resale/occupancy process for ${r.municipality_name}, but the source parser did not promote it to an unconditional requirement. Verify applicability for this transaction with the enforcing office.`;
        else description=`Watchdog has not obtained enough official municipal text to state that a resale/CO certificate is or is not required in ${r.municipality_name}. Verify with the municipality; missing web coverage is never treated as “not required.”`;
      }else{
        if(explicit)description=`Official local material contains affirmative smoke/CO/fire compliance language tied to sale or change of occupancy in ${r.municipality_name}. Track the applicable inspection/certificate process before closing.`;
        else if(process)description=`Watchdog found an official local smoke/CO/fire process for ${r.municipality_name}. Confirm how it applies to this property and whether it is handled separately or through the municipal occupancy process.`;
        else if(baseline)description=`NJ statewide fire-safety change-of-occupancy compliance remains a required verification point. Watchdog did not find enough local web material to state the municipality’s exact workflow, so confirm it with the applicable enforcing agency.`;
        else description=`Smoke/CO/fire compliance still requires verification with the applicable local enforcing agency. Missing local web coverage is never treated as a waiver.`;
      }
      const payload={...safe(item.payload),requirement_state:r.requirement_state,requirements,fees,application_url:r.application_url,department_url:r.department_url,ordinance_url:r.ordinance_url,official_sources:sources,source_excerpt:r.source_excerpt,last_verified_at:r.last_verified_at,municipality_code:code,municipality_name:r.municipality_name,never_infer_not_required:true};
      await admin.from("transaction_items").update({
        title:r.title,evidence_state:"verify",severity:explicit?"attention":"review",source_type:"official_requirement",
        source_label:`${r.municipality_name} official sources`,source_url:sourceUrl,source_checked_at:r.last_verified_at||checkedAt,
        description,payload,updated_at:checkedAt,
      }).eq("id",item.id).eq("user_id",user.id);
      txResult.requirements[key]=r.requirement_state;
    }
    results.push(txResult);
  }
  return respond(req,200,{ok:true,checked_at:checkedAt,results});
});
