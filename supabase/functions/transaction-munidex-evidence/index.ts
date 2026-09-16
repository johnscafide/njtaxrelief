import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const RANK: Record<string, number> = { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 };
const ORIGINS = new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const UA = "Mozilla/5.0 Watchdog-Munidex-Evidence/1.0 (+https://www.watchdogindex.com/)";
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safeObj=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const env=(jsonName:string,legacyName:string)=>{const raw=Deno.env.get(jsonName)||"";if(raw){try{const p=JSON.parse(raw);if(p?.default)return String(p.default)}catch{}}return Deno.env.get(legacyName)||""};
const cors=(req:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("origin")||"")?(req.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const respond=(req:Request,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const numberOrNull=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const m=String(v).replace(/[$,]/g,"").match(/-?\d+(?:\.\d+)?/);if(!m)return null;const n=Number(m[0]);return Number.isFinite(n)?n:null};
const money=(v:number|null)=>v==null?"unknown":v.toLocaleString("en-US",{style:"currency",currency:"USD"});
async function hash(value:unknown){const data=new TextEncoder().encode(JSON.stringify(value));const buf=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}

const SUFFIX: Record<string,string> = { STREET:"ST",ST:"ST",ROAD:"RD",RD:"RD",AVENUE:"AVE",AVE:"AVE",COURT:"CT",CT:"CT",DRIVE:"DR",DR:"DR",LANE:"LN",LN:"LN",PLACE:"PL",PL:"PL",BOULEVARD:"BLVD",BLVD:"BLVD",TERRACE:"TER",TER:"TER",CIRCLE:"CIR",CIR:"CIR",PARKWAY:"PKWY",PKWY:"PKWY",HIGHWAY:"HWY",HWY:"HWY",TRAIL:"TRL",TRL:"TRL",WAY:"WAY" };
function streetOnly(v:unknown){return clean(v,240).split(",")[0].trim()}
function normStreet(v:unknown){const raw=streetOnly(v).toUpperCase().replace(/[^A-Z0-9 ]+/g," ").replace(/\s+/g," ").trim();const parts=raw.split(" ").filter(Boolean);if(parts.length&&SUFFIX[parts[parts.length-1]])parts[parts.length-1]=SUFFIX[parts[parts.length-1]];return parts.join(" ")}
function compactParcel(v:unknown){let s=clean(v,40).toUpperCase().replace(/\s+/g,"").replace(/^0+(?=\d)/,"");if(/^\d+(?:\.\d+)?$/.test(s)&&s.includes("."))s=s.replace(/0+$/,"").replace(/\.$/,"");return s}
function districtFor(tx:Row){const pin=clean(tx.pams_pin,100);const id=pin.slice(0,4);return /^\d{4}$/.test(id)?id:""}
function slugifyMunicipality(v:unknown){return clean(v,160).toLowerCase().replace(/\b(township|twp|borough|boro|city|town|village)\b/g," ").replace(/[^a-z0-9]+/g,"").trim()}
function htmlText(v:string){return v.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim()}
function tableRows(html:string){const out:string[][]=[];for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>htmlText(m[1])).filter(Boolean);if(cells.length)out.push(cells)}return out}
function namedMoney(rows:string[][],pattern:RegExp){let total=0,found=false;for(const row of rows){if(!row.length||!pattern.test(row[0]))continue;for(const cell of row.slice(1)){const n=numberOrNull(cell);if(n!=null){total+=n;found=true}}}return found?total:null}
function firstValue(rows:string[][],pattern:RegExp){for(const row of rows){if(row.length>1&&pattern.test(row[0]))return clean(row[1],240)}return null}
function financialRows(rows:string[][]){return rows.filter(r=>r.some(c=>/principal|interest|balance|amount due|tax sale|delinquent|last payment|due date|year|quarter|account number/i.test(c))).slice(0,80)}

const ROOTS: Record<string,string[]> = {
  "0213":["https://tax.munidex.info/edgewater-nj-0213/"],
  "0216":["https://tax.munidex.info/englewoodcliffs-nj-0216/"],
  "0222":["https://tax.munidex.info/glenrock-nj-0222/"],
  "0234":["https://tax.munidex.info/maywood-nj-0234/"],
  "0247":["https://tax.munidex.info/parkridge-nj-0247/"],
  "0250":["https://tax.munidex.info/villridgefieldpark-nj-0250/"],
  "0255":["https://tax.munidex.info/rockleigh-nj-0255/"],
  "0258":["https://tax.munidex.info/saddleriver-nj-0258/"],
  "0903":["https://tax.munidex.info/guttenberg-nj-0903/"],
  "1412":["https://tax.munidex.info/hanovertwp-nj-1412/","https://tax.munidex.info/hanovertwp-nj-1412-swr/"],
  "2015":["https://tax.munidex.info/rosellepark-nj-2015/","https://tax.munidex.info/rosellepark-nj-2015-util/"]
};
function candidateRoots(tx:Row){const district=districtFor(tx);const roots=[...(ROOTS[district]||[])];const slug=slugifyMunicipality(tx.municipality);if(district&&slug){roots.push(`https://tax.munidex.info/${slug}-nj-${district}/`)}return [...new Set(roots)]}
async function getText(url:string,accept="text/html,*/*",timeoutMs=9000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers:{"User-Agent":UA,"Accept":accept},signal:c.signal});const text=await r.text();return {ok:r.ok,status:r.status,url:r.url,text}}catch(error){return {ok:false,status:0,url,text:"",error:clean(error,240)}}finally{clearTimeout(t)}}
function exactMatch(rows:Row[],tx:Row){const wanted=normStreet(tx.address);const exact=rows.filter(r=>normStreet(r.address1)===wanted);if(exact.length===1)return exact[0];const b=compactParcel(tx.block),l=compactParcel(tx.lot),q=clean(tx.qualifier,40).toUpperCase();const parcel=rows.filter(r=>compactParcel(r.block)===b&&compactParcel(r.lot)===l&&(!q||clean(r.qualcode,40).toUpperCase()===q));return parcel.length===1?parcel[0]:null}
function detailUrl(root:string,row:Row){const u=new URL("viewdetails/",root);u.searchParams.set("block",clean(row.block,60));u.searchParams.set("lot",clean(row.lot,60));u.searchParams.set("qualcode",clean(row.qualcode,60));if(row.sub!=null)u.searchParams.set("sub",clean(row.sub,60));u.searchParams.set("name",clean(row.name,240));return u.toString()}
async function findAccount(tx:Row){const query=streetOnly(tx.address).replace(/[^A-Za-z0-9 ]+/g," ").replace(/\s+/g," ").trim();if(query.length<3)return null;for(const root of candidateRoots(tx)){const search=`${root.replace(/\/$/,"")}/searchaddress/${encodeURIComponent(query)}`;const r=await getText(search,"application/json,*/*;q=0.5");if(!r.ok)continue;let rows:Row[]=[];try{const parsed=JSON.parse(r.text);if(Array.isArray(parsed))rows=parsed}catch{continue}const match=exactMatch(rows,tx);if(match)return {root,match,detail_url:detailUrl(root,match),candidate_count:rows.length}}return null}
function classifyDetail(html:string){const rows=tableRows(html);const principal=namedMoney(rows,/^principal\s*:?$/i);const projectedInterest=namedMoney(rows,/^projected interest\s*:?$/i);const explicitBalance=namedMoney(rows,/^(?:balance|amount due|current balance|total due)\s*:?$/i);const account=firstValue(rows,/^account number\s*:?$/i);const year=firstValue(rows,/^year\s*:?$/i);const taxLike=/net tax value|projected interest|quarter/i.test(htmlText(html));const utilityLike=/utility|water|sewer|account number/i.test(htmlText(html));const amountDue=explicitBalance!=null?explicitBalance:(principal!=null||projectedInterest!=null?(principal||0)+(projectedInterest||0):null);return {rows,principal,projected_interest:projectedInterest,explicit_balance:explicitBalance,amount_due:amountDue,account_number:account,year,tax_like:taxLike,utility_like:utilityLike,financial_rows:financialRows(rows)} }

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return respond(req,503,{error:"Munidex evidence configuration incomplete"});
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:entitlement},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);const plan=String(profile?.account_role||"")==="developer"?"developer":String(entitlement?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ plan required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);if(!ids.length)return respond(req,400,{error:"transaction_ids required"});
  const {data:txs,error:txErr}=await admin.from("transaction_workspaces").select("id,user_id,address,municipality,county,block,lot,qualifier,pams_pin").eq("user_id",user.id).in("id",ids);if(txErr)return respond(req,503,{error:"Transactions unavailable"});
  const {data:items}=await admin.from("transaction_items").select("id,transaction_id,item_key,payload").eq("user_id",user.id).in("transaction_id",ids).in("item_key",["ownership_vesting","property_tax_status","water_sewer"]);const itemMap=new Map<string,Row>();for(const i of items||[])itemMap.set(`${i.transaction_id}:${i.item_key}`,i);
  const checkedAt=new Date().toISOString();const results:Row[]=[];

  for(const tx of txs||[]){
    const found=await findAccount(tx);if(!found){results.push({transaction_id:tx.id,provider:"munidex",status:"not_matched_or_not_munidex"});continue}
    const detail=await getText(found.detail_url);if(!detail.ok){results.push({transaction_id:tx.id,provider:"munidex",status:"detail_unavailable",http_status:detail.status});continue}
    const parsed=classifyDetail(detail.text),providerLabel=`${clean(tx.municipality,160)||"Municipality"} · Munidex`,providerKey=`munidex-${districtFor(tx)}`;
    const patch=async(key:string,values:Row)=>{const item=itemMap.get(`${tx.id}:${key}`);if(!item)return;const payload={...safeObj(item.payload),...safeObj(values.payload)};await admin.from("transaction_items").update({...values,payload,updated_at:checkedAt}).eq("id",item.id).eq("user_id",user.id)};
    const liveFields={provider_family:"munidex",munidex_root:found.root,detail_url:found.detail_url,amount_due:parsed.amount_due,principal:parsed.principal,projected_interest:parsed.projected_interest,account_number:parsed.account_number,year:parsed.year,financial_rows:parsed.financial_rows};
    if(parsed.tax_like){
      const issue=(parsed.amount_due??0)>0;const desc=parsed.amount_due!=null?`Live Munidex tax account matched this property. Amount shown from the returned detail page: ${money(parsed.amount_due)}${parsed.principal!=null?`; principal ${money(parsed.principal)}`:""}${parsed.projected_interest!=null?`; projected interest ${money(parsed.projected_interest)}`:""}. This is live account evidence, not a municipal lien certificate or title clearance.`:`Live Munidex tax account matched this property. The detail page was retrieved, but Watchdog did not identify a single governed balance field; use the attached evidence link for the authoritative account detail.`;
      await patch("property_tax_status",{evidence_state:issue?"verify":"clear_observed",severity:issue?"review":"info",source_type:"live_municipal_account",source_label:providerLabel,source_url:found.detail_url,source_checked_at:checkedAt,description:desc,payload:{...liveFields,municipal_live_account_checked:true,result_semantics:desc}});
      if(clean(found.match.name,240))await patch("ownership_vesting",{evidence_state:"verify",severity:"review",source_type:"live_municipal_account",source_label:providerLabel,source_url:found.detail_url,source_checked_at:checkedAt,description:`The live Munidex municipal account search matched this parcel and shows “${clean(found.match.name,240)}” as the account name. Compare against the contract and title commitment; Watchdog is not making a legal vesting determination.`,payload:{owner_name:clean(found.match.name,240),owner_source:"live_municipal_account",provider_family:"munidex",block:found.match.block,lot:found.match.lot,qualifier:found.match.qualcode}})
    }
    if(parsed.utility_like&&!parsed.tax_like){
      const issue=(parsed.amount_due??0)>0;const desc=parsed.amount_due!=null?`Live Munidex utility account matched this property. Current balance/amount due observed: ${money(parsed.amount_due)}. Confirm the final reading and closing payoff with the municipality or utility authority.`:`Live Munidex utility account matched this property. The account detail page was retrieved, but Watchdog did not identify a single governed balance field. Confirm final reading/payoff with the utility authority.`;
      await patch("water_sewer",{evidence_state:issue?"verify":"clear_observed",severity:issue?"review":"info",source_type:"live_municipal_account",source_label:providerLabel,source_url:found.detail_url,source_checked_at:checkedAt,description:desc,payload:{...liveFields,municipal_live_account_checked:true,final_reading_clearance:false,result_semantics:desc}})
    }
    const evidence={match:{block:found.match.block,lot:found.match.lot,qualcode:found.match.qualcode,address1:found.match.address1,name:clean(found.match.name,240)},...liveFields};
    await admin.from("transaction_evidence_observations").upsert({transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,evidence_key:parsed.utility_like&&!parsed.tax_like?"municipal_utility_munidex":"municipal_tax_munidex",provider_key:providerKey,evidence_status:(parsed.amount_due??0)>0?"observed":"no_issue_observed",value:evidence,source_label:providerLabel,source_url:found.detail_url,source_checked_at:checkedAt,facts_hash:await hash(evidence),metadata:{live_account:true,exact_property_match:true,municipal_lien_certificate:false,final_reading_clearance:false}},{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});
    await admin.from("transaction_activity").insert({transaction_id:tx.id,user_id:user.id,action:"municipal_live_evidence_refresh",message:`Live Munidex evidence refreshed for ${clean(tx.address,240)||"property"}`,detail:{provider_family:"munidex",root:found.root,detail_url:found.detail_url,tax_like:parsed.tax_like,utility_like:parsed.utility_like}});
    results.push({transaction_id:tx.id,provider:"munidex",status:"matched",tax_like:parsed.tax_like,utility_like:parsed.utility_like,amount_due:parsed.amount_due});
  }
  return respond(req,200,{ok:true,checked_at:checkedAt,provider_family:"munidex",results});
});
