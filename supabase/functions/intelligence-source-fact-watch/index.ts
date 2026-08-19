import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const VERSION="watchdog-source-fact-watch-v4";
const NJ_PARCEL_ITEM_ID="533599bbfbaa4748bf39faf1375a8a9c";
const NJ_PARCELS="https://newjersey.maps.arcgis.com/home/item.html?id=533599bbfbaa4748bf39faf1375a8a9c";
const PLAN_RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const FIELDS=["PAMS_PIN","LAND_VAL","IMPRVT_VAL","NET_VALUE","LAST_YR_TX","SALE_PRICE","DEED_DATE","DEED_BOOK","DEED_PAGE"];
const MARKERS=[
  {id:"property.land_assessment",field:"LAND_VAL",event:"assessment_change"},
  {id:"property.improvement_assessment",field:"IMPRVT_VAL",event:"assessment_change"},
  {id:"property.assessed_value",field:"NET_VALUE",event:"assessment_change"},
  {id:"property.annual_tax",field:"LAST_YR_TX",event:"tax_change"},
  {id:"property.sale_price",field:"SALE_PRICE",event:"deed_change"},
  {id:"property.sale_date",field:"DEED_DATE",event:"deed_change"},
  {id:"property.deed_book",field:"DEED_BOOK",event:"deed_change"},
  {id:"property.deed_page",field:"DEED_PAGE",event:"deed_change"},
] as const;

type O=Record<string,any>;
const clean=(v:unknown,n=240)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const plan=(v:unknown)=>{let p=String(v||"standard").toLowerCase().replace(/\+/g,"_plus").replace(/[^a-z_]/g,"");if(p==="free")p="standard";return PLAN_RANK[p]===undefined?"standard":p};
const json=(req:Request,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function shaBytes(text:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function shaText(v:unknown){return shaBytes(String(v??""))}
async function shaValue(v:unknown){return shaBytes(JSON.stringify(v))}
function value(field:string,raw:unknown){
  if(raw===null||raw===undefined||raw==="")return null;
  if(["LAND_VAL","IMPRVT_VAL","NET_VALUE","LAST_YR_TX","SALE_PRICE"].includes(field)){const n=Number(raw);return Number.isFinite(n)?Number(n.toFixed(2)):null}
  if(field==="DEED_DATE"){
    if(typeof raw==="number"&&Number.isFinite(raw)){const d=new Date(raw);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null}
    const s=clean(raw,80);if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):s;
  }
  const s=clean(raw,120);return s||null;
}
function materiality(marker:string,event:string,oldValue:unknown,newValue:unknown){
  if(event==="deed_change")return"medium";
  const a=Number(oldValue),b=Number(newValue);
  if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)>0){const pct=Math.abs(b-a)/Math.abs(a);if(pct>=0.05)return"high";if(pct>=0.01)return"medium"}
  if(marker==="property.annual_tax"||marker.includes("assessment"))return"medium";
  return"low";
}
async function resolveParcelQueryUrl(){
  const metaUrl=`https://www.arcgis.com/sharing/rest/content/items/${NJ_PARCEL_ITEM_ID}?f=json`;
  const r=await fetch(metaUrl,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`NJ parcel item metadata HTTP ${r.status}`);
  const data=await r.json(),base=clean(data?.url,500).replace(/\/+$/,"");
  if(!/^https:\/\//i.test(base)||!/arcgis\/rest\/services\//i.test(base))throw new Error("NJ parcel item did not resolve to an ArcGIS service");
  if(/\/(FeatureServer|MapServer)\/\d+$/i.test(base))return `${base}/query`;
  if(/\/(FeatureServer|MapServer)$/i.test(base))return `${base}/0/query`;
  throw new Error("NJ parcel item service URL has an unsupported shape");
}
async function providerBatch(queryUrl:string,pins:string[]){
  const where=`PAMS_PIN IN (${pins.map(p=>`'${p.replace(/'/g,"''")}'`).join(",")})`;
  const form=new URLSearchParams({f:"json",where,outFields:FIELDS.join(","),returnGeometry:"false",resultRecordCount:String(Math.max(100,pins.length*3))});
  const r=await fetch(queryUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form.toString(),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error(`NJ parcel provider HTTP ${r.status}`);
  const data=await r.json();if(data?.error)throw new Error(`NJ parcel provider error ${clean(data.error?.message||data.error?.code,160)}`);
  return Array.isArray(data?.features)?data.features.map((f:O)=>f?.attributes||{}):[];
}
async function eligiblePlans(admin:any,userIds:string[]){
  const out=new Map<string,string>();
  await Promise.all(userIds.map(async id=>{const r=await admin.rpc("watchdog_effective_plan",{p_user_id:id});if(!r.error)out.set(id,plan(r.data))}));
  return out;
}
async function chunks<T>(rows:T[],size:number,fn:(part:T[])=>Promise<void>){for(let i=0;i<rows.length;i+=size)await fn(rows.slice(i,i+size))}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json(req,405,{error:"POST required"});
  const url=Deno.env.get("SUPABASE_URL")||"",secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!secret)return json(req,503,{error:"Watcher configuration incomplete"});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=clean(req.headers.get("x-watchdog-watch-token"),200);if(!token)return json(req,401,{error:"Internal watch token required"});
  const control=await admin.from("intelligence_source_fact_watch_control").select("enabled,token_hash,batch_limit").eq("id",true).maybeSingle();if(control.error||!control.data)return json(req,503,{error:"Watch control unavailable"});
  if(await shaText(token)!==String(control.data.token_hash||""))return json(req,403,{error:"Invalid internal watch token"});
  if(control.data.enabled!==true)return json(req,202,{ok:true,status:"disabled",version:VERSION});

  let body:O={};try{body=await req.json()}catch{}
  const limit=Math.min(Number(control.data.batch_limit||500),Math.max(25,Math.trunc(Number(body.limit||control.data.batch_limit||500))));
  const started=Date.now(),run=await admin.from("intelligence_source_fact_watch_runs").insert({status:"running",metrics:{version:VERSION}}).select("id").single();
  const runId=run.data?.id;
  const finish=async(status:string,patch:O)=>{if(runId)await admin.from("intelligence_source_fact_watch_runs").update({status,completed_at:new Date().toISOString(),...patch,metrics:{version:VERSION,duration_ms:Date.now()-started,...(patch.metrics||{})}}).eq("id",runId)};

  try{
    const saved=await admin.from("saved_properties").select("user_id,pams_pin").not("pams_pin","is",null).limit(limit);if(saved.error)throw saved.error;
    const rawSaved=saved.data||[],userIds=[...new Set(rawSaved.map((r:O)=>String(r.user_id||"")).filter(Boolean))],plans=await eligiblePlans(admin,userIds);
    const eligible=rawSaved.filter((r:O)=>PLAN_RANK[plans.get(String(r.user_id))||"standard"]>=PLAN_RANK.agent&&clean(r.pams_pin,100));
    const dedup=new Map<string,O>();for(const row of eligible)dedup.set(`${row.user_id}|${clean(row.pams_pin,100)}`,{user_id:String(row.user_id),pams_pin:clean(row.pams_pin,100)});
    const savedRows=[...dedup.values()],pins=[...new Set(savedRows.map(r=>r.pams_pin))];
    if(!pins.length){await finish("complete",{eligible_users:0,eligible_properties:0});return json(req,200,{ok:true,status:"complete",version:VERSION,eligible_users:0,eligible_properties:0,baselines_created:0,changed_observations:0,candidates_created:0})}

    const queryUrl=await resolveParcelQueryUrl(),attrs=new Map<string,O>();let providerBatches=0;
    for(let i=0;i<pins.length;i+=35){const part=pins.slice(i,i+35),rows=await providerBatch(queryUrl,part);providerBatches++;for(const row of rows){const pin=clean(row.PAMS_PIN,100);if(pin)attrs.set(pin,row)}}

    const existing=await admin.from("intelligence_source_fact_watch_state").select("user_id,pams_pin,marker_id,value_json,value_hash,first_observed_at,last_changed_at").in("user_id",[...new Set(savedRows.map(r=>r.user_id))]).in("pams_pin",pins).limit(10000);if(existing.error)throw existing.error;
    const stateMap=new Map<string,O>();for(const row of existing.data||[])stateMap.set(`${row.user_id}|${row.pams_pin}|${row.marker_id}`,row);
    const now=new Date().toISOString(),stateUpserts:O[]=[],candidateUpserts:O[]=[];let baselines=0,unchanged=0,changed=0;

    for(const savedRow of savedRows){const row=attrs.get(savedRow.pams_pin);if(!row)continue;
      for(const marker of MARKERS){const next=value(marker.field,row[marker.field]);if(next===null)continue;const nextHash=await shaValue(next),key=`${savedRow.user_id}|${savedRow.pams_pin}|${marker.id}`,prior=stateMap.get(key);
        if(!prior){baselines++;stateUpserts.push({user_id:savedRow.user_id,pams_pin:savedRow.pams_pin,marker_id:marker.id,value_json:next,value_hash:nextHash,source_id:"nj-parcels-modiv",source_ref:NJ_PARCELS,first_observed_at:now,last_changed_at:null,checked_at:now,updated_at:now});continue}
        if(String(prior.value_hash)===nextHash){unchanged++;stateUpserts.push({user_id:savedRow.user_id,pams_pin:savedRow.pams_pin,marker_id:marker.id,value_json:next,value_hash:nextHash,source_id:"nj-parcels-modiv",source_ref:NJ_PARCELS,first_observed_at:prior.first_observed_at,last_changed_at:prior.last_changed_at,checked_at:now,updated_at:now});continue}
        changed++;const candidateKey=`watch:${savedRow.pams_pin}:${marker.id}:${String(prior.value_hash).slice(0,16)}:${nextHash.slice(0,16)}`;
        candidateUpserts.push({user_id:savedRow.user_id,pams_pin:savedRow.pams_pin,marker_id:marker.id,event_type:marker.event,materiality:materiality(marker.id,marker.event,prior.value_json,next),old_value:prior.value_json,new_value:next,old_value_hash:String(prior.value_hash),new_value_hash:nextHash,source_id:"nj-parcels-modiv",source_ref:NJ_PARCELS,provider_kind:"authoritative_source",marker_tier:"standard",candidate_key:candidateKey,detected_at:now});
        stateUpserts.push({user_id:savedRow.user_id,pams_pin:savedRow.pams_pin,marker_id:marker.id,value_json:next,value_hash:nextHash,source_id:"nj-parcels-modiv",source_ref:NJ_PARCELS,first_observed_at:prior.first_observed_at,last_changed_at:now,checked_at:now,updated_at:now});
      }
    }

    if(stateUpserts.length)await chunks(stateUpserts,500,async part=>{const r=await admin.from("intelligence_source_fact_watch_state").upsert(part,{onConflict:"user_id,pams_pin,marker_id"});if(r.error)throw r.error});
    if(candidateUpserts.length)await chunks(candidateUpserts,250,async part=>{const r=await admin.from("intelligence_material_change_candidates").upsert(part,{onConflict:"user_id,candidate_key",ignoreDuplicates:true});if(r.error)throw r.error});
    const eligibleUsers=new Set(savedRows.map(r=>r.user_id)).size,summary={eligible_users:eligibleUsers,eligible_properties:savedRows.length,provider_batches:providerBatches,provider_records:attrs.size,baselines_created:baselines,unchanged_observations:unchanged,changed_observations:changed,candidates_created:candidateUpserts.length};
    await finish("complete",summary);
    return json(req,200,{ok:true,status:"complete",version:VERSION,...summary});
  }catch(error){const message=clean((error as any)?.message||error,500);await finish("failed",{error_code:"source_fact_watch_failed",error_message:message});return json(req,503,{ok:false,status:"failed",error:"Source-fact watcher could not complete",version:VERSION})}
});
