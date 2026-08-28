import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const URL=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const SCENARIO='ufb_v039',PIN='0101_canary_1';
const VERSION='nj-dca-ufb-v039',RELEASE='nj-dca-ufb-2025-2025-10-23-v1';
const WORKBOOK_SHA='79a59be4c4ab2669d60ebb8072aab5a5775df7025e66cb95a887e1c39ed8ccaa';
const SOURCE=`NJ DCA User Friendly Budget Database · 2025 Summary · self-reported/unaudited municipal submissions · ${RELEASE}`;
const EXPECTED:Record<string,{value:number,field:string}>={
 'njplus.nj-dca-ufb-2025.rut_tax_collection_pct':{value:0.9825,field:'Tax Collections and Delinquent Taxes · % of Tax Collections used to Calculate RUT'},
 'njplus.nj-dca-ufb-2025.current_year_anticipated_revenue_total':{value:14295569.48,field:'2025 Total Anticipated Revenues Current Year (Budgeted) · Total'},
 'njplus.nj-dca-ufb-2025.current_year_general_budget_revenue_total':{value:12122569.48,field:'2025 Total General Budget Revenues Current Year · Total'},
 'njplus.nj-dca-ufb-2025.current_year_appropriation_total':{value:14295569.48,field:'2025 Total Appropriations by Service Type (Current Year) · TOTAL APPROPRIATION'},
 'njplus.nj-dca-ufb-2025.current_year_general_budget_appropriation_public_safety':{value:3797250,field:'2025 General Budget Appropriations · Public Safety'},
 'njplus.nj-dca-ufb-2025.total_personnel_cost':{value:6341250.01,field:'Total Personnel Costs · Total Personnel Cost'},
 'njplus.nj-dca-ufb-2025.gross_debt_total':{value:18675000,field:'Gross Debt · Gross Debt'},
 'njplus.nj-dca-ufb-2025.net_debt_total':{value:16285000,field:'Net Debt · Net Debt'},
 'njplus.nj-dca-ufb-2025.debt_service_current_year_budget_payment':{value:1246643.78,field:'Debt Service · CY Budget Debt Pmt'},
 'njplus.nj-dca-ufb-2025.accumulated_absence_gross_days':{value:2908.04,field:'Absences · Gross Days of Accumulated Absence'},
 'njplus.nj-dca-ufb-2025.structural_total_imbalances':{value:0,field:'Structural Imbalances · Total Imbalances'},
};
function json(status:number,p:any){return new Response(JSON.stringify(p),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}})}
async function hash(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function cleanup(id:string){await admin.from('watchdog_test_accounts').delete().eq('user_id',id);await admin.from('account_entitlements').delete().eq('user_id',id);await admin.from('profiles').delete().eq('id',id);await admin.auth.admin.deleteUser(id)}
function same(a:any,b:number){const x=Number(a);return Number.isFinite(x)&&Math.abs(x-b)<=1e-6*Math.max(1,Math.abs(b))}
export async function handleUfbV039Canary(req:Request){
 let body:any={};try{body=await req.json()}catch{return json(400,{error:'Invalid JSON'})}
 const token=String(body?.token||'').trim();if(String(body?.scenario||'')!==SCENARIO||!/^[A-Za-z0-9_-]{40,160}$/.test(token))return json(401,{error:'Invalid release canary request'});
 const now=new Date().toISOString();
 const {data:gate}=await admin.from('watchdog_test_bootstrap_tokens').update({used_at:now}).eq('token_hash',await hash(token)).is('used_at',null).gt('expires_at',now).contains('metadata',{purpose:'provider_release_canary',scenario:SCENARIO}).select('id,desired_email').maybeSingle();
 if(!gate)return json(401,{error:'Invalid or expired release canary token'});
 let userId='';
 try{
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:String(gate.desired_email||'')});userId=String(link?.user?.id||'');const hashed=String(link?.properties?.hashed_token||'');if(linkError||!userId||!hashed)throw new Error('sandbox_link_generation_failed');
  const authClient=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const {data:v,error:ve}=await authClient.auth.verifyOtp({token_hash:hashed,type:'email'});const access=v?.session?.access_token||'';if(ve||!access)throw new Error('sandbox_session_verification_failed');
  const pr=await admin.from('profiles').upsert({id:userId,email:String(gate.desired_email||''),full_name:'Watchdog UFB v0.39 Canary',display_name:'Watchdog UFB v0.39 Canary',account_role:'developer',plan_tier:'standard',plan:'free',profile_complete:true,custom:{watchdog_test_account:true,no_real_spend:true,release_canary:true,scenario:SCENARIO}},{onConflict:'id'});if(pr.error)throw new Error('sandbox_profile_failed');
  const ta=await admin.from('watchdog_test_accounts').upsert({user_id:userId,label:'UFB v0.39 Canary',last_bootstrap_at:now,metadata:{no_real_spend:true,scenario:SCENARIO}},{onConflict:'user_id'});if(ta.error)throw new Error('sandbox_account_failed');
  const ids=Object.keys(EXPECTED),started=Date.now();const response=await fetch(`${URL}/functions/v1/workbench-hydrate`,{method:'POST',headers:{Authorization:`Bearer ${access}`,apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({pams_pins:[PIN],marker_ids:ids})});
  const payload=await response.json();const mismatches:string[]=[];const observed:Record<string,any>={};
  for(const id of ids){const exp=EXPECTED[id],value=payload?.markers?.[PIN]?.[id],meta=payload?.meta?.[PIN]?.[id]||{};observed[id]={value,meta};if(!same(value,exp.value))mismatches.push(`${id}:value`);if(String(meta.status||'')!=='available')mismatches.push(`${id}:status`);if(String(meta.provider_kind||'')!=='authoritative_reference')mismatches.push(`${id}:kind`);if(String(meta.source||'')!==SOURCE)mismatches.push(`${id}:source`);if(String(meta.provider_version||'')!==VERSION)mismatches.push(`${id}:version`);if(String(meta.source_release||'')!==RELEASE)mismatches.push(`${id}:release`);if(String(meta.scope||'')!=='municipality')mismatches.push(`${id}:scope`);if(String(meta.source_field||'')!==exp.field)mismatches.push(`${id}:field`);if(String(meta.source_sheet||'')!=='2025 Summary')mismatches.push(`${id}:sheet`);if(Number(meta.budget_year)!==2025)mismatches.push(`${id}:budget_year`);if(String(meta.workbook_sha256||'')!==WORKBOOK_SHA)mismatches.push(`${id}:workbook_sha`);if(Boolean(meta?.source_quality?.no_ufb_available)||Boolean(meta?.source_quality?.significant_data_missing))mismatches.push(`${id}:quality`) }
  if(payload?.provider_versions?.ufb_v039!==VERSION)mismatches.push('provider_versions');
  const ok=response.ok&&mismatches.length===0;await admin.from('watchdog_test_auth_events').insert({token_id:gate.id,user_id:userId,event_type:'provider_release_canary',metadata:{scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches}});
  return json(ok?200:502,{ok,scenario:SCENARIO,status_code:response.status,duration_ms:Date.now()-started,assertion_ok:ok,mismatches,observed,provider_versions:payload?.provider_versions||{}});
 }catch(e){return json(500,{ok:false,scenario:SCENARIO,error:String((e as Error)?.message||e)})}finally{if(userId)await cleanup(userId)}
}
