import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const URL=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const SCENARIO='investor_screen_alias_v1';
const ALIAS='watchdog.investor_screen',TARGET='watchdog.investor.investment_diligence_priority';
const PINS=['0101_25.01_10','0102_139_15'];
function json(status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function hash(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(id:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',id);await admin.from('account_entitlements').delete().eq('user_id',id);await admin.from('profiles').delete().eq('id',id);await admin.auth.admin.deleteUser(id)}
function sameNumber(a:any,b:any){const x=Number(a),y=Number(b);return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=1e-9*Math.max(1,Math.abs(y))}
export async function handleInvestorScreenAliasCanary(req:Request){
 let body:any={};try{body=await req.json()}catch{return json(400,{error:'Invalid JSON'})}
 const token=String(body?.token||'').trim();if(String(body?.scenario||'')!==SCENARIO||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(401,{error:'Invalid release canary request'});
 const now=new Date().toISOString();
 const {data:gate}=await admin.from('watchdog_test_bootstrap_tokens').update({used_at:now}).eq('token_hash',await hash(token)).is('used_at',null).gt('expires_at',now).contains('metadata',{purpose:'provider_release_canary',scenario:SCENARIO}).select('id,desired_email').maybeSingle();
 if(!gate)return json(401,{error:'Invalid or expired release canary token'});
 let userId='';
 try{
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:String(gate.desired_email||'')});userId=String(link?.user?.id||'');const hashed=String(link?.properties?.hashed_token||'');if(linkError||!userId||!hashed)throw new Error('sandbox_link_generation_failed');
  const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {data:v,error:ve}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});const access=v?.session?.access_token||'';if(ve||!access)throw new Error('sandbox_session_verification_failed');
  const pr=await admin.from('profiles').upsert({id:userId,email:String(gate.desired_email||''),full_name:'Watchdog Investor Screen Canary',display_name:'Watchdog Investor Screen Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true,scenario:SCENARIO}},{onConflict:'id'});if(pr.error)throw new Error('sandbox_profile_failed');
  const ta=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'Investor Screen Alias Canary',last_bootstrap_at:now,metadata:{no_real_spend:true,scenario:SCENARIO}},{onConflict:'user_id'});if(ta.error)throw new Error('sandbox_account_failed');
  const started=Date.now();const response=await fetch(`${URL}/functions/v1/workbench-derived`,{method:'POST',headers:{Authorization:`Bearer ${access}`,apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:PINS,marker_ids:[ALIAS,TARGET]})});
  const payload=await response.json();const observations:any[]=[];
  let passing:any=null;
  for(const pin of PINS){
    const av=payload?.markers?.[pin]?.[ALIAS],tv=payload?.markers?.[pin]?.[TARGET],am=payload?.meta?.[pin]?.[ALIAS]||{},tm=payload?.meta?.[pin]?.[TARGET]||{};
    const available=am.status==='available'&&tm.status==='available'&&av!==null&&av!==undefined&&tv!==null&&tv!==undefined;
    const equal=available&&sameNumber(av,tv);
    const kinds=String(am.provider_kind||'')==='derived_governed'&&String(tm.provider_kind||'')==='derived_governed';
    const obs={pin,alias_value:av,target_value:tv,alias_status:am.status||null,target_status:tm.status||null,alias_kind:am.provider_kind||null,target_kind:tm.provider_kind||null,equal,kinds};observations.push(obs);
    if(equal&&kinds&&!passing)passing=obs;
  }
  const ok=response.ok&&Boolean(passing);const mismatches=ok?[]:['No control parcel returned matching available derived-governed alias and canonical target values'];
  await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches,passing_pin:passing?.pin||null}});
  return json(ok?200:502,{ok,scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches,passing,observations});
 }catch(e){return json(500,{ok:false,scenario:SCENARIO,error:String((e as Error)?.message||e)})}finally{if(userId)await cleanup(userId)}
}
