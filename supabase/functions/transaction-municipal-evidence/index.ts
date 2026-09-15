import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const RANK: Record<string, number> = { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 };
const WIPP_BASE = "https://api.edmundsgovtech.cloud/wipp-core/v1";
const WIPP_PORTAL = "https://wipp.edmundsgovtech.cloud";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36 Watchdog-Municipal-Evidence/1.0";
const ORIGINS = new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const clean=(v:unknown,n=1000)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safeObj=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const env=(jsonName:string,legacyName:string)=>{const raw=Deno.env.get(jsonName)||"";if(raw){try{const p=JSON.parse(raw);if(p?.default)return String(p.default)}catch{}}return Deno.env.get(legacyName)||""};
const cors=(req:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("origin")||"")?(req.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const respond=(req:Request,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
const numberOrNull=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(/[$,]/g,""));return Number.isFinite(n)?n:null};
const money=(v:number|null)=>v==null?"unknown":v.toLocaleString("en-US",{style:"currency",currency:"USD"});
const add=(...v:(number|null)[])=>v.reduce((s,n)=>s+(n||0),0);
const truthFlag=(v:unknown)=>{if(v===true)return true;if(v===false)return false;const s=clean(v,30).toUpperCase();if(!s)return null;if(["Y","YES","TRUE","1","S","T"].includes(s))return true;if(["N","NO","FALSE","0"].includes(s))return false;return null};
async function hash(value:unknown){const data=new TextEncoder().encode(JSON.stringify(value));const buf=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")}

const SUFFIX: Record<string,string> = { STREET:"ST",ST:"ST",ROAD:"RD",RD:"RD",AVENUE:"AVE",AVE:"AVE",COURT:"CT",CT:"CT",DRIVE:"DR",DR:"DR",LANE:"LN",LN:"LN",PLACE:"PL",PL:"PL",BOULEVARD:"BLVD",BLVD:"BLVD",TERRACE:"TER",TER:"TER",CIRCLE:"CIR",CIR:"CIR",PARKWAY:"PKWY",PKWY:"PKWY",HIGHWAY:"HWY",HWY:"HWY",TRAIL:"TRL",TRL:"TRL",WAY:"WAY" };
function streetOnly(v:unknown){return clean(v,240).split(",")[0].trim()}
function normStreet(v:unknown){
  const raw=streetOnly(v).toUpperCase().replace(/[^A-Z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  const parts=raw.split(" ").filter(Boolean);if(parts.length&&SUFFIX[parts[parts.length-1]])parts[parts.length-1]=SUFFIX[parts[parts.length-1]];return parts.join(" ");
}
function searchTerm(v:unknown){
  const raw=streetOnly(v).replace(/[^A-Za-z0-9 ]+/g," ").replace(/\s+/g," ").trim();const parts=raw.split(" ").filter(Boolean);
  if(parts.length>2&&SUFFIX[String(parts[parts.length-1]).toUpperCase()])parts.pop();return parts.join(" ").slice(0,100);
}
function compactParcel(v:unknown){let s=clean(v,40).toUpperCase().replace(/\s+/g,"").replace(/^0+(?=\d)/,"");if(/^\d+(?:\.\d+)?$/.test(s)&&s.includes("."))s=s.replace(/0+$/,"").replace(/\.$/,"");return s}
function pickAddressMatch(rows:Row[],tx:Row){
  const wanted=normStreet(tx.address);if(!wanted)return null;
  const exact=rows.filter(r=>normStreet(r.propertyLoc)===wanted);
  if(exact.length===1)return exact[0];
  if(exact.length>1){
    const b=compactParcel(tx.block),l=compactParcel(tx.lot);
    if(b&&l){const parcel=exact.filter(r=>{const x=clean(r.blqId,120).toUpperCase().replace(/\s+/g,"");return x.includes(b)&&x.includes(l)});if(parcel.length===1)return parcel[0]}
  }
  return null;
}
function wippHeaders(id:string){return {"X-Wipp-Id":id,"User-Agent":UA,"Accept":"application/json"}}
async function wippGet(id:string,path:string,timeoutMs=8000){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(`${WIPP_BASE}${path}`,{headers:wippHeaders(id),signal:controller.signal});
    const data=await r.json().catch(()=>null);return {ok:r.ok,status:r.status,data};
  }catch(error){return {ok:false,status:0,data:null,error:clean(error,240)}}finally{clearTimeout(timeout)}
}
function districtFor(tx:Row){const pin=clean(tx.pams_pin,100);const id=pin.slice(0,4);return /^\d{4}$/.test(id)?id:""}
function taxEvidenceUrl(id:string,account:string){return `${WIPP_PORTAL}/view/wippTaxes/${encodeURIComponent(account.trim())}?wippId=${encodeURIComponent(id)}`}
function utilDisplayId(raw:string){const parts=raw.trim().split(/\s+/).filter(Boolean);return parts.length>1?parts.join("-"):raw.trim()}
function utilEvidenceUrl(id:string,account:string){return `${WIPP_PORTAL}/view/wippUtil/${encodeURIComponent(utilDisplayId(account))}?wippId=${encodeURIComponent(id)}`}
function parseDate(v:unknown){const s=clean(v,40);if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d:null}

function parseTax(detail:Row,now:Date){
  const property=safeObj(detail.propertyInfo);const quarters:Row[]=[];const years=safeObj(detail.taxYears);
  for(const [year,groupsRaw] of Object.entries(years)){
    const groups=safeObj(groupsRaw);const taxRows=Array.isArray(groups.NJTAX)?groups.NJTAX:[];
    for(const tax of taxRows){
      const t=safeObj(tax);
      for(let q=1;q<=4;q++){
        const orig=numberOrNull(t[`qtr${q}OrigBilled`]),adj=numberOrNull(t[`qtr${q}AdjBilled`]),principal=numberOrNull(t[`qtr${q}PrnBal`]),interest=numberOrNull(t[`qtr${q}IntDue`]);
        const dueRaw=clean(t[`qtr${q}DueDate`],50),due=parseDate(dueRaw);if(orig==null&&adj==null&&principal==null&&interest==null&&!dueRaw)continue;
        const balance=add(principal,interest),status=balance<=0&&(orig||adj||0)>0?"paid":balance>0&&due&&due.getTime()<now.getTime()?"past_due":balance>0?"open":"none";
        quarters.push({year:Number(year)||year,quarter:q,due_date:dueRaw||null,original_billed:orig,adjusted_billed:adj,principal_balance:principal,interest_due:interest,balance,status});
      }
    }
  }
  quarters.sort((a,b)=>String(a.due_date||"").localeCompare(String(b.due_date||"")));
  const open=quarters.filter(q=>Number(q.balance||0)>0),past=open.filter(q=>q.status==="past_due");
  const openBalance=open.reduce((s,q)=>s+Number(q.balance||0),0),pastDue=past.reduce((s,q)=>s+Number(q.balance||0),0),interest=open.reduce((s,q)=>s+Number(q.interest_due||0),0);
  const currentYear=String(now.getFullYear()),currentBilled=quarters.filter(q=>String(q.year)===currentYear).reduce((s,q)=>s+Number(q.adjusted_billed??q.original_billed??0),0);
  return {property,quarters,open_balance:openBalance,past_due_balance:pastDue,interest_due:interest,current_year_billed:currentBilled,tax_sale_flag:truthFlag(property.taxSaleFlag),last_payment:clean(property.lastDatePaid,80)||null,tax_per_diem:numberOrNull(property.taxPerDiem),owner_name:clean(property.ownerName,240)||null};
}
function parseUtility(detail:Row,now:Date){
  const chargeTypes=safeObj(detail.chargeTypes),services:Row[]=[];
  for(const [label,raw] of Object.entries(chargeTypes)){
    const s=safeObj(raw),principal=numberOrNull(s.totPrnBal),interest=numberOrNull(s.totIntDue),future=numberOrNull(s.futurePrnBal),otherDelq=add(numberOrNull(s.otrDelqPrnBal),numberOrNull(s.otrDelqIntDue));
    const amountDue=Math.max(0,add(principal,interest)-(future||0)),dueRaw=clean(s.currDueDate,50),due=parseDate(dueRaw),pastDue=Math.max(otherDelq,due&&due.getTime()<now.getTime()?amountDue:0);
    services.push({service:clean(label,120),amount_due:amountDue,principal_balance:principal,interest_due:interest,future_principal:future,delinquent_balance:pastDue,due_date:dueRaw||null,last_payment:clean(s.lastDatePaid,80)||null,billed_ytd:numberOrNull(s.billedYtd),current_period_billed:numberOrNull(s.currPrdBilled)});
  }
  const amountDue=services.reduce((n,s)=>n+Number(s.amount_due||0),0),delinquent=services.reduce((n,s)=>n+Number(s.delinquent_balance||0),0),interest=services.reduce((n,s)=>n+Number(s.interest_due||0),0);
  const lastPayments=services.map(s=>s.last_payment).filter(Boolean).sort();
  return {services,amount_due:amountDue,delinquent_balance:delinquent,interest_due:interest,last_payment:lastPayments.at(-1)||null,owner_name:clean(detail.utilityOwnerInfo?.name||detail.billToName,240)||null,property_location:clean(detail.propertyLoc||detail.serviceLoc,240)||null};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");if(!url||!pub||!secret)return respond(req,503,{error:"Municipal evidence configuration incomplete"});
  const uc=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:entitlement},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);const plan=String(profile?.account_role||"")==="developer"?"developer":String(entitlement?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ plan required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}const ids=[...new Set((Array.isArray(body.transaction_ids)?body.transaction_ids:[]).map((x:unknown)=>clean(x,80)).filter(Boolean))].slice(0,50);if(!ids.length)return respond(req,400,{error:"transaction_ids required"});
  const {data:txs,error:txErr}=await admin.from("transaction_workspaces").select("id,user_id,address,municipality,county,block,lot,qualifier,pams_pin").eq("user_id",user.id).in("id",ids);if(txErr)return respond(req,503,{error:"Transactions unavailable"});
  const {data:items}=await admin.from("transaction_items").select("id,transaction_id,item_key,payload,evidence_state,source_type").eq("user_id",user.id).in("transaction_id",ids).in("item_key",["ownership_vesting","property_tax_status","tax_sale_delinquency","water_sewer"]);const itemMap=new Map<string,Row>();for(const i of items||[])itemMap.set(`${i.transaction_id}:${i.item_key}`,i);
  const metaCache=new Map<string,Promise<any>>();const now=new Date(),checkedAt=now.toISOString();
  const getMeta=(id:string)=>{if(!metaCache.has(id))metaCache.set(id,wippGet(id,`/metadata/${id}`));return metaCache.get(id)!};
  const results:Row[]=[];

  const processTx=async(tx:Row)=>{
    const district=districtFor(tx);if(!district)return {transaction_id:tx.id,provider:"wipp",status:"no_district"};
    const meta=await getMeta(district);if(!meta?.ok||!meta.data)return {transaction_id:tx.id,provider:"wipp",wipp_id:district,status:"provider_not_available",http_status:meta?.status||0};
    const term=searchTerm(tx.address);if(!term)return {transaction_id:tx.id,provider:"wipp",wipp_id:district,status:"address_unusable"};
    const providerLabel=`${clean(meta.data.cityName,160)||clean(tx.municipality,160)||"Municipality"} · Edmunds GovTech WIPP`;
    const providerKey=`edmunds-wipp-${district}`;
    const patch=async(key:string,values:Row)=>{const item=itemMap.get(`${tx.id}:${key}`);if(!item)return;const payload={...safeObj(item.payload),...safeObj(values.payload)};await admin.from("transaction_items").update({...values,payload,updated_at:checkedAt}).eq("id",item.id).eq("user_id",user.id);item.payload=payload};
    let taxResult:Row={status:"not_checked"},utilResult:Row={status:"not_checked"};

    const taxSearch=await wippGet(district,`/wippPropInfo/search?propertyLoc=${encodeURIComponent(term)}&size=25`);
    if(taxSearch.ok&&Array.isArray(taxSearch.data?.content)){
      const match=pickAddressMatch(taxSearch.data.content,tx);
      if(match){
        const account=clean(match.accountId,100);const detail=account?await wippGet(district,`/wippTaxes/${encodeURIComponent(account)}`):{ok:false,status:0,data:null};
        if(detail.ok&&detail.data){
          const parsed=parseTax(detail.data,now),sourceUrl=taxEvidenceUrl(district,account),isIssue=parsed.tax_sale_flag===true||parsed.past_due_balance>0;
          const desc=parsed.tax_sale_flag===true?`Live municipal WIPP tax account matched this property and carries a tax-sale flag. Past-due tax/interest observed: ${money(parsed.past_due_balance)}; total open tax balance: ${money(parsed.open_balance)}; interest currently shown: ${money(parsed.interest_due)}${parsed.last_payment?`; last payment shown ${parsed.last_payment}`:""}. Confirm payoff and lien status with the Tax Collector/title search.`:parsed.past_due_balance>0?`Live municipal WIPP tax account matched this property. Past-due tax/interest observed: ${money(parsed.past_due_balance)}; total open balance: ${money(parsed.open_balance)}; interest currently shown: ${money(parsed.interest_due)}${parsed.last_payment?`; last payment shown ${parsed.last_payment}`:""}. Verify the closing payoff with the Tax Collector/title search.`:`Live municipal WIPP tax account matched this property. No past-due tax/interest was observed at the check time. Total open/future tax balance shown by the portal: ${money(parsed.open_balance)}${parsed.last_payment?`; last payment shown ${parsed.last_payment}`:""}. This is live account evidence, not a municipal lien certificate.`;
          await patch("property_tax_status",{evidence_state:isIssue?"issue_observed":"clear_observed",severity:parsed.tax_sale_flag===true?"high":parsed.past_due_balance>0?"attention":"info",source_type:"live_municipal_account",source_label:providerLabel,source_url:sourceUrl,source_checked_at:checkedAt,description:desc,payload:{municipal_live_account_checked:true,provider_family:"edmunds_wipp",wipp_id:district,municipal_account_id:account,live_open_balance:parsed.open_balance,live_past_due_balance:parsed.past_due_balance,live_interest_due:parsed.interest_due,live_tax_sale_flag:parsed.tax_sale_flag,live_last_payment:parsed.last_payment,tax_per_diem:parsed.tax_per_diem,live_quarters:parsed.quarters,current_year_tax:safeObj(itemMap.get(`${tx.id}:property_tax_status`)?.payload).current_year_tax??parsed.current_year_billed,tax_account_number:account,source_state:"live_municipal_checked",current_balance_state:"live_provider_checked",result_semantics:desc}});
          const saleDesc=parsed.tax_sale_flag===true?`The live municipal WIPP tax account carries a tax-sale flag. This is direct municipal account evidence; confirm the certificate, redemption/payoff and recording status with the collector/title search.`:parsed.past_due_balance>0?`The live municipal account shows ${money(parsed.past_due_balance)} in past-due tax/interest, but no tax-sale flag was returned. Delinquency and tax-sale certificate status are separate; verify with the collector/title search.`:`The live municipal WIPP account was successfully searched and did not return a tax-sale flag or past-due tax/interest at the check time. This does not replace a municipal lien certificate or county/title search.`;
          await patch("tax_sale_delinquency",{evidence_state:parsed.tax_sale_flag===true||parsed.past_due_balance>0?"issue_observed":"clear_observed",severity:parsed.tax_sale_flag===true?"high":parsed.past_due_balance>0?"attention":"info",source_type:"live_municipal_account",source_label:providerLabel,source_url:sourceUrl,source_checked_at:checkedAt,description:saleDesc,payload:{live_municipal_checked:true,provider_family:"edmunds_wipp",wipp_id:district,municipal_account_id:account,live_tax_sale_flag:parsed.tax_sale_flag,live_past_due_balance:parsed.past_due_balance,live_interest_due:parsed.interest_due,tax_sale_state:parsed.tax_sale_flag===true?"FLAGGED in live municipal account":parsed.tax_sale_flag===false?"No live tax-sale flag observed":"Live account did not expose a tax-sale flag"}});
          if(parsed.owner_name){await patch("ownership_vesting",{evidence_state:"verify",severity:"review",source_type:"live_municipal_account",source_label:providerLabel,source_url:sourceUrl,source_checked_at:checkedAt,description:`The live municipal tax account shows “${parsed.owner_name}” as the owner name on the account. Compare this with the contract and title commitment; Watchdog is not making a legal vesting determination.`,payload:{owner_name:parsed.owner_name,block:tx.block,lot:tx.lot,owner_source:"live_municipal_tax_account",provider_family:"edmunds_wipp",wipp_id:district}})}
          const evidence={provider_family:"edmunds_wipp",wipp_id:district,account_id:account,open_balance:parsed.open_balance,past_due_balance:parsed.past_due_balance,interest_due:parsed.interest_due,tax_sale_flag:parsed.tax_sale_flag,last_payment:parsed.last_payment,tax_per_diem:parsed.tax_per_diem,quarters:parsed.quarters,owner_name:parsed.owner_name};
          await admin.from("transaction_evidence_observations").upsert({transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,evidence_key:"municipal_tax_wipp",provider_key:providerKey,evidence_status:isIssue?"observed":"no_issue_observed",value:evidence,source_label:providerLabel,source_url:sourceUrl,source_checked_at:checkedAt,facts_hash:await hash(evidence),metadata:{live_account:true,municipal_lien_certificate:false,exact_address_match:true}},{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});
          taxResult={status:"matched",account_id:account,past_due_balance:parsed.past_due_balance,open_balance:parsed.open_balance,tax_sale_flag:parsed.tax_sale_flag};
        }else taxResult={status:"detail_unavailable",http_status:detail.status};
      }else taxResult={status:"no_exact_address_match",candidate_count:taxSearch.data.content.length};
    }else taxResult={status:"search_unavailable",http_status:taxSearch.status};

    const utilSearch=await wippGet(district,`/wippUtil/search?propertyLoc=${encodeURIComponent(term)}&size=25`);
    if(utilSearch.ok&&Array.isArray(utilSearch.data?.content)){
      const match=pickAddressMatch(utilSearch.data.content,tx);
      if(match){
        const rawAccount=String(match.accountId??"");const detail=rawAccount.trim()?await wippGet(district,`/wippUtil/${encodeURIComponent(rawAccount)}`):{ok:false,status:0,data:null};
        if(detail.ok&&detail.data){
          const parsed=parseUtility(detail.data,now),sourceUrl=utilEvidenceUrl(district,rawAccount),isIssue=parsed.delinquent_balance>0;
          const desc=isIssue?`Live WIPP utility account matched this property. Delinquent water/sewer/utility amount observed: ${money(parsed.delinquent_balance)}; current amount due: ${money(parsed.amount_due)}; interest shown: ${money(parsed.interest_due)}${parsed.last_payment?`; last payment shown ${parsed.last_payment}`:""}. Verify the final reading/payoff with the municipality or utility authority.`:parsed.amount_due>0?`Live WIPP utility account matched this property. Current amount due: ${money(parsed.amount_due)}; no delinquent utility amount was observed in the returned service data${parsed.last_payment?`; last payment shown ${parsed.last_payment}`:""}. Confirm final reading and closing payoff with the utility authority.`:`Live WIPP utility account matched this property and no current or delinquent utility balance was observed at the check time${parsed.last_payment?`; last payment shown ${parsed.last_payment}`:""}. Confirm any final-reading charge required for closing.`;
          await patch("water_sewer",{evidence_state:isIssue?"issue_observed":parsed.amount_due>0?"verify":"clear_observed",severity:isIssue?"high":parsed.amount_due>0?"review":"info",source_type:"live_municipal_account",source_label:providerLabel,source_url:sourceUrl,source_checked_at:checkedAt,description:desc,payload:{municipal_live_account_checked:true,provider_family:"edmunds_wipp",wipp_id:district,utility_account_id:utilDisplayId(rawAccount),live_amount_due:parsed.amount_due,live_delinquent_balance:parsed.delinquent_balance,live_interest_due:parsed.interest_due,live_last_payment:parsed.last_payment,services:parsed.services,current_balance_state:"live_provider_checked",result_semantics:desc}});
          const evidence={provider_family:"edmunds_wipp",wipp_id:district,account_id:utilDisplayId(rawAccount),amount_due:parsed.amount_due,delinquent_balance:parsed.delinquent_balance,interest_due:parsed.interest_due,last_payment:parsed.last_payment,services:parsed.services};
          await admin.from("transaction_evidence_observations").upsert({transaction_id:tx.id,user_id:user.id,pams_pin:tx.pams_pin,evidence_key:"municipal_utility_wipp",provider_key:providerKey,evidence_status:isIssue?"observed":"no_issue_observed",value:evidence,source_label:providerLabel,source_url:sourceUrl,source_checked_at:checkedAt,facts_hash:await hash(evidence),metadata:{live_account:true,final_reading_clearance:false,exact_address_match:true}},{onConflict:"transaction_id,evidence_key,provider_key,facts_hash",ignoreDuplicates:true});
          utilResult={status:"matched",amount_due:parsed.amount_due,delinquent_balance:parsed.delinquent_balance,service_count:parsed.services.length};
        }else utilResult={status:"detail_unavailable",http_status:detail.status};
      }else utilResult={status:"no_exact_address_match",candidate_count:utilSearch.data.content.length};
    }else utilResult={status:"search_unavailable",http_status:utilSearch.status};

    if(taxResult.status==="matched"||utilResult.status==="matched")await admin.from("transaction_activity").insert({transaction_id:tx.id,user_id:user.id,action:"municipal_live_evidence_refresh",message:`Live municipal WIPP evidence refreshed for ${clean(tx.address,240)||"property"}`,detail:{provider_family:"edmunds_wipp",wipp_id:district,tax_status:taxResult.status,utility_status:utilResult.status}});
    return {transaction_id:tx.id,provider:"wipp",wipp_id:district,status:taxResult.status==="matched"||utilResult.status==="matched"?"matched":"checked",tax:taxResult,utility:utilResult};
  };

  for(let i=0;i<(txs||[]).length;i+=4){const batch=(txs||[]).slice(i,i+4);const rows=await Promise.all(batch.map(processTx));results.push(...rows)}
  return respond(req,200,{ok:true,checked_at:checkedAt,provider_family:"edmunds_wipp",results});
});
