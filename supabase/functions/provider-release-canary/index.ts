import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com','https://watchdogindex.com','https://www.watchdogindex.com']);

type Scenario={fn:string;body:any};
const SCENARIOS:Record<string,Scenario>={
  zoning_v31:{
    fn:'workbench-hydrate',
    body:{
      pams_pins:['0102_139_15'],
      marker_ids:[
        'njplus.nj-dca-zoning-directory.zoning_map_url',
        'njplus.nj-dca-zoning-directory.zoning_ordinance_url',
        'njplus.nj-dca-zoning-directory.municipal_zoning_portal'
      ]
    }
  },
  zoning_contact_status_v1:{
    fn:'workbench-hydrate',
    body:{
      pams_pins:['0102_139_15'],
      marker_ids:[
        'njplus.nj-dca-zoning-directory.zoning_officer_contact',
        'njplus.nj-dca-zoning-directory.zoning_directory_status'
      ]
    }
  },
  designation_stack_v15:{
    fn:'workbench-derived',
    body:{
      pams_pins:['0102_139_15'],
      marker_ids:['watchdog.njplus.development_designation_stack']
    }
  }
};

function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}}
function json(req:Request,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function sha256Hex(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(userId:string){
  await admin.from('watchdog_test_accounts').delete().eq('user_id',userId);
  await admin.from('account_entitlements').delete().eq('user_id',userId);
  await admin.from('profiles').delete().eq('id',userId);
  await admin.auth.admin.deleteUser(userId);
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{error:'POST required'});
  let body:any={};try{body=await req.json()}catch{return json(req,400,{error:'Invalid JSON'})}
  const token=String(body?.token||'').trim(),scenarioKey=String(body?.scenario||'').trim(),scenario=SCENARIOS[scenarioKey];
  if(!scenario||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(req,401,{error:'Invalid release canary request'});
  const hash=await sha256Hex(token),now=new Date().toISOString();
  const {data:gate,error:gateError}=await admin.from('watchdog_test_bootstrap_tokens')
    .update({used_at:now})
    .eq('token_hash',hash).is('used_at',null).gt('expires_at',now)
    .contains('metadata',{purpose:'provider_release_canary',scenario:scenarioKey})
    .select('id,desired_email').maybeSingle();
  if(gateError||!gate)return json(req,401,{error:'Invalid or expired release canary token'});

  const email=String(gate.desired_email||'').trim().toLowerCase();
  let userId='';
  try{
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email});
    const hashed=String(link?.properties?.hashed_token||'');
    userId=String(link?.user?.id||'');
    if(linkError||!hashed||!userId)throw new Error('sandbox_link_generation_failed');

    const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:verified,error:verifyError}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});
    const accessToken=verified?.session?.access_token||'';
    if(verifyError||!accessToken)throw new Error('sandbox_session_verification_failed');

    const profile=await admin.from('profiles').upsert({
      id:userId,email,full_name:'Watchdog Provider Release Canary',display_name:'Watchdog Provider Release Canary',
      account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,
      custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true}
    },{onConflict:'id'});
    if(profile.error)throw new Error('sandbox_profile_failed');
    const acct=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'Provider Release Canary',last_bootstrap_at:now,metadata:{email,no_real_spend:true,scenario:scenarioKey}},{onConflict:'user_id'});
    if(acct.error)throw new Error('sandbox_account_failed');

    const started=Date.now();
    const response=await fetch(`${URL}/functions/v1/${scenario.fn}`,{
      method:'POST',
      headers:{Authorization:`Bearer ${accessToken}`,apikey:ANON,'Content-Type':'application/json'},
      body:JSON.stringify(scenario.body)
    });
    const text=await response.text();let payload:any=null;try{payload=JSON.parse(text)}catch{payload={raw:text.slice(0,500)}}
    const evidence={scenario:scenarioKey,target_function:scenario.fn,status_code:response.status,duration_ms:Date.now()-started,payload};
    await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:scenarioKey,status_code:response.status,duration_ms:evidence.duration_ms}});
    return json(req,response.ok?200:502,{ok:response.ok,...evidence});
  }catch(error){
    return json(req,500,{ok:false,scenario:scenarioKey,error:String((error as Error)?.message||error)});
  }finally{
    if(userId)await cleanup(userId);
  }
});
