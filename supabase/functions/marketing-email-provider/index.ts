import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Obj = Record<string, any>;
const KIT_BASE = "https://api.kit.com/v4";
const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function namedEnv(jsonName:string, legacyName:string){
  const raw=Deno.env.get(jsonName)||"";
  if(raw){try{const parsed=JSON.parse(raw);if(parsed?.default)return String(parsed.default);}catch{}}
  return Deno.env.get(legacyName)||"";
}
function clean(v:unknown,max=240){return String(v??"").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);}
function validEmail(v:unknown){const x=String(v??"").trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)?x:null;}
function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const allow=ORIGINS.has(origin)||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)?origin:"https://njpropertytaxrelief.com";
  return {"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"private, no-store","Vary":"Origin"};
}
function reply(req:Request,status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8"}});}
function htmlSafe(raw:unknown){
  let html=String(raw??"");
  if(html.length>250000)throw new Error("Email content exceeds 250 KB");
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,"")
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi,"")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,"")
    .replace(/javascript\s*:/gi,"");
  if(!html.trim())throw new Error("Email content is required");
  return html;
}
async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function kitRequest(apiKey:string,path:string,init:RequestInit={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const headers=new Headers(init.headers||{});
    headers.set("X-Kit-Api-Key",apiKey);
    headers.set("Accept","application/json");
    if(init.body)headers.set("Content-Type","application/json");
    const res=await fetch(KIT_BASE+path,{...init,headers,signal:ctrl.signal});
    const text=await res.text();let data:any=null;
    if(text){try{data=JSON.parse(text);}catch{data={};}}
    if(!res.ok){
      const msg=Array.isArray(data?.errors)?data.errors.join("; "):clean(data?.error||data?.message||`Kit HTTP ${res.status}`,500);
      const err:any=new Error(msg||`Kit HTTP ${res.status}`);err.httpStatus=res.status;throw err;
    }
    return data||{};
  }finally{clearTimeout(timer);}
}
function connectionPublic(c:Obj|null){
  if(!c)return null;
  const cfg=c.public_config&&typeof c.public_config==="object"?c.public_config:{};
  return {
    id:c.id,provider_key:c.provider_key,status:c.status,mode:c.mode,
    external_account_ref:c.external_account_ref||null,
    account_name:cfg.account_name||null,plan_type:cfg.plan_type||null,
    primary_email_address:cfg.primary_email_address||null,timezone:cfg.timezone||null,
    auth_mode:cfg.auth_mode||null,last_health_at:c.last_health_at||null,
    last_error:c.last_error||null,updated_at:c.updated_at,
  };
}
function eligibilityFromKit(state:unknown){
  const s=clean(state,30).toLowerCase();
  if(s==="active")return["eligible","kit_active_subscriber"];
  if(s==="bounced")return["bounced","kit_bounced"];
  if(s==="complained")return["complained","kit_complained"];
  if(s==="cancelled"||s==="inactive")return["unsubscribed","kit_inactive_or_cancelled"];
  return["unknown","kit_state_unknown"];
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return reply(req,405,{error:"Method not allowed"});
  const origin=req.headers.get("origin")||"";
  if(origin&&!ORIGINS.has(origin)&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))return reply(req,403,{error:"Origin not allowed"});
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return reply(req,401,{error:"Sign in required"});

  const url=Deno.env.get("SUPABASE_URL")||"",pub=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pub||!secret)return reply(req,503,{error:"Newsletter provider service unavailable"});
  const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userDb.auth.getUser();
  if(authError||!authData.user)return reply(req,401,{error:"Session could not be verified"});
  const user=authData.user;
  const {data:beta}=await admin.from("marketing_email_beta_access").select("access_level,expires_at").eq("user_id",user.id).maybeSingle();
  const betaAllowed=!!beta&&(!beta.expires_at||new Date(beta.expires_at).getTime()>Date.now());
  if(!betaAllowed)return reply(req,403,{error:"Newsletter Studio is currently a private beta",private_beta:true});

  let body:Obj={};try{body=await req.json();}catch{return reply(req,400,{error:"Invalid JSON"});}
  const action=clean(body.action,80);
  const getConnection=async()=>{const {data}=await admin.from("marketing_provider_connections").select("*").eq("user_id",user.id).eq("provider_key","kit").eq("connection_scope","user").maybeSingle();return data||null;};
  const getApiKey=async(connectionId:string)=>{const {data,error}=await admin.rpc("marketing_get_provider_secret",{p_connection_id:connectionId,p_secret_type:"api_key"});if(error||!data)throw new Error("Kit credential is unavailable; reconnect Kit");return String(data);};
  const audit=async(eventType:string,payload:Obj={})=>{await admin.from("marketing_events").insert({user_id:user.id,event_type:eventType,source:"kit",payload});};
  const senderRows=async(connectionId?:string)=>{let q=admin.from("marketing_email_sender_identities").select("id,email_address,display_name,domain,verification_status,is_default,updated_at").eq("user_id",user.id).eq("provider_key","kit").order("is_default",{ascending:false}).order("updated_at",{ascending:false});if(connectionId)q=q.eq("provider_connection_id",connectionId);const {data}=await q;return data||[];};
  const crmState=async()=>{
    const {data:providers}=await admin.from("integration_provider_connections").select("connection_id,provider,sync_status,last_success_at,records_synced_total,last_records_upserted").eq("user_id",user.id).neq("sync_status","revoked").order("updated_at",{ascending:false});
    const active=(providers||[])[0]||null;
    let emailCount=0,total=0;
    if(active?.connection_id){
      const c1=await admin.from("integration_crm_context").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("connection_id",active.connection_id);total=Number(c1.count||0);
      const c2=await admin.from("integration_crm_context").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("connection_id",active.connection_id).not("contact_email","is",null);emailCount=Number(c2.count||0);
    }
    return {connection:active?{connection_id:active.connection_id,provider:active.provider,sync_status:active.sync_status,last_success_at:active.last_success_at,records_synced_total:Number(active.records_synced_total||0),last_records_upserted:Number(active.last_records_upserted||0)}:null,total_contacts:total,contacts_with_email:emailCount};
  };

  try{
    if(action==="status"){
      const conn=await getConnection();
      const links=await admin.from("marketing_email_contact_links").select("eligibility_status",{count:"exact"}).eq("user_id",user.id).eq("provider_key","kit");
      const statuses:Record<string,number>={};for(const r of links.data||[])statuses[r.eligibility_status]=(statuses[r.eligibility_status]||0)+1;
      const {data:bcasts}=await admin.from("marketing_email_broadcasts").select("id,external_broadcast_id,status,subject,from_email,target_definition,send_at,created_at,updated_at").eq("user_id",user.id).eq("provider_key","kit").order("updated_at",{ascending:false}).limit(12);
      return reply(req,200,{private_beta:true,provider:connectionPublic(conn),senders:conn?await senderRows(conn.id):[],crm:await crmState(),linked_contacts:Number(links.count||0),eligibility:statuses,recent_broadcasts:bcasts||[]});
    }

    if(action==="kit.connect"){
      const apiKey=String(body.api_key||"").trim();if(apiKey.length<16||apiKey.length>5000)return reply(req,400,{error:"A valid Kit V4 API key is required"});
      const accountData=await kitRequest(apiKey,"/account");const account=accountData?.account||{},primary=validEmail(account.primary_email_address);
      if(!account.id)return reply(req,400,{error:"Kit account validation did not return an account"});
      let conn=await getConnection(),connectionId=conn?.id||crypto.randomUUID(),created=false;
      const publicConfig={account_name:clean(account.name,160)||"Kit",plan_type:clean(account.plan_type,80)||null,primary_email_address:primary,timezone:clean(account?.timezone?.name,80)||null,auth_mode:"private_api_key",api_version:"v4",private_beta:true};
      if(!conn){
        const ins=await admin.from("marketing_provider_connections").insert({id:connectionId,user_id:user.id,provider_key:"kit",connection_scope:"user",mode:"not_connected",status:"pending",external_account_ref:String(account.id),public_config:publicConfig,health_summary:{validated:true},last_health_at:new Date().toISOString()}).select("*").single();
        if(ins.error)return reply(req,503,{error:"Kit connection could not be created"});conn=ins.data;created=true;
      }else{
        const up=await admin.from("marketing_provider_connections").update({mode:"not_connected",status:"pending",external_account_ref:String(account.id),public_config:publicConfig,last_error:null,updated_at:new Date().toISOString()}).eq("id",connectionId).eq("user_id",user.id);if(up.error)return reply(req,503,{error:"Kit connection could not be prepared"});
      }
      const stored=await admin.rpc("marketing_store_provider_secret",{p_connection_id:connectionId,p_secret_type:"api_key",p_secret:apiKey});
      if(stored.error){if(created)await admin.from("marketing_provider_connections").delete().eq("id",connectionId);return reply(req,503,{error:"Kit credential could not be secured"});}
      const now=new Date().toISOString();
      const up=await admin.from("marketing_provider_connections").update({mode:"live",status:"connected",health_summary:{validated:true,http_status:200,checked_at:now},last_health_at:now,last_error:null,updated_at:now}).eq("id",connectionId).eq("user_id",user.id).select("*").single();
      if(up.error)return reply(req,503,{error:"Kit connection could not be finalized"});conn=up.data;
      const sender=validEmail(body.sender_email)||primary;
      if(sender){
        const display=clean(body.sender_name,120)||null,domain=sender.split("@")[1],isPrimary=sender===primary;
        await admin.from("marketing_email_sender_identities").update({is_default:false,updated_at:now}).eq("user_id",user.id).eq("provider_connection_id",connectionId);
        await admin.from("marketing_email_sender_identities").upsert({user_id:user.id,provider_connection_id:connectionId,provider_key:"kit",email_address:sender,display_name:display,domain,verification_status:isPrimary?"provider_primary":"declared",is_default:true,provider_metadata:{account_primary:isPrimary},updated_at:now},{onConflict:"user_id,provider_connection_id,email_address"});
      }
      await audit(created?"email.provider.connected":"email.provider.reconnected",{provider:"kit",account_ref:String(account.id),auth_mode:"private_api_key"});
      return reply(req,created?201:200,{provider:connectionPublic(conn),senders:await senderRows(connectionId),account:{name:publicConfig.account_name,plan_type:publicConfig.plan_type,primary_email_address:primary,timezone:publicConfig.timezone}});
    }

    if(action==="kit.health"){
      const conn=await getConnection();if(!conn||conn.status==="revoked")return reply(req,404,{error:"Kit is not connected"});const key=await getApiKey(conn.id);
      try{const d=await kitRequest(key,"/account"),now=new Date().toISOString();await admin.from("marketing_provider_connections").update({mode:"live",status:"connected",last_health_at:now,last_error:null,health_summary:{validated:true,http_status:200,checked_at:now},updated_at:now}).eq("id",conn.id);return reply(req,200,{ok:true,checked_at:now,account:{name:clean(d?.account?.name,160)||null,plan_type:clean(d?.account?.plan_type,80)||null,primary_email_address:validEmail(d?.account?.primary_email_address),timezone:clean(d?.account?.timezone?.name,80)||null}});}catch(err){const now=new Date().toISOString();await admin.from("marketing_provider_connections").update({mode:"degraded",status:"degraded",last_health_at:now,last_error:clean(err instanceof Error?err.message:err,500),health_summary:{validated:false,checked_at:now},updated_at:now}).eq("id",conn.id);throw err;}
    }

    if(action==="kit.catalog"){
      const conn=await getConnection();if(!conn||conn.status!=="connected")return reply(req,404,{error:"Kit is not connected"});const key=await getApiKey(conn.id);
      const [tags,segments]=await Promise.all([kitRequest(key,"/tags?per_page=1000"),kitRequest(key,"/segments?per_page=1000")]);
      return reply(req,200,{tags:(tags.tags||[]).map((x:Obj)=>({id:x.id,name:x.name})),segments:(segments.segments||[]).map((x:Obj)=>({id:x.id,name:x.name}))});
    }

    if(action==="sender.save"){
      const conn=await getConnection();if(!conn||conn.status!=="connected")return reply(req,404,{error:"Kit is not connected"});const email=validEmail(body.email_address);if(!email)return reply(req,400,{error:"Enter a valid sending email address"});
      const now=new Date().toISOString(),primary=validEmail(conn.public_config?.primary_email_address),isDefault=body.is_default!==false;
      if(isDefault)await admin.from("marketing_email_sender_identities").update({is_default:false,updated_at:now}).eq("user_id",user.id).eq("provider_connection_id",conn.id);
      const up=await admin.from("marketing_email_sender_identities").upsert({user_id:user.id,provider_connection_id:conn.id,provider_key:"kit",email_address:email,display_name:clean(body.display_name,120)||null,domain:email.split("@")[1],verification_status:email===primary?"provider_primary":"declared",is_default:isDefault,provider_metadata:{account_primary:email===primary},updated_at:now},{onConflict:"user_id,provider_connection_id,email_address"}).select("id,email_address,display_name,domain,verification_status,is_default,updated_at").single();
      if(up.error)return reply(req,503,{error:"Sender identity could not be saved"});await audit("email.sender.saved",{provider:"kit",domain:email.split("@")[1],verification_status:up.data.verification_status});return reply(req,200,{sender:up.data});
    }

    if(action==="kit.reconcile_existing"){
      const conn=await getConnection();if(!conn||conn.status!=="connected")return reply(req,404,{error:"Kit is not connected"});const key=await getApiKey(conn.id);
      const crm=await crmState();if(!crm.connection?.connection_id)return reply(req,409,{error:"Connect and sync a CRM before reconciling newsletter subscribers"});
      const crmRows:Obj[]=[];for(let start=0;start<10000;start+=1000){const {data,error}=await admin.from("integration_crm_context").select("connection_id,external_contact_id,contact_email,contact_name").eq("user_id",user.id).eq("connection_id",crm.connection.connection_id).not("contact_email","is",null).range(start,start+999);if(error)throw new Error("CRM audience could not be loaded");const rows=data||[];crmRows.push(...rows);if(rows.length<1000)break;}
      const byEmail=new Map<string,Obj>();let duplicateCrmEmails=0;
      for(const row of crmRows){const email=validEmail(row.contact_email);if(!email)continue;if(byEmail.has(email)){duplicateCrmEmails++;continue;}byEmail.set(email,row);}
      let after:string|null=null,pages=0,kitSeen=0,matched=0;const now=new Date().toISOString(),upserts:Obj[]=[];
      while(pages<15){const qs=new URLSearchParams({status:"all",per_page:"1000"});if(after)qs.set("after",after);const d=await kitRequest(key,"/subscribers?"+qs.toString());const subs=d.subscribers||[];kitSeen+=subs.length;
        for(const s of subs){const email=validEmail(s.email_address);if(!email)continue;const crmRow=byEmail.get(email);if(!crmRow)continue;matched++;const [eligibility,reason]=eligibilityFromKit(s.state);upserts.push({user_id:user.id,crm_connection_id:crmRow.connection_id,crm_external_contact_id:crmRow.external_contact_id,provider_connection_id:conn.id,provider_key:"kit",provider_subscriber_id:String(s.id),contact_email_hash:await sha256(email),provider_state:clean(s.state,30)||null,provider_tags:[],eligibility_status:eligibility,eligibility_reason:reason,last_synced_at:now,last_error:null,updated_at:now});}
        pages++;if(!d.pagination?.has_next_page||!d.pagination?.end_cursor)break;after=String(d.pagination.end_cursor);
      }
      for(let i=0;i<upserts.length;i+=250){const batch=upserts.slice(i,i+250);const u=await admin.from("marketing_email_contact_links").upsert(batch,{onConflict:"user_id,crm_connection_id,crm_external_contact_id,provider_connection_id"});if(u.error)throw new Error("Newsletter contact reconciliation could not be saved");}
      await audit("email.audience.reconciled",{provider:"kit",crm_provider:crm.connection.provider,crm_contacts_with_email:crmRows.length,kit_subscribers_seen:kitSeen,matched,duplicate_crm_emails_ignored:duplicateCrmEmails,pages});
      return reply(req,200,{ok:true,crm_contacts_with_email:crmRows.length,unique_crm_emails:byEmail.size,kit_subscribers_seen:kitSeen,matched,duplicate_crm_emails_ignored:duplicateCrmEmails,pages,note:"Only subscribers already present in Kit were linked; CRM-only contacts were not uploaded."});
    }

    if(action==="broadcast.create"){
      const conn=await getConnection();if(!conn||conn.status!=="connected")return reply(req,404,{error:"Kit is not connected"});const key=await getApiKey(conn.id);
      const subject=clean(body.subject,180);if(!subject)return reply(req,400,{error:"Subject is required"});const content=htmlSafe(body.content),preview=clean(body.preview_text,240),description=clean(body.description,240)||`Watchdog Newsletter · ${subject}`;
      const sendAtRaw=body.send_at?String(body.send_at):null;let sendAt:string|null=null;
      if(sendAtRaw){const d=new Date(sendAtRaw);if(!Number.isFinite(d.getTime())||d.getTime()<Date.now()+60000)return reply(req,400,{error:"Schedule time must be at least one minute in the future"});if(body.confirm_send!==true)return reply(req,409,{error:"Explicit send approval is required before scheduling",approval_required:true});sendAt=d.toISOString();}
      const fromEmail=validEmail(body.email_address)||null;if(fromEmail){const {data:sender}=await admin.from("marketing_email_sender_identities").select("id,verification_status").eq("user_id",user.id).eq("provider_connection_id",conn.id).eq("email_address",fromEmail).maybeSingle();if(!sender)return reply(req,400,{error:"Save this sender identity before using it"});}
      const targetType=["tag","segment"].includes(clean(body.target_type,20))?clean(body.target_type,20):null,targetMode=["all","any","none"].includes(clean(body.target_mode,20))?clean(body.target_mode,20):"all",ids=Array.isArray(body.target_ids)?body.target_ids.map((x:any)=>Number(x)).filter((x:number)=>Number.isInteger(x)&&x>0).slice(0,100):[];
      if(sendAt&&!targetType&&!ids.length&&body.confirm_all_subscribers!==true)return reply(req,409,{error:"Scheduling to all subscribers requires explicit confirmation",all_subscribers_confirmation_required:true});
      const payload:Obj={content,description,public:false,published_at:new Date().toISOString(),preview_text:preview,subject,send_at:sendAt};if(fromEmail)payload.email_address=fromEmail;if(targetType&&ids.length)payload.subscriber_filter=[{[targetMode]:[{type:targetType,ids}]}];
      const d=await kitRequest(key,"/broadcasts",{method:"POST",body:JSON.stringify(payload)}),b=d.broadcast||{};if(!b.id)return reply(req,502,{error:"Kit did not return a broadcast identifier"});
      const localStatus=sendAt?"scheduled":"draft",contentHash=await sha256(content),target={type:targetType,mode:targetMode,ids,all_subscribers:!targetType||!ids.length};
      const ins=await admin.from("marketing_email_broadcasts").insert({user_id:user.id,provider_connection_id:conn.id,provider_key:"kit",external_broadcast_id:String(b.id),status:localStatus,subject,preview_text:preview||null,from_email:validEmail(b.email_address)||fromEmail,target_definition:target,content_sha256:contentHash,send_at:sendAt,provider_snapshot:{publication_id:b.publication_id||null,email_template:b.email_template||null,public_url:b.public_url||null,created_at:b.created_at||null}}).select("id,external_broadcast_id,status,subject,from_email,target_definition,send_at,provider_snapshot,created_at").single();
      if(ins.error)return reply(req,503,{error:"Kit created the broadcast but Watchdog could not save its local mirror",provider_broadcast_id:String(b.id)});
      await audit(sendAt?"email.broadcast.scheduled":"email.broadcast.draft_created",{provider:"kit",broadcast_id:String(b.id),target,scheduled:!!sendAt});return reply(req,201,{broadcast:ins.data,provider:{id:b.id,send_at:b.send_at||null,email_address:b.email_address||null}});
    }

    if(action==="kit.disconnect"){
      const conn=await getConnection();if(!conn)return reply(req,200,{ok:true,already_disconnected:true});const now=new Date().toISOString();await admin.rpc("marketing_delete_provider_secrets",{p_connection_id:conn.id});await admin.from("marketing_email_sender_identities").delete().eq("user_id",user.id).eq("provider_connection_id",conn.id);await admin.from("marketing_email_contact_links").delete().eq("user_id",user.id).eq("provider_connection_id",conn.id);await admin.from("marketing_provider_connections").update({mode:"not_connected",status:"revoked",last_error:null,health_summary:{revoked_at:now},last_health_at:now,updated_at:now}).eq("id",conn.id).eq("user_id",user.id);await audit("email.provider.disconnected",{provider:"kit"});return reply(req,200,{ok:true});
    }

    return reply(req,400,{error:"Unknown action"});
  }catch(err){
    const message=clean(err instanceof Error?err.message:err,600)||"Newsletter provider request failed";
    return reply(req,502,{error:message});
  }
});
