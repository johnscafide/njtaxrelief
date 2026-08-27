import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const URL=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const SCENARIO='development_trends_v038',PIN='0101_canary_1';
const VERSION='nj-dca-development-trends-v038',RELEASE='nj-dca-development-trends-2025-08-21-v1';
const SOURCE=`NJ DCA Development Trends Viewer · as of 2025-08-21 · latest published annual data 2024 · ${RELEASE}`;
const CALC='watchdog-dca-development-trends-window-v1';
const EXPECTED:Record<string,{value:any,kind:'derived_governed'|'authoritative_reference',calculation?:string}>={
 'njplus.nj-dca-development-trends.latest_data_year':{value:2024,kind:'authoritative_reference'},
 'njplus.nj-dca-development-trends.latest_annual_housing_units_authorized':{value:2,kind:'authoritative_reference'},
 'njplus.nj-dca-development-trends.latest_annual_construction_cost_authorized':{value:7276215,kind:'authoritative_reference'},
 'njplus.nj-dca-development-trends.latest_annual_total_nonresidential_square_feet':{value:3392,kind:'authoritative_reference'},
 'njplus.nj-dca-development-trends.latest_annual_demolitions':{value:0,kind:'authoritative_reference'},
 'njplus.nj-dca-development-trends.latest_annual_net_housing_unit_change':{value:2,kind:'authoritative_reference'},
 'njplus.nj-dca-development-trends.housing_units_authorized_history_2020_2024':{value:[{year:2020,value:0},{year:2021,value:7},{year:2022,value:4},{year:2023,value:3},{year:2024,value:2}],kind:'authoritative_reference'},
 'watchdog.njplus.rolling_5yr_housing_units_authorized':{value:16,kind:'derived_governed',calculation:CALC},
 'watchdog.njplus.latest_yoy_construction_cost_authorized_delta':{value:-1396162,kind:'derived_governed',calculation:CALC},
 'watchdog.njplus.rolling_5yr_total_nonresidential_square_feet':{value:88819,kind:'derived_governed',calculation:CALC},
};
function json(status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function hash(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(id:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',id);await admin.from('account_entitlements').delete().eq('user_id',id);await admin.from('profiles').delete().eq('id',id);await admin.auth.admin.deleteUser(id)}
function same(a:any,b:any){return typeof b==='object'?JSON.stringify(a)===JSON.stringify(b):typeof b==='number'?Number(a)===b:a===b}
export async function handleDevelopmentTrendsV038Canary(req:Request){
 let body:any={};try{body=await req.json()}catch{return json(400,{error:'Invalid JSON'})}
 const token=String(body?.token||'').trim();if(String(body?.scenario||'')!==SCENARIO||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(401,{error:'Invalid release canary request'});
 const now=new Date().toISOString();
 const {data:gate}=await admin.from('watchdog_test_bootstrap_tokens').update({used_at:now}).eq('token_hash',await hash(token)).is('used_at',null).gt('expires_at',now).contains('metadata',{purpose:'provider_release_canary',scenario:SCENARIO}).select('id,desired_email').maybeSingle();
 if(!gate)return json(401,{error:'Invalid or expired release canary token'});
 let userId='';
 try{
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:String(gate.desired_email||'')});userId=String(link?.user?.id||'');const hashed=String(link?.properties?.hashed_token||'');if(linkError||!userId||!hashed)throw new Error('sandbox_link_generation_failed');
  const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {data:v,error:ve}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});const access=v?.session?.access_token||'';if(ve||!access)throw new Error('sandbox_session_verification_failed');
  const pr=await admin.from('profiles').upsert({id:userId,email:String(gate.desired_email||''),full_name:'Watchdog Development Trends v0.38 Canary',display_name:'Watchdog Development Trends v0.38 Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true,scenario:SCENARIO}},{onConflict:'id'});if(pr.error)throw new Error('sandbox_profile_failed');
  const ta=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'Development Trends v0.38 Canary',last_bootstrap_at:now,metadata:{no_real_spend:true,scenario:SCENARIO}},{onConflict:'user_id'});if(ta.error)throw new Error('sandbox_account_failed');
  const ids=Object.keys(EXPECTED),started=Date.now();const response=await fetch(`${URL}/functions/v1/workbench-hydrate`,{method:'POST',headers:{Authorization:`Bearer ${access}`,apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:[PIN],marker_ids:ids})});
  const payload=await response.json();const mismatches:string[]=[];const observed:Record<string,any>={};
  for(const id of ids){const exp=EXPECTED[id],value=payload?.markers?.[PIN]?.[id],meta=payload?.meta?.[PIN]?.[id]||{};observed[id]={value,meta};if(!same(value,exp.value))mismatches.push(`${id}:value`);if(String(meta.status||'')!=='available')mismatches.push(`${id}:status`);if(String(meta.provider_kind||'')!==exp.kind)mismatches.push(`${id}:kind`);if(String(meta.source||'')!==SOURCE)mismatches.push(`${id}:source`);if(String(meta.provider_version||'')!==VERSION)mismatches.push(`${id}:version`);if(String(meta.source_release||'')!==RELEASE)mismatches.push(`${id}:release`);if(String(meta.scope||'')!=='municipality')mismatches.push(`${id}:scope`);if(exp.calculation&&String(meta.calculation_key||'')!==exp.calculation)mismatches.push(`${id}:calculation`)}
  if(payload?.provider_versions?.development_trends_v038!==VERSION)mismatches.push('provider_versions');
  const ok=response.ok&&mismatches.length===0;await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches}});
  return json(ok?200:502,{ok,scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches,observed,provider_versions:payload?.provider_versions||{}});
 }catch(e){return json(500,{ok:false,scenario:SCENARIO,error:String((e as Error)?.message||e)})}finally{if(userId)await cleanup(userId)}
}
