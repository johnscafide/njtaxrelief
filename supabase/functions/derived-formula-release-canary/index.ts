import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(['https://njpropertytaxrelief.com','https://www.njpropertytaxrelief.com']);
function cors(req:Request){const o=req.headers.get('origin')||'';return{'Access-Control-Allow-Origin':ORIGINS.has(o)?o:'https://njpropertytaxrelief.com','Access-Control-Allow-Headers':'content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}}
function json(req:Request,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function sha256Hex(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(userId:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',userId);await admin.from('account_entitlements').delete().eq('user_id',userId);await admin.from('profiles').delete().eq('id',userId);await admin.auth.admin.deleteUser(userId)}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{error:'POST required'});
  let body:any={};try{body=await req.json()}catch{return json(req,400,{error:'Invalid JSON'})}
  const token=String(body?.token||'').trim();
  if(!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(req,401,{error:'Invalid release canary request'});
  const hash=await sha256Hex(token),now=new Date().toISOString();
  const {data:gate,error:gateError}=await admin.from('watchdog_test_bootstrap_tokens')
    .update({used_at:now}).eq('token_hash',hash).is('used_at',null).gt('expires_at',now)
    .contains('metadata',{purpose:'derived_formula_release_canary'})
    .select('id,desired_email,metadata').maybeSingle();
  if(gateError||!gate)return json(req,401,{error:'Invalid or expired release canary token'});
  const metadata:any=gate.metadata||{}, pins=[...new Set((Array.isArray(metadata.pams_pins)?metadata.pams_pins:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))].slice(0,10);
  const markerIds=[...new Set((Array.isArray(metadata.marker_ids)?metadata.marker_ids:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))].slice(0,100);
  if(!pins.length||!markerIds.length)return json(req,400,{error:'Canary metadata missing pinned parcels/markers'});
  const email=String(gate.desired_email||'').trim().toLowerCase();let userId='';
  try{
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email});
    const hashed=String(link?.properties?.hashed_token||'');userId=String(link?.user?.id||'');
    if(linkError||!hashed||!userId)throw new Error('sandbox_link_generation_failed');
    const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:verified,error:verifyError}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});
    const accessToken=verified?.session?.access_token||'';if(verifyError||!accessToken)throw new Error('sandbox_session_verification_failed');
    const profile=await admin.from('profiles').upsert({id:userId,email,full_name:'Watchdog Derived Formula Release Canary',display_name:'Watchdog Derived Formula Release Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true}},{onConflict:'id'});
    if(profile.error)throw new Error('sandbox_profile_failed');
    const acct=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'Derived Formula Release Canary',last_bootstrap_at:now,metadata:{email,no_real_spend:true,purpose:'derived_formula_release_canary'}},{onConflict:'user_id'});
    if(acct.error)throw new Error('sandbox_account_failed');
    const started=Date.now();
    const response=await fetch(`${URL}/functions/v1/workbench-derived`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:pins,marker_ids:markerIds})});
    const text=await response.text();let payload:any=null;try{payload=JSON.parse(text)}catch{payload={raw:text.slice(0,1000)}}
    const missing:string[]=[],providerKindMismatched:string[]=[],valueMismatched:string[]=[];
    for(const pin of pins){for(const id of markerIds){const value=payload?.markers?.[pin]?.[id],meta=payload?.meta?.[pin]?.[id];if(meta?.status!=='available'||value===null||value===undefined)missing.push(`${pin}:${id}`);if(meta?.status==='available'&&String(meta?.provider_kind||'')!=='derived_governed')providerKindMismatched.push(`${pin}:${id}:${String(meta?.provider_kind||'')}`)}}
    const expected:any=metadata.expected_values||{};
    for(const [pin,vals] of Object.entries(expected)){for(const [id,want] of Object.entries(vals as any)){const got=payload?.markers?.[pin]?.[id];if(got!==want)valueMismatched.push(`${pin}:${id}:expected=${String(want)}:got=${String(got)}`)}}
    const assertion={ok:missing.length===0&&providerKindMismatched.length===0&&valueMismatched.length===0,missing,provider_kind_mismatched:providerKindMismatched,value_mismatched:valueMismatched};
    const evidence={target_function:'workbench-derived',status_code:response.status,duration_ms:Date.now()-started,assertion,payload};
    await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'derived_formula_release_canary',metadata:{status_code:response.status,duration_ms:evidence.duration_ms,assertion_ok:assertion.ok,missing,provider_kind_mismatched:providerKindMismatched,value_mismatched:valueMismatched,marker_count:markerIds.length,pin_count:pins.length}});
    return json(req,response.ok&&assertion.ok?200:502,{ok:response.ok&&assertion.ok,...evidence});
  }catch(error){return json(req,500,{ok:false,error:String((error as Error)?.message||error)})}
  finally{if(userId)await cleanup(userId)}
});
