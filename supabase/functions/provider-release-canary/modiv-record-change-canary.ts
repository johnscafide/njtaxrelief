import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const URL=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const SCENARIO='modiv_record_change_v1',PIN='0101_25.01_10',MARKER='njplus.nj-dca-modiv-longitudinal.parcel_record_change_count';
const VERSION='watchdog-modiv-record-change-v1';
const SOURCE='Watchdog exact consecutive-year record transition count over NJ Division of Taxation annual MOD-IV assessment lists · treasury-modiv-2021-2026-v2';
function json(status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function hash(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(id:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',id);await admin.from('account_entitlements').delete().eq('user_id',id);await admin.from('profiles').delete().eq('id',id);await admin.auth.admin.deleteUser(id)}
export async function handleModivRecordChangeCanary(req:Request){
  let body:any={};try{body=await req.json()}catch{return json(400,{error:'Invalid JSON'})}
  const token=String(body?.token||'').trim();if(String(body?.scenario||'')!==SCENARIO||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(401,{error:'Invalid release canary request'});
  const now=new Date().toISOString();
  const {data:gate}=await admin.from('watchdog_test_bootstrap_tokens').update({used_at:now}).eq('token_hash',await hash(token)).is('used_at',null).gt('expires_at',now).contains('metadata',{purpose:'provider_release_canary',scenario:SCENARIO}).select('id,desired_email').maybeSingle();
  if(!gate)return json(401,{error:'Invalid or expired release canary token'});
  let userId='';
  try{
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:String(gate.desired_email||'')});userId=String(link?.user?.id||'');const hashed=String(link?.properties?.hashed_token||'');if(linkError||!userId||!hashed)throw new Error('sandbox_link_generation_failed');
    const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {data:v,error:ve}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});const access=v?.session?.access_token||'';if(ve||!access)throw new Error('sandbox_session_verification_failed');
    const pr=await admin.from('profiles').upsert({id:userId,email:String(gate.desired_email||''),full_name:'Watchdog MOD-IV Record Change Canary',display_name:'Watchdog MOD-IV Record Change Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true,scenario:SCENARIO}},{onConflict:'id'});if(pr.error)throw new Error('sandbox_profile_failed');
    const ta=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'MOD-IV Record Change Canary',last_bootstrap_at:now,metadata:{no_real_spend:true,scenario:SCENARIO}},{onConflict:'user_id'});if(ta.error)throw new Error('sandbox_account_failed');
    const started=Date.now();const response=await fetch(`${URL}/functions/v1/workbench-hydrate`,{method:'POST',headers:{Authorization:`Bearer ${access}`,apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:[PIN],marker_ids:[MARKER]})});
    const payload=await response.json();const value=payload?.markers?.[PIN]?.[MARKER],meta=payload?.meta?.[PIN]?.[MARKER]||{};
    const mismatches:string[]=[];if(value!==0)mismatches.push('value');if(String(meta.status||'')!=='available')mismatches.push('status');if(String(meta.provider_kind||'')!=='derived_governed')mismatches.push('kind');if(String(meta.source||'')!==SOURCE)mismatches.push('source');if(String(meta.provider_version||'')!==VERSION)mismatches.push('version');if(Number(meta.compared_consecutive_transitions)!==5)mismatches.push('compared_transitions');if(String(meta.scope||'')!=='property')mismatches.push('scope');if(payload?.provider_versions?.modiv_record_change!==VERSION)mismatches.push('provider_versions');
    const ok=response.ok&&mismatches.length===0;await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches}});
    return json(ok?200:502,{ok,scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches,value,meta,provider_versions:payload?.provider_versions||{}});
  }catch(e){return json(500,{ok:false,scenario:SCENARIO,error:String((e as Error)?.message||e)})}finally{if(userId)await cleanup(userId)}
}
