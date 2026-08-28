import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUBLIC_URL=(Deno.env.get('WATCHDOG_SUPABASE_PUBLIC_URL')||URL).replace(/\/+$/,'');
const CALLBACK=`${PUBLIC_URL}/functions/v1/google-ads-oauth-callback`;
const GOOGLE_ADS='google_ads',SEARCH_CONSOLE='google_search_console';

function allowedOrigin(req:Request){
  const origin=req.headers.get('origin')||'';
  try{
    const host=new URL(origin).hostname.toLowerCase();
    if(host==='njpropertytaxrelief.com'||host==='www.njpropertytaxrelief.com'||host==='watchdogindex.com'||host==='www.watchdogindex.com'||host==='watchdogre.com'||host==='www.watchdogre.com'||host==='localhost'||host==='127.0.0.1'||host.endsWith('.vercel.app'))return origin;
  }catch{}
  return 'https://www.watchdogindex.com';
}
function cors(req:Request){return{'Access-Control-Allow-Origin':allowedOrigin(req),'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store','Vary':'Origin'}}
function reply(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json'}})}
const hex=(b:Uint8Array)=>Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha(v:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))))}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return reply(req,405,{error:'Method not allowed'});
  const origin=req.headers.get('origin')||'',allowed=allowedOrigin(req);
  if(origin&&allowed!==origin)return reply(req,403,{error:'Origin not allowed'});

  let input:any={};try{input=await req.json()}catch{}
  const requested=String(input?.provider||'google_ads').toLowerCase();
  const provider=requested==='search_console'||requested===SEARCH_CONSOLE?SEARCH_CONSOLE:GOOGLE_ADS;
  const clientId=Deno.env.get('GOOGLE_ADS_CLIENT_ID'),clientSecret=Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'),developerToken=Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  if(!clientId||!clientSecret)return reply(req,provider===SEARCH_CONSOLE?200:409,{error:'Google OAuth is not configured yet',code:'provider_not_connected',provider});
  if(provider===GOOGLE_ADS&&!developerToken)return reply(req,409,{error:'Google Ads is not configured yet',code:'provider_not_connected',provider});

  const auth=req.headers.get('Authorization')||'';
  const client=createClient(URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const{data:{user},error}=await client.auth.getUser();
  if(error||!user)return reply(req,401,{error:'Sign in required'});

  if(provider===SEARCH_CONSOLE){
    const developer=await client.rpc('is_watchdog_developer');
    if(developer.error||developer.data!==true)return reply(req,403,{error:'Developer access required'});
  }else{
    const access=await client.rpc('marketing_studio_bootstrap');
    if(access.error)return reply(req,403,{error:'Marketing Studio access required'});
  }

  const state=hex(crypto.getRandomValues(new Uint8Array(32))),stateHash=await sha(state);
  const service=createClient(URL,SERVICE,{auth:{persistSession:false}});
  const redirectPath=provider===SEARCH_CONSOLE?'/property/analytics/web-signals/':'/property/marketing-studio';
  const{error:insertError}=await service.from('marketing_provider_oauth_states').insert({
    state_hash:stateHash,user_id:user.id,provider_key:provider,redirect_path:redirectPath,
    expires_at:new Date(Date.now()+10*60*1000).toISOString()
  });
  if(insertError)return reply(req,503,{error:'Could not start provider authorization'});

  const scope=provider===SEARCH_CONSOLE?'https://www.googleapis.com/auth/webmasters.readonly':'https://www.googleapis.com/auth/adwords';
  const q=new URLSearchParams({client_id:clientId,redirect_uri:CALLBACK,response_type:'code',scope,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state});
  return reply(req,200,{authorization_url:`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`,provider,scope});
});
