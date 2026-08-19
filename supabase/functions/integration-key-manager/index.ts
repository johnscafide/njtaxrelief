import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Obj=Record<string,any>;
const ALLOWED_PLANS=new Set(["pro_plus","teams","developer"]);
const ORIGINS=new Set(["https://njpropertytaxrelief.com","https://www.njpropertytaxrelief.com","http://localhost:3000","http://127.0.0.1:3000"]);
const DEFAULT_SCOPES=["zapier.auth","triggers.manage","property.read","watchlist.write","crm.context.write"];
function namedEnv(jsonName:string,legacyName:string){const raw=Deno.env.get(jsonName)||"";if(raw){try{const x=JSON.parse(raw);if(x?.default)return String(x.default)}catch{}}return Deno.env.get(legacyName)||"";}
function cors(req:Request){const o=req.headers.get("origin")||"";const allow=ORIGINS.has(o)||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o)?o:"https://njpropertytaxrelief.com";return{"Access-Control-Allow-Origin":allow,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function reply(req:Request,status:number,payload:unknown){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"private, no-store"}});}
function clean(v:unknown,max=160){return String(v??"").replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,max);}
function randomToken(bytes=32){const b=new Uint8Array(bytes);crypto.getRandomValues(b);let s="";for(const n of b)s+=String.fromCharCode(n);return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function planName(v:unknown){return clean(v,30).toLowerCase().replace("pro+","pro_plus")||"standard";}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return reply(req,405,{error:"Method not allowed"});
  const origin=req.headers.get("origin")||"";if(origin&&!ORIGINS.has(origin)&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin))return reply(req,403,{error:"Origin not allowed"});
  const auth=req.headers.get("authorization")||"";if(!auth.startsWith("Bearer "))return reply(req,401,{error:"Sign in required"});
  const url=Deno.env.get("SUPABASE_URL")||"",pub=namedEnv("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY"),secret=namedEnv("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pub||!secret)return reply(req,503,{error:"Integration credentials service unavailable"});
  const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false}}),admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userDb.auth.getUser();if(authError||!authData.user)return reply(req,401,{error:"Session could not be verified"});
  const user=authData.user;
  const {data:ent,error:entError}=await userDb.rpc("get_my_entitlement");if(entError)return reply(req,403,{error:"Plan could not be verified"});
  const row=Array.isArray(ent)?ent[0]:ent,plan=planName(row?.plan_tier);if(!ALLOWED_PLANS.has(plan))return reply(req,403,{error:"Zapier integration keys require Pro+ or Teams",required_plan:"pro_plus",plan});
  let body:Obj={};try{body=await req.json()}catch{return reply(req,400,{error:"Invalid JSON"})};const action=clean(body.action,60);
  const audit=async(kind:string,details:Obj={})=>{await admin.from("integration_audit_log").insert({user_id:user.id,action:kind,actor:"user",details});};
  if(action==="keys.list"){
    const {data,error}=await admin.from("integration_api_keys").select("id,provider,label,key_prefix,scopes,status,last_used_at,created_at,revoked_at").eq("user_id",user.id).eq("provider","zapier").order("created_at",{ascending:false});
    if(error)return reply(req,503,{error:"Integration keys could not be loaded"});return reply(req,200,{keys:data||[],plan});
  }
  if(action==="key.create"){
    const {count}=await admin.from("integration_api_keys").select("*",{count:"exact",head:true}).eq("user_id",user.id).eq("provider","zapier").eq("status","active");
    if(Number(count||0)>=3)return reply(req,409,{error:"You already have the maximum of 3 active Zapier keys. Revoke one before creating another."});
    const label=clean(body.label||"Zapier",80)||"Zapier",token=`wdg_zap_${randomToken(32)}`,prefix=token.slice(0,16),hash=await sha256(token);
    const saved=await admin.from("integration_api_keys").insert({user_id:user.id,provider:"zapier",label,key_prefix:prefix,key_hash:hash,scopes:DEFAULT_SCOPES,status:"active"}).select("id,provider,label,key_prefix,scopes,status,created_at").single();
    if(saved.error)return reply(req,503,{error:"Zapier key could not be created"});await audit("zapier.key.created",{key_id:saved.data.id,label});
    return reply(req,201,{key:saved.data,credential:{api_key:token,shown_once:true}});
  }
  if(action==="key.revoke"){
    const id=clean(body.key_id,80);if(!/^[0-9a-f-]{36}$/i.test(id))return reply(req,400,{error:"Valid key_id required"});
    const {data:key}=await admin.from("integration_api_keys").select("id,status").eq("id",id).eq("user_id",user.id).eq("provider","zapier").maybeSingle();if(!key)return reply(req,404,{error:"Zapier key not found"});
    if(key.status!=="revoked")await admin.from("integration_api_keys").update({status:"revoked",revoked_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);
    const {data:connections}=await admin.from("integration_connections").select("id,outbound_secret_id").eq("user_id",user.id).eq("provider","zapier").contains("metadata",{api_key_id:id}).neq("status","revoked");
    for(const c of connections||[]){await admin.from("integration_connections").update({status:"revoked",outbound_secret_id:null,updated_at:new Date().toISOString()}).eq("id",c.id).eq("user_id",user.id);await admin.from("integration_deliveries").update({status:"canceled",updated_at:new Date().toISOString()}).eq("connection_id",c.id).in("status",["pending","processing"]);if(c.outbound_secret_id)await admin.rpc("integration_delete_secret",{p_secret_id:c.outbound_secret_id});}
    await audit("zapier.key.revoked",{key_id:id,connections_revoked:(connections||[]).length});return reply(req,200,{ok:true});
  }
  return reply(req,400,{error:"Unknown action"});
});