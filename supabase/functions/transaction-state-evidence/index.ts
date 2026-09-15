import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const RANK: Record<string, number> = { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 };
const SOURCE_ID = "nj-treasury-modiv-transaction";
const SOURCE_LABEL = "NJ Division of Taxation 2026 MOD-IV Property Assessment List";
const SOURCE_URL = "https://www.nj.gov/treasury/taxation/lpt/statdata.shtml";
const MODIV_MANUAL = "https://www.nj.gov/treasury/taxation/pdf/lpt/modIVmanual.pdf";
const ORIGINS = new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean=(v:unknown,n=500)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safeObj=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const env=(jsonName:string,legacyName:string)=>{const raw=Deno.env.get(jsonName)||"";if(raw){try{const p=JSON.parse(raw);if(p?.default)return String(p.default)}catch{}}return Deno.env.get(legacyName)||""};
const cors=(req:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("origin")||"")?(req.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const respond=(req:Request,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
function normPart(v:unknown){let s=clean(v,80).toUpperCase().replace(/\s+/g,"");if(/^\d+(?:\.\d+)?$/.test(s)){s=s.replace(/^0+(?=\d)/,"");if(s.includes("."))s=s.replace(/0+$/,"").replace(/\.$/,"")}return s}
function parcelKey(tx:Row){const b=normPart(tx.block),l=normPart(tx.lot),q=normPart(tx.qualifier);return b&&l?`${b}|${l}|${q}`:""}
function money(v:unknown){const n=Number(v);return Number.isFinite(n)?n:null}
async function hash(value:unknown){const data=new TextEncoder().encode(JSON.stringify(value));const buf=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function gunzipJson(blob:Blob){const ds=new DecompressionStream("gzip");const text=await new Response(blob.stream().pipeThrough(ds)).text();return JSON.parse(text)}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pub||!secret)return respond(req,503,{error:"State evidence configuration incomplete"});
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:entitlement},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);
  const plan=String(profile?.account_role||"")==="developer"?"developer":String(entitlement?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ plan required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}
  const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);if(!ids.length)return respond(req,400,{error:"transaction_ids required"});

  const [{data:release,error:relErr},{data:txs,error:txErr}]=await Promise.all([
    admin.from("transaction_data_releases").select("*").eq("source_id",SOURCE_ID).eq("tax_year",2026).eq("status","live").maybeSingle(),
    admin.from("transaction_workspaces").select("id,user_id,address,municipality,county,block,lot,qualifier,pams_pin").eq("user_id",user.id).in("id",ids)
  ]);
  if(txErr)return respond(req,503,{error:"Transactions unavailable"});
  if(relErr||!release)return respond(req,200,{ok:true,source_ready:false,reason:"transaction_modiv_release_not_live",transactions:(txs||[]).length});

  const districts=[...new Set((txs||[]).map((t:Row)=>clean(t.pams_pin,100).slice(0,4)).filter(x=>/^\d{4}$/.test(x)))];
  const partitions=new Map<string,Row>();
  for(const district of districts){
    const objectPath=`${release.storage_prefix}/district/${district}.json.gz`;
    const {data,error}=await admin.storage.from(release.storage_bucket).download(objectPath);
    if(error||!data){partitions.set(district,{error:"partition_unavailable"});continue}
    try{partitions.set(district,await gunzipJson(data))}catch{partitions.set(district,{error:"partition_invalid"})}
  }

  const {data:items}=await admin.from("transaction_items").select("id,transaction_id,item_key,payload").eq("user_id",user.id).in("transaction_id",ids).in("item_key",["property_tax_status","tax_sale_delinquency","deed_recording_reference"]);
  const itemMap=new Map<string,Row>();for(const i of items||[])itemMap.set(`${i.transaction_id}:${i.item_key}`,i);
  const now=new Date().toISOString(),results:Row[]=[];

  for(const tx of txs||[]){
    const district=clean(tx.pams_pin,100).slice(0,4),key=parcelKey(tx),partition=partitions.get(district)||{},record=key&&partition?.records?.[key]?partition.records[key]:null;
    if(!record){results.push({transaction_id:tx.id,matched:false,reason:partition.error||"parcel_not_in_release"});continue}
    const delinquent=record.delinquent_flag===true,currentTax=money(record.current_year_tax),lastTax=money(record.last_year_tax);
    const taxValue={tax_year:2026,tax_account_number:record.tax_account_number||null,last_year_tax:lastTax,current_year_tax:currentTax,bill_status_flag:record.bill_status_flag||null,delinquent_code:record.delinquent_code||null,delinquent_flag:record.delinquent_flag,release_id:release.release_id,parcel:{pams_pin:tx.pams_pin,block:tx.block,lot:tx.lot,qualifier:tx.qualifier||null}};
    const taxHash=await hash(taxValue);
    await admin.from("transaction_evidence_observations").upsert({transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,evidence_key:"property_tax_modiv",provider_key:SOURCE_ID,evidence_status:delinquent?"observed":"no_issue_observed",value:taxValue,source_label:SOURCE_LABEL,source_url:SOURCE_URL,source_checked_at:now,source_effective_at:release.activated_at||release.built_at||null,facts_hash:taxHash,metadata:{annual_source:true,current_balance_clearance:false,manual_url:MODIV_MANUAL}},{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});

    const taxItem=itemMap.get(`${tx.id}:property_tax_status`);if(taxItem){
      const description=delinquent?"The 2026 NJ MOD-IV source carries the State's delinquent-tax code for this parcel. Confirm the live payoff/balance with the municipal Tax Collector or title/municipal search.":"No delinquent-tax code was observed for this parcel in the checked 2026 NJ MOD-IV source. This annual source is not proof of a current zero balance; confirm current payments with the Tax Collector/title search.";
      await admin.from("transaction_items").update({evidence_state:delinquent?"issue_observed":"clear_observed",severity:delinquent?"high":"review",source_type:"public_record",source_label:SOURCE_LABEL,source_url:SOURCE_URL,source_checked_at:now,description,payload:{...safeObj(taxItem.payload),...taxValue,source_state:"annual_modiv_checked",current_balance_state:"not_determined",result_semantics:description},updated_at:now}).eq("id",taxItem.id).eq("user_id",user.id);
    }
    const saleItem=itemMap.get(`${tx.id}:tax_sale_delinquency`);if(saleItem){
      const description=delinquent?"NJ MOD-IV reports the delinquent-tax code 'S' for this parcel. This is direct annual delinquency evidence, but it does not by itself establish whether a tax-sale certificate exists or the current payoff amount.":"No MOD-IV delinquent-tax flag was observed in the 2026 annual source. Current tax-sale status still requires the municipal Tax Collector/tax-sale source.";
      await admin.from("transaction_items").update({evidence_state:delinquent?"issue_observed":"verify",severity:delinquent?"high":"review",source_type:"public_record",source_label:SOURCE_LABEL,source_url:SOURCE_URL,source_checked_at:now,description,payload:{...safeObj(saleItem.payload),tax_year:2026,delinquent_code:record.delinquent_code||null,delinquent_flag:record.delinquent_flag,release_id:release.release_id,tax_sale_state:"not_determined",annual_delinquency_source_checked:true},updated_at:now}).eq("id",saleItem.id).eq("user_id",user.id);
    }
    const deedItem=itemMap.get(`${tx.id}:deed_recording_reference`);if(deedItem&&(record.deed_book||record.deed_page||record.deed_date)){
      const evidence={book:record.deed_book||null,page:record.deed_page||null,deed_date:record.deed_date||null,pams_pin:tx.pams_pin,block:tx.block,lot:tx.lot};
      await admin.from("transaction_items").update({source_checked_at:now,payload:{...safeObj(deedItem.payload),deed_book:record.deed_book||safeObj(deedItem.payload).deed_book||null,deed_page:record.deed_page||safeObj(deedItem.payload).deed_page||null,deed_date:record.deed_date||safeObj(deedItem.payload).deed_date||null,evidence,transaction_modiv_release_id:release.release_id},updated_at:now}).eq("id",deedItem.id).eq("user_id",user.id);
    }
    await admin.from("transaction_activity").insert({transaction_id:tx.id,user_id:user.id,action:"state_evidence_refresh",message:`2026 NJ MOD-IV transaction evidence refreshed for ${clean(tx.address,240)||"property"}`,detail:{provider:SOURCE_ID,release_id:release.release_id,delinquent_flag:record.delinquent_flag,current_year_tax:currentTax,last_year_tax:lastTax}});
    results.push({transaction_id:tx.id,matched:true,delinquent_flag:record.delinquent_flag,last_year_tax:lastTax,current_year_tax:currentTax,tax_account_number:record.tax_account_number||null});
  }
  return respond(req,200,{ok:true,source_ready:true,release_id:release.release_id,checked_at:now,results});
});
