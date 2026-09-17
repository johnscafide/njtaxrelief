import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;
const SITE = Deno.env.get("WATCHDOG_PUBLIC_SITE_URL") || "https://www.watchdogindex.com";
const BUCKET = "transaction-documents";
const MAX_BYTES = 26214400;
const MIME = new Set(["application/pdf","image/jpeg","image/png"]);
const ROLE = new Set(["title","lender","tc","attorney","other"]);
const RANK: Record<string, number> = { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 };
const ORIGINS = new Set([
  "https://watchdogindex.com","https://www.watchdogindex.com",
  "https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com",
  "http://localhost:3000","http://127.0.0.1:3000","http://localhost:4173","http://127.0.0.1:4173"
]);

const clean = (v: unknown, n=1000) => String(v ?? "").replace(/[<>\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const email = (v: unknown) => clean(v,320).toLowerCase();
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": ORIGINS.has(req.headers.get("origin") || "") ? (req.headers.get("origin") || "") : "https://www.watchdogindex.com",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const respond = (req: Request,status:number,body:unknown) => new Response(JSON.stringify(body),{
  status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}
});
const env = (jsonName:string, legacyName:string) => {
  const raw=Deno.env.get(jsonName)||"";
  if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default)}catch{}}
  return Deno.env.get(legacyName)||"";
};
const hex = (bytes:ArrayBuffer) => Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,"0")).join("");
async function hashToken(token:string){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))}
function randomToken(){
  const b=new Uint8Array(32);crypto.getRandomValues(b);
  let s="";for(const x of b)s+=String.fromCharCode(x);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function safeFileName(v:unknown){
  return clean(v,180).replace(/[^A-Za-z0-9._ -]/g,"_").replace(/\s+/g," ").replace(/^\.+/,"") || "document";
}
function emailHint(v:unknown){
  const e=email(v),parts=e.split("@");if(parts.length!==2)return "the invited email";
  const local=parts[0]||"",domain=parts[1]||"";
  return (local.slice(0,1)||"*")+"***@"+domain;
}
async function ownerTier(admin:any,ownerId:string){
  const [{data:ent},{data:profile}] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier,subscription_status").eq("user_id",ownerId).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id",ownerId).maybeSingle()
  ]);
  const plan = String(profile?.account_role||"")==="developer" ? "developer" : String(ent?.plan_tier||"standard");
  return {plan,allowed:(RANK[plan]??0)>=RANK.pro_plus};
}
async function ownedWorkspace(admin:any,txId:string,ownerId:string){
  const {data}=await admin.from("transaction_workspaces").select("*").eq("id",txId).eq("user_id",ownerId).maybeSingle();
  return data||null;
}
async function membership(admin:any,txId:string,memberId:string){
  const {data}=await admin.from("transaction_professional_memberships")
    .select("*").eq("transaction_id",txId).eq("member_user_id",memberId).eq("status","active").is("revoked_at",null).maybeSingle();
  return data||null;
}
async function requireShared(admin:any,txId:string,memberId:string){
  const m=await membership(admin,txId,memberId);
  if(!m)return {error:"This transaction is not shared with your account.",status:403};
  const tier=await ownerTier(admin,String(m.owner_user_id));
  if(!tier.allowed)return {error:"The transaction owner no longer has collaboration access.",status:403};
  return {membership:m,tier};
}
function publicWorkspace(w:Row){
  return {
    id:w.id,address:w.address,city:w.city,state:w.state,postal_code:w.postal_code,
    municipality:w.municipality,county:w.county,block:w.block,lot:w.lot,qualifier:w.qualifier,
    side:w.side,status:w.status,contract_date:w.contract_date,closing_date:w.closing_date,
    readiness_status:w.readiness_status,last_watch_at:w.last_watch_at,agent_name:w.agent_name
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return respond(req,405,{error:"POST required"});
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return respond(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"";
  const publishable=env("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
  const secret=env("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!publishable||!secret)return respond(req,503,{error:"Collaboration service configuration incomplete"});
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData}=await userClient.auth.getUser();
  const user=authData?.user;
  if(!user)return respond(req,401,{error:"Session invalid"});
  let body:Row={};try{body=await req.json()}catch{return respond(req,400,{error:"Invalid JSON"})}
  const action=clean(body.action,80);

  if(action==="create_invite"){
    const txId=clean(body.transaction_id,80), invited=email(body.email), role=clean(body.role,24);
    if(!txId||!invited||!invited.includes("@")||!ROLE.has(role))return respond(req,400,{error:"transaction_id, email and professional role are required"});
    const w=await ownedWorkspace(admin,txId,user.id);if(!w)return respond(req,404,{error:"Transaction not found"});
    const tier=await ownerTier(admin,user.id);if(!tier.allowed)return respond(req,403,{error:"Pro+ or higher is required to invite transaction professionals"});
    await admin.from("transaction_professional_invites").update({revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq("transaction_id",txId).eq("owner_user_id",user.id).eq("invited_email",invited).is("accepted_at",null).is("revoked_at",null);
    const token=randomToken(), tokenHash=await hashToken(token), expires=new Date(Date.now()+30*864e5).toISOString();
    const {data,error}=await admin.from("transaction_professional_invites").insert({
      transaction_id:txId,owner_user_id:user.id,invited_email:invited,role,permission:"view_upload",
      token_hash:tokenHash,expires_at:expires
    }).select("id,transaction_id,invited_email,role,permission,expires_at,created_at").single();
    if(error)return respond(req,500,{error:"Could not create invitation"});
    const inviteUrl=SITE.replace(/\/$/,"")+"/transaction/shared/?invite="+encodeURIComponent(token);
    await admin.from("transaction_activity").insert({
      transaction_id:txId,user_id:user.id,actor_user_id:user.id,action:"professional_invite_created",
      message:"Invited a "+role+" professional to this transaction",detail:{invite_id:data.id,role,email_domain:invited.split("@")[1]||null}
    });
    return respond(req,200,{invite:data,invite_url:inviteUrl});
  }

  if(action==="list_collaborators"){
    const txId=clean(body.transaction_id,80);
    const w=await ownedWorkspace(admin,txId,user.id);if(!w)return respond(req,404,{error:"Transaction not found"});
    const tier=await ownerTier(admin,user.id);if(!tier.allowed)return respond(req,403,{error:"Pro+ or higher is required"});
    const [ir,mr]=await Promise.all([
      admin.from("transaction_professional_invites").select("id,invited_email,role,permission,expires_at,accepted_at,revoked_at,created_at")
        .eq("transaction_id",txId).eq("owner_user_id",user.id).order("created_at",{ascending:false}),
      admin.from("transaction_professional_memberships").select("id,member_user_id,invited_email,role,permission,status,joined_at,revoked_at")
        .eq("transaction_id",txId).eq("owner_user_id",user.id).order("joined_at",{ascending:false})
    ]);
    return respond(req,200,{transaction:{id:w.id,address:w.address},invites:ir.data||[],members:mr.data||[]});
  }

  if(action==="revoke"){
    const txId=clean(body.transaction_id,80), inviteId=clean(body.invite_id,80), membershipId=clean(body.membership_id,80);
    const w=await ownedWorkspace(admin,txId,user.id);if(!w)return respond(req,404,{error:"Transaction not found"});
    const now=new Date().toISOString();
    if(membershipId){
      await admin.from("transaction_professional_memberships").update({status:"revoked",revoked_at:now,updated_at:now})
        .eq("id",membershipId).eq("transaction_id",txId).eq("owner_user_id",user.id);
    }
    if(inviteId){
      await admin.from("transaction_professional_invites").update({revoked_at:now,updated_at:now})
        .eq("id",inviteId).eq("transaction_id",txId).eq("owner_user_id",user.id);
    }
    await admin.from("transaction_activity").insert({
      transaction_id:txId,user_id:user.id,actor_user_id:user.id,action:"professional_access_revoked",
      message:"Revoked shared professional access",detail:{invite_id:inviteId||null,membership_id:membershipId||null}
    });
    return respond(req,200,{ok:true});
  }

  if(action==="accept_invite"){
    const token=clean(body.token,300);if(!token)return respond(req,400,{error:"Invitation token required"});
    const tokenHash=await hashToken(token);
    const {data:inv}=await admin.from("transaction_professional_invites").select("*").eq("token_hash",tokenHash).maybeSingle();
    if(!inv||inv.revoked_at||new Date(inv.expires_at).getTime()<Date.now())return respond(req,410,{error:"This invitation is expired or no longer available"});
    if(email(user.email)!==email(inv.invited_email))return respond(req,403,{error:"This invitation was sent to a different email address",invited_hint:emailHint(inv.invited_email)});
    const tier=await ownerTier(admin,String(inv.owner_user_id));if(!tier.allowed)return respond(req,403,{error:"The transaction owner no longer has collaboration access"});
    const now=new Date().toISOString();
    const {data:m,error}=await admin.from("transaction_professional_memberships").upsert({
      transaction_id:inv.transaction_id,owner_user_id:inv.owner_user_id,member_user_id:user.id,
      invited_email:inv.invited_email,role:inv.role,permission:inv.permission,status:"active",revoked_at:null,updated_at:now
    },{onConflict:"transaction_id,member_user_id"}).select("*").single();
    if(error)return respond(req,500,{error:"Could not accept invitation"});
    await admin.from("transaction_professional_invites").update({accepted_user_id:user.id,accepted_at:now,updated_at:now}).eq("id",inv.id);
    await admin.from("transaction_activity").insert({
      transaction_id:inv.transaction_id,user_id:inv.owner_user_id,actor_user_id:user.id,action:"professional_invite_accepted",
      message:"A "+inv.role+" professional joined this transaction",detail:{membership_id:m.id,role:inv.role}
    });
    return respond(req,200,{transaction_id:inv.transaction_id,role:inv.role,permission:inv.permission});
  }

  if(action==="shared_snapshot"){
    const txId=clean(body.transaction_id,80), access=await requireShared(admin,txId,user.id);
    if((access as any).error)return respond(req,(access as any).status,{error:(access as any).error});
    const m=(access as any).membership;
    const [wr,ir,dr]=await Promise.all([
      admin.from("transaction_workspaces").select("*").eq("id",txId).eq("user_id",m.owner_user_id).maybeSingle(),
      admin.from("transaction_items").select("id,category,item_key,title,description,severity,state,evidence_state,assigned_role,due_date,source_type,source_label,source_url,source_checked_at,updated_at")
        .eq("transaction_id",txId).eq("user_id",m.owner_user_id).order("sort_order"),
      admin.from("transaction_documents").select("id,document_type,document_label,original_name,mime_type,file_size,status,created_at,uploaded_by_user_id,uploaded_by_role")
        .eq("transaction_id",txId).eq("user_id",m.owner_user_id).neq("status","replaced").order("created_at",{ascending:false})
    ]);
    if(!wr.data)return respond(req,404,{error:"Shared transaction not found"});
    const sharedItems=(ir.data||[]).filter((item:any)=>!String(item.item_key||"").startsWith("custom_")||item.assigned_role===m.role);
    return respond(req,200,{
      membership:{role:m.role,permission:m.permission},
      transaction:publicWorkspace(wr.data),
      items:sharedItems,documents:dr.data||[]
    });
  }

  if(action==="create_upload"){
    const txId=clean(body.transaction_id,80), mime=clean(body.mime_type,80), size=Number(body.file_size||0), name=safeFileName(body.file_name);
    const access=await requireShared(admin,txId,user.id);if((access as any).error)return respond(req,(access as any).status,{error:(access as any).error});
    const m=(access as any).membership;if(m.permission!=="view_upload")return respond(req,403,{error:"This invitation is view-only"});
    if(!MIME.has(mime)||!Number.isFinite(size)||size<=0||size>MAX_BYTES)return respond(req,400,{error:"Use a PDF, JPG or PNG up to 25 MB"});
    const documentId=crypto.randomUUID();
    const path="shared/"+m.owner_user_id+"/"+txId+"/"+user.id+"/"+documentId+"/"+name;
    const {data,error}=await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if(error||!data)return respond(req,500,{error:"Could not prepare document upload"});
    return respond(req,200,{document_id:documentId,path,token:data.token});
  }

  if(action==="register_upload"){
    const txId=clean(body.transaction_id,80), documentId=clean(body.document_id,80), path=clean(body.path,700),
      mime=clean(body.mime_type,80), type=clean(body.document_type,80)||"other", label=clean(body.document_label,160)||null;
    const access=await requireShared(admin,txId,user.id);if((access as any).error)return respond(req,(access as any).status,{error:(access as any).error});
    const m=(access as any).membership;if(m.permission!=="view_upload")return respond(req,403,{error:"This invitation is view-only"});
    const prefix="shared/"+m.owner_user_id+"/"+txId+"/"+user.id+"/"+documentId+"/";
    if(!path.startsWith(prefix)||!MIME.has(mime))return respond(req,400,{error:"Upload path is invalid"});
    const parts=path.split("/"), fileName=parts[parts.length-1]||"document";
    const folder=parts.slice(0,-1).join("/");
    const {data:list,error:listError}=await admin.storage.from(BUCKET).list(folder,{limit:20,search:fileName});
    const obj=(list||[]).find((x:any)=>x.name===fileName);
    if(listError||!obj)return respond(req,409,{error:"Uploaded file could not be verified"});
    const fileSize=Number(obj.metadata?.size||body.file_size||0);
    if(!fileSize||fileSize>MAX_BYTES)return respond(req,400,{error:"Uploaded file size is invalid"});
    const allowedTypes=new Set(["title_commitment","mortgage_payoff","lender_commitment","appraisal","inspection_report","attorney_review","hoa_condo","solar_agreement","tenancy","estate_probate","divorce","bankruptcy","final_walkthrough","closing_package","other"]);
    const docType=allowedTypes.has(type)?type:"other";
    const {error}=await admin.from("transaction_documents").insert({
      id:documentId,transaction_id:txId,user_id:m.owner_user_id,document_type:docType,document_label:label,
      original_name:fileName,storage_bucket:BUCKET,storage_path:path,mime_type:mime,file_size:fileSize,
      status:"uploaded",extraction_status:"not_requested",uploaded_by_user_id:user.id,uploaded_by_role:m.role,
      metadata:{supplied_by:"shared_professional_upload",independent_public_evidence:false,shared_role:m.role}
    });
    if(error)return respond(req,500,{error:"Could not register uploaded document"});
    await admin.from("transaction_activity").insert({
      transaction_id:txId,user_id:m.owner_user_id,actor_user_id:user.id,action:"professional_document_upload",
      message:"A "+m.role+" professional uploaded "+fileName,detail:{document_id:documentId,role:m.role,private_document:true}
    });
    return respond(req,200,{ok:true,document_id:documentId});
  }

  if(action==="document_url"){
    const txId=clean(body.transaction_id,80), documentId=clean(body.document_id,80);
    const access=await requireShared(admin,txId,user.id);if((access as any).error)return respond(req,(access as any).status,{error:(access as any).error});
    const m=(access as any).membership;
    const {data:doc}=await admin.from("transaction_documents").select("storage_path").eq("id",documentId).eq("transaction_id",txId).eq("user_id",m.owner_user_id).maybeSingle();
    if(!doc)return respond(req,404,{error:"Document not found"});
    const {data,error}=await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path,300);
    if(error||!data?.signedUrl)return respond(req,500,{error:"Could not create private document link"});
    return respond(req,200,{url:data.signedUrl,expires_in:300});
  }

  return respond(req,400,{error:"Unknown action"});
});
