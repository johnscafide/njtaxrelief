import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const TARGET={
  pams_pins:['0505_824.02_12'],
  marker_ids:[
    'njplus.njdep-csrr-gis.kcsl_case_status',
    'njplus.njdep-csrr-gis.kcsl_program_interest',
    'njplus.njdep-csrr-gis.kcsl_site_id',
    'njplus.njdep-csrr-gis.environmental_layer_vintage'
  ]
};
async function sha256Hex(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(userId:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',userId);await admin.from('account_entitlements').delete().eq('user_id',userId);await admin.from('profiles').delete().eq('id',userId);await admin.auth.admin.deleteUser(userId)}
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response(JSON.stringify({error:'POST required'}),{status:405,headers:{'content-type':'application/json','cache-control':'no-store'}});
  let body:any={};try{body=await req.json()}catch{return new Response(JSON.stringify({error:'Invalid JSON'}),{status:400,headers:{'content-type':'application/json','cache-control':'no-store'}})}
  const token=String(body?.token||'').trim();if(!/^[A-Za-z0-9_-]{40,160}$/.test(token))return new Response(JSON.stringify({error:'Invalid release canary request'}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
  const hash=await sha256Hex(token),now=new Date().toISOString();
  const {data:gate,error:gateError}=await admin.from('watchdog_test_bootstrap_tokens').update({used_at:now}).eq('token_hash',hash).is('used_at',null).gt('expires_at',now).contains('metadata',{purpose:'csrr_release_canary'}).select('id,desired_email').maybeSingle();
  if(gateError||!gate)return new Response(JSON.stringify({error:'Invalid or expired release canary token'}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
  let userId='';
  try{
    const email=String(gate.desired_email||'').trim().toLowerCase();
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email});
    userId=String(link?.user?.id||'');const hashed=String(link?.properties?.hashed_token||'');if(linkError||!userId||!hashed)throw new Error('sandbox_link_generation_failed');
    const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:verified,error:verifyError}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});const accessToken=verified?.session?.access_token||'';if(verifyError||!accessToken)throw new Error('sandbox_session_verification_failed');
    const profile=await admin.from('profiles').upsert({id:userId,email,full_name:'Watchdog CSRR Release Canary',display_name:'Watchdog CSRR Release Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true}},{onConflict:'id'});if(profile.error)throw new Error('sandbox_profile_failed');
    const acct=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'CSRR Release Canary',last_bootstrap_at:now,metadata:{email,no_real_spend:true,scenario:'csrr_v1'}},{onConflict:'user_id'});if(acct.error)throw new Error('sandbox_account_failed');
    const started=Date.now();const response=await fetch(URL+'/functions/v1/workbench-hydrate',{method:'POST',headers:{Authorization:'Bearer '+accessToken,apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify(TARGET)});const text=await response.text();let payload:any=null;try{payload=JSON.parse(text)}catch{payload={raw:text.slice(0,500)}}
    const evidence={scenario:'csrr_v1',target_function:'workbench-hydrate',status_code:response.status,duration_ms:Date.now()-started,payload};await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:'csrr_v1',status_code:response.status,duration_ms:evidence.duration_ms}});return new Response(JSON.stringify({ok:response.ok,...evidence}),{status:response.ok?200:502,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }catch(error){return new Response(JSON.stringify({ok:false,scenario:'csrr_v1',error:String((error as Error)?.message||error)}),{status:500,headers:{'content-type':'application/json','cache-control':'no-store'}})}finally{if(userId)await cleanup(userId)}
});
