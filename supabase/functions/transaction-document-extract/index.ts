import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row=Record<string,any>;
const RANK:Record<string,number>={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
const ORIGINS=new Set(["https://watchdogindex.com","https://www.watchdogindex.com","https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const SUPPORTED_TYPES=new Set(["title_commitment","lender_commitment","inspection_report"]);
const TARGET_KEYS=new Set(["title_commitment","mortgage_payoff","mortgage_commitment","clear_to_close","appraisal","inspection","attorney_review","hoa_condo","solar","tenancy_occupancy","estate_probate","divorce_title","bankruptcy","final_walkthrough","closing","municipal_inspection","municipal_lien_clearance","judgment_lien_search","lis_pendens_title_exceptions","permit_certificate_lifecycle","resale_cco","smoke_fire_cert","open_violations","unpermitted_work","recent_improvements","contractor_disputes"]);
const FINDING_TYPES=new Set(["deadline","amount","condition","exception","contact","property_fact","task","other"]);
const SEVERITIES=new Set(["info","review","attention","blocked"]);
const MAX_ANALYSIS_BYTES=20*1024*1024;
const PROCESSOR_VERSION="transaction-document-extract-v1";
const clean=(v:unknown,n=1200)=>String(v??"").replace(/[<>]/g,"").trim().slice(0,n);
const safeObj=(v:unknown)=>(v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{});
const cors=(r:Request)=>({"Access-Control-Allow-Origin":ORIGINS.has(r.headers.get("origin")||"")?(r.headers.get("origin")||""):"https://www.watchdogindex.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"});
const respond=(r:Request,s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json","Cache-Control":"private, no-store"}});
function toBase64(bytes:Uint8Array){let binary="";const step=0x8000;for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));return btoa(binary)}
function outputText(data:Row){if(typeof data?.output_text==="string")return data.output_text;for(const item of Array.isArray(data?.output)?data.output:[]){for(const c of Array.isArray(item?.content)?item.content:[]){if(c?.type==="output_text"&&typeof c.text==="string")return c.text}}return""}
function promptFor(type:string){
  if(type==="title_commitment")return "Extract only transaction-operational facts actually stated in this title commitment: requirements, Schedule B/exception follow-up, mortgage or lien references requiring payoff/discharge review, vesting/party mismatches, municipal/tax search requirements, document requirements, and explicit deadlines or amounts. A recorded exception is a review trigger, not proof it remains enforceable or unsatisfied. Never conclude title is clear.";
  if(type==="lender_commitment")return "Extract only closing-operational facts actually stated in this lender commitment or conditions document: commitment/approval expiration, financing conditions, appraisal/title/insurance/document conditions, cash-to-close or reserve amounts when clearly labeled, outstanding conditions, and clear-to-close follow-up. Do not output account/routing numbers, SSNs, DOBs, credit scores, or unnecessary personal financial detail.";
  return "Extract only material closing-operational facts actually stated in this home inspection report: significant defects, systems needing specialist review, repair/safety follow-up, recommended further evaluation, and material deadlines or estimates when explicitly stated. Do not infer municipal/code violations, legal liability, or conditions not present in the report.";
}
const schema={
  type:"object",additionalProperties:false,required:["summary","warnings","findings"],properties:{
    summary:{type:"string"},warnings:{type:"array",items:{type:"string"},maxItems:12},
    findings:{type:"array",maxItems:40,items:{type:"object",additionalProperties:false,required:["finding_type","label","value_text","date_value","amount_value","target_item_key","page_reference","severity","confidence"],properties:{
      finding_type:{type:"string",enum:["deadline","amount","condition","exception","contact","property_fact","task","other"]},
      label:{type:"string"},value_text:{type:"string"},date_value:{type:"string"},amount_value:{type:"string"},target_item_key:{type:"string"},page_reference:{type:"string"},severity:{type:"string",enum:["info","review","attention","blocked"]},confidence:{type:"number",minimum:0,maximum:1}
    }} }
  }
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",openai=Deno.env.get("OPENAI_API_KEY")||"";
  if(!url||!anon||!service)return respond(req,503,{error:"Document extraction configuration unavailable"});
  if(!openai)return respond(req,503,{error:"Document analysis provider unavailable"});
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:who}=await uc.auth.getUser();const user=who?.user;if(!user)return respond(req,401,{error:"Session invalid"});
  const [{data:ent},{data:profile}]=await Promise.all([admin.from("account_entitlements").select("plan_tier").eq("user_id",user.id).maybeSingle(),admin.from("profiles").select("account_role").eq("id",user.id).maybeSingle()]);
  const plan=profile?.account_role==="developer"?"developer":String(ent?.plan_tier||"standard");if((RANK[plan]??0)<RANK.pro_plus)return respond(req,403,{error:"Pro+ required"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}
  const documentId=clean(body.document_id,80);if(!documentId)return respond(req,400,{error:"document_id required"});
  const {data:doc,error:docError}=await admin.from("transaction_documents").select("id,transaction_id,user_id,document_type,original_name,storage_bucket,storage_path,mime_type,file_size,status,metadata").eq("id",documentId).eq("user_id",user.id).maybeSingle();
  if(docError||!doc)return respond(req,404,{error:"Document not found"});
  if(!SUPPORTED_TYPES.has(doc.document_type))return respond(req,400,{error:"AI review is currently available for title commitments, lender commitments and inspection reports"});
  if(!["application/pdf","image/jpeg","image/png"].includes(doc.mime_type))return respond(req,400,{error:"Unsupported document format"});
  if(Number(doc.file_size||0)>MAX_ANALYSIS_BYTES)return respond(req,413,{error:"AI analysis currently supports documents up to 20 MB"});
  const model=clean(Deno.env.get("WATCHDOG_TRANSACTION_DOCUMENT_MODEL")||"gpt-5.6-luna",80);
  const startedAt=new Date().toISOString();
  await admin.from("transaction_documents").update({extraction_status:"processing",updated_at:startedAt}).eq("id",doc.id).eq("user_id",user.id);
  try{
    const download=await admin.storage.from(doc.storage_bucket||"transaction-documents").download(doc.storage_path);if(download.error||!download.data)throw new Error("Private document could not be loaded");
    const bytes=new Uint8Array(await download.data.arrayBuffer());if(bytes.byteLength>MAX_ANALYSIS_BYTES)throw new Error("Document exceeds the AI analysis limit");
    const b64=toBase64(bytes),fileInput=doc.mime_type==="application/pdf"?{type:"input_file",filename:clean(doc.original_name,180)||"document.pdf",file_data:b64}:{type:"input_image",image_url:`data:${doc.mime_type};base64,${b64}`,detail:"auto"};
    const developer="You extract closing-workflow facts from a private real-estate transaction document supplied by the authorized user. Never infer facts not explicitly supported by the document. Do not decide legal validity, title clearance, municipal clearance, loan approval, code compliance, or inspection safety beyond what the document states. Do not output SSNs, bank/routing/account numbers, dates of birth, signatures, health data, protected-class traits, or unrelated private-life details. Keep page/reference pointers when visible. Findings are proposals for human review and must not be described as independently verified public evidence.";
    const requestId=crypto.randomUUID();const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),65000);let response:Response;try{
      response=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:ctl.signal,headers:{Authorization:`Bearer ${openai}`,"Content-Type":"application/json","X-Client-Request-Id":requestId},body:JSON.stringify({model,store:false,input:[{role:"developer",content:[{type:"input_text",text:developer}]},{role:"user",content:[{type:"input_text",text:`Document type: ${doc.document_type}. ${promptFor(doc.document_type)} Return concise findings only.`},fileInput]}],text:{format:{type:"json_schema",name:"transaction_document_findings",description:"Human-reviewable closing facts extracted from one private transaction document",strict:true,schema}}})});
    }finally{clearTimeout(timer)}
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(clean(data?.error?.message||`OpenAI ${response.status}`,400));
    const text=outputText(data);if(!text)throw new Error("Analysis returned no structured findings");let parsed:Row;try{parsed=JSON.parse(text)}catch{throw new Error("Analysis returned invalid structured output")}
    const raw=Array.isArray(parsed.findings)?parsed.findings:[],findings:Row[]=[];
    for(const f of raw.slice(0,40)){
      const type=FINDING_TYPES.has(clean(f.finding_type,40))?clean(f.finding_type,40):"other",severity=SEVERITIES.has(clean(f.severity,40))?clean(f.severity,40):"review",target=TARGET_KEYS.has(clean(f.target_item_key,100))?clean(f.target_item_key,100):null,label=clean(f.label,240),valueText=clean(f.value_text,1200);if(!label||!valueText)continue;
      findings.push({document_id:doc.id,transaction_id:doc.transaction_id,user_id:user.id,finding_type:type,label,value:{text:valueText,date:clean(f.date_value,80)||null,amount:clean(f.amount_value,120)||null,document_type:doc.document_type,document_supplied:true,independent_public_evidence:false},target_item_key:target,page_reference:clean(f.page_reference,120)||null,severity,confidence:Math.max(0,Math.min(Number(f.confidence)||0,1)),review_state:"proposed"});
    }
    await admin.from("transaction_document_findings").delete().eq("document_id",doc.id).eq("user_id",user.id).eq("review_state","proposed");
    if(findings.length){const inserted=await admin.from("transaction_document_findings").insert(findings);if(inserted.error)throw inserted.error}
    const completedAt=new Date().toISOString(),warnings=(Array.isArray(parsed.warnings)?parsed.warnings:[]).slice(0,12).map((x:unknown)=>clean(x,500)).filter(Boolean),summary=clean(parsed.summary,1500);
    const extraction={processor_version:PROCESSOR_VERSION,provider:"openai",model,request_id:requestId,extracted_at:completedAt,finding_count:findings.length,summary,warnings,usage:safeObj(data?.usage),store:false,document_supplied:true,independent_public_evidence:false};
    await admin.from("transaction_documents").update({status:"review_required",extraction_status:"complete",extraction,updated_at:completedAt}).eq("id",doc.id).eq("user_id",user.id);
    await admin.from("transaction_activity").insert({transaction_id:doc.transaction_id,user_id:user.id,action:"transaction_document_extract",message:`AI review proposed ${findings.length} finding${findings.length===1?"":"s"} from ${clean(doc.original_name,180)}`,detail:{document_id:doc.id,document_type:doc.document_type,finding_count:findings.length,processor_version:PROCESSOR_VERSION,model,private_document:true,independent_public_evidence:false}});
    return respond(req,200,{ok:true,document_id:doc.id,extraction_status:"complete",finding_count:findings.length,summary,warnings});
  }catch(error){const message=clean((error as any)?.message||error,500)||"Document analysis failed";await admin.from("transaction_documents").update({extraction_status:"failed",metadata:{...safeObj(doc.metadata),last_extraction_error:message,last_extraction_failed_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq("id",doc.id).eq("user_id",user.id);return respond(req,502,{error:message})}
});
