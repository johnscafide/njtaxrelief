import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, {auth:{persistSession:false,autoRefreshToken:false}});
const PIN = '0101_25.01_10';
const SOURCE = 'NJ Division of Taxation assessment uniformity';

function json(status:number, payload:unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}
  });
}
async function sha256Hex(value:string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function cleanup(userId:string) {
  await admin.from('watchdog_test_accounts').delete().eq('user_id',userId);
  await admin.from('account_entitlements').delete().eq('user_id',userId);
  await admin.from('profiles').delete().eq('id',userId);
  await admin.auth.admin.deleteUser(userId);
}

Deno.serve(async (req:Request) => {
  if (req.method !== 'POST') return json(405,{error:'POST required'});
  let body:any={};
  try { body=await req.json(); } catch { return json(400,{error:'Invalid JSON'}); }
  const token=String(body?.token||'').trim();
  if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(401,{error:'Invalid canary request'});

  const hash=await sha256Hex(token), now=new Date().toISOString();
  const {data:gate,error:gateError}=await admin.from('watchdog_test_bootstrap_tokens')
    .update({used_at:now})
    .eq('token_hash',hash)
    .is('used_at',null)
    .gt('expires_at',now)
    .contains('metadata',{purpose:'uniformity_history_release_canary'})
    .select('id,desired_email')
    .maybeSingle();
  if (gateError || !gate) return json(401,{error:'Invalid or expired release canary token'});

  const email=String(gate.desired_email||'').trim().toLowerCase();
  let userId='';
  try {
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email});
    const hashed=String(link?.properties?.hashed_token||'');
    userId=String(link?.user?.id||'');
    if (linkError || !hashed || !userId) throw new Error('sandbox_link_generation_failed');

    const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:verified,error:verifyError}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});
    const accessToken=verified?.session?.access_token||'';
    if (verifyError || !accessToken) throw new Error('sandbox_session_verification_failed');

    const profile=await admin.from('profiles').upsert({
      id:userId,email,full_name:'Watchdog Uniformity Release Canary',display_name:'Watchdog Uniformity Release Canary',
      account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,
      custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true}
    },{onConflict:'id'});
    if (profile.error) throw new Error('sandbox_profile_failed');
    const acct=await admin.from('watchdog_test_accounts').upsert({
      user_id:userId,label:'Uniformity Release Canary',last_bootstrap_at:now,
      metadata:{email,no_real_spend:true,purpose:'uniformity_history_release_canary'}
    },{onConflict:'user_id'});
    if (acct.error) throw new Error('sandbox_account_failed');

    const started=Date.now();
    const response=await fetch(`${URL}/functions/v1/workbench-hydrate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${accessToken}`,apikey:ANON,'Content-Type':'application/json'},
      body:JSON.stringify({pams_pins:[PIN],marker_ids:['uniformity.cod_2022','uniformity.cod_2016']})
    });
    const text=await response.text();
    let payload:any=null;
    try { payload=JSON.parse(text); } catch { payload={raw:text.slice(0,500)}; }

    const cod2022=payload?.markers?.[PIN]?.['uniformity.cod_2022'];
    const cod2016=payload?.markers?.[PIN]?.['uniformity.cod_2016'];
    const meta2022=payload?.meta?.[PIN]?.['uniformity.cod_2022']||{};
    const meta2016=payload?.meta?.[PIN]?.['uniformity.cod_2016']||{};
    const assertions={
      signed_in_plan: payload?.plan === 'developer',
      cod_2022_exact: cod2022 === 18.09,
      cod_2022_available: meta2022.status === 'available',
      cod_2022_provider_kind: meta2022.provider_kind === 'authoritative_reference',
      cod_2022_provenance: meta2022.source === SOURCE,
      cod_2016_no_synthetic_value: cod2016 === null || cod2016 === undefined,
      cod_2016_missing_semantics: meta2016.status === 'source_checked_no_value',
      cod_2016_provider_kind: meta2016.provider_kind === 'authoritative_reference',
      cod_2016_provenance: meta2016.source === SOURCE
    };
    const ok=response.ok && Object.values(assertions).every(Boolean);
    const evidence={
      ok,
      target_function:'workbench-hydrate',
      pams_pin:PIN,
      expected:{'uniformity.cod_2022':18.09,'uniformity.cod_2016':null},
      returned:{'uniformity.cod_2022':cod2022,'uniformity.cod_2016':cod2016??null},
      meta:{'uniformity.cod_2022':meta2022,'uniformity.cod_2016':meta2016},
      assertions,
      status_code:response.status,
      duration_ms:Date.now()-started
    };
    await admin.from('watchdog_test_auth_events').insert({
      token_id:gate.id,user_id:userId,event_type:'uniformity_history_release_canary',
      metadata:{ok,status_code:response.status,duration_ms:evidence.duration_ms,assertions}
    });
    return json(ok?200:502,evidence);
  } catch(error) {
    return json(500,{ok:false,error:String((error as Error)?.message||error)});
  } finally {
    if (userId) await cleanup(userId);
  }
});
