import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PROD_PROJECT_REF='uvkvaxljhhngydvlrzom';
const DEFAULT_PUBLIC_URL=URL.includes(PROD_PROJECT_REF)?'https://login.watchdogindex.com':URL;
const PUBLIC_URL=(Deno.env.get('WATCHDOG_SUPABASE_PUBLIC_URL')||DEFAULT_PUBLIC_URL).replace(/\/+$/,'');
const CALLBACK=`${PUBLIC_URL}/functions/v1/google-ads-oauth-callback`;
const GOOGLE_ADS='google_ads',SEARCH_CONSOLE='google_search_console';
const hex=(b:Uint8Array)=>Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha(v:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))))}
function siteFor(path:string){return path.startsWith('/property/analytics')?'https://www.watchdogindex.com':'https://njpropertytaxrelief.com'}
function go(path:string,params:Record<string,string>){const u=new URL(siteFor(path)+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));return new Response(null,{status:302,headers:{Location:u.toString(),'Cache-Control':'no-store'}})}
function chooseWatchdogSite(entries:any[]){const urls=entries.map(x=>String(x?.siteUrl||'')).filter(Boolean);const preferred=['sc-domain:watchdogindex.com','https://www.watchdogindex.com/','https://watchdogindex.com/','sc-domain:njpropertytaxrelief.com','https://www.njpropertytaxrelief.com/','https://njpropertytaxrelief.com/'];for(const p of preferred)if(urls.includes(p))return p;return urls[0]||null}

async function storeRefreshToken(service:any,connectionId:string,token:any){
  if(token.refresh_token){const stored=await service.rpc('marketing_store_provider_secret',{p_connection_id:connectionId,p_secret_type:'refresh_token',p_secret:String(token.refresh_token)});return stored.error?false:true}
  const existing=await service.rpc('marketing_get_provider_secret',{p_connection_id:connectionId,p_secret_type:'refresh_token'});return !existing.error&&!!existing.data;
}

Deno.serve(async(req)=>{
  if(req.method!=='GET')return new Response('Method not allowed',{status:405});
  const u=new URL(req.url),state=u.searchParams.get('state')||'',code=u.searchParams.get('code')||'',providerError=u.searchParams.get('error')||'';
  if(!/^[a-f0-9]{64}$/i.test(state))return go('/property/marketing-studio',{provider:GOOGLE_ADS,oauth:'invalid_state'});
  const service=createClient(URL,SERVICE,{auth:{persistSession:false}}),stateHash=await sha(state),now=new Date().toISOString();
  const{data:oauth,error:stateError}=await service.from('marketing_provider_oauth_states').update({consumed_at:now}).eq('state_hash',stateHash).in('provider_key',[GOOGLE_ADS,SEARCH_CONSOLE]).is('consumed_at',null).gt('expires_at',now).select('user_id,redirect_path,provider_key').maybeSingle();
  if(stateError||!oauth)return go('/property/marketing-studio',{provider:GOOGLE_ADS,oauth:'expired'});
  const provider=String(oauth.provider_key||GOOGLE_ADS),redirect=String(oauth.redirect_path||(provider===SEARCH_CONSOLE?'/property/analytics/web-signals/':'/property/marketing-studio'));
  if(providerError||!code)return go(redirect,{provider,oauth:'denied'});

  const clientId=Deno.env.get('GOOGLE_ADS_CLIENT_ID'),clientSecret=Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'),developerToken=Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  if(!clientId||!clientSecret||(provider===GOOGLE_ADS&&!developerToken))return go(redirect,{provider,oauth:'not_configured'});
  const body=new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:CALLBACK,grant_type:'authorization_code'});
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const token=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||!token.access_token)return go(redirect,{provider,oauth:'token_failed'});

  if(provider===SEARCH_CONSOLE){
    let entries:any[]=[],listError:string|null=null;
    try{
      const r=await fetch('https://www.googleapis.com/webmasters/v3/sites',{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/json'}}),j=await r.json().catch(()=>({}));
      if(r.ok&&Array.isArray(j.siteEntry))entries=j.siteEntry.map((x:any)=>({siteUrl:String(x?.siteUrl||''),permissionLevel:String(x?.permissionLevel||'')})).filter((x:any)=>x.siteUrl);else listError='search_console_sites_unavailable';
    }catch{listError='search_console_sites_unavailable'}
    const selectedSite=chooseWatchdogSite(entries),status=listError?'degraded':'connected';
    let{data:connection}=await service.from('marketing_provider_connections').select('id').eq('user_id',oauth.user_id).eq('provider_key',SEARCH_CONSOLE).eq('connection_scope','user').maybeSingle();
    const record={user_id:oauth.user_id,provider_key:SEARCH_CONSOLE,connection_scope:'user',mode:'live',status,public_config:{oauth_connected:true,accessible_sites:entries,selected_site:selectedSite},health_summary:{accessible_sites:entries.length,list_error:listError,selected_site:selectedSite},last_health_at:now,last_error:listError};
    if(!connection){const inserted=await service.from('marketing_provider_connections').insert(record).select('id').single();if(inserted.error||!inserted.data)return go(redirect,{provider,oauth:'connection_failed'});connection=inserted.data}
    else{const updated=await service.from('marketing_provider_connections').update({mode:record.mode,status:record.status,public_config:record.public_config,health_summary:record.health_summary,last_health_at:now,last_error:listError}).eq('id',connection.id);if(updated.error)return go(redirect,{provider,oauth:'connection_failed'})}
    if(!await storeRefreshToken(service,connection.id,token))return go(redirect,{provider,oauth:'credential_store_failed'});
    return go(redirect,{provider,oauth:listError?'connected_degraded':'connected',sites:String(entries.length)});
  }

  let accounts:string[]=[],listError:string|null=null;
  try{
    const version=Deno.env.get('GOOGLE_ADS_API_VERSION')||'v25',r=await fetch(`https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`,{headers:{Authorization:`Bearer ${token.access_token}`,'developer-token':String(developerToken),'Content-Type':'application/json'}}),j=await r.json().catch(()=>({}));
    if(r.ok&&Array.isArray(j.resourceNames))accounts=j.resourceNames.map((x:unknown)=>String(x));else listError='accessible_accounts_unavailable';
  }catch{listError='accessible_accounts_unavailable'}
  let{data:connection}=await service.from('marketing_provider_connections').select('id').eq('user_id',oauth.user_id).eq('provider_key',GOOGLE_ADS).eq('connection_scope','user').maybeSingle();
  if(!connection){const inserted=await service.from('marketing_provider_connections').insert({user_id:oauth.user_id,provider_key:GOOGLE_ADS,connection_scope:'user',mode:'sandbox',status:'connected',public_config:{oauth_connected:true,accessible_accounts:accounts,selected_account:null},health_summary:{accessible_accounts:accounts.length,list_error:listError},last_health_at:now}).select('id').single();if(inserted.error||!inserted.data)return go(redirect,{provider,oauth:'connection_failed'});connection=inserted.data}
  else{const updated=await service.from('marketing_provider_connections').update({mode:'sandbox',status:'connected',public_config:{oauth_connected:true,accessible_accounts:accounts,selected_account:null},health_summary:{accessible_accounts:accounts.length,list_error:listError},last_health_at:now,last_error:listError}).eq('id',connection.id);if(updated.error)return go(redirect,{provider,oauth:'connection_failed'})}
  if(!await storeRefreshToken(service,connection.id,token))return go(redirect,{provider,oauth:'credential_store_failed'});
  return go(redirect,{provider,oauth:'connected',accounts:String(accounts.length)});
});
