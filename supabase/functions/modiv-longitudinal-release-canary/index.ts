import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const RELEASE_ID='treasury-modiv-2021-2026-v2';
const SOURCE_ID='nj-dca-modiv-longitudinal';
const SOURCE_YEARS=[2021,2022,2023,2024,2025,2026];
const DISTRICTS=['0101','0415','0818'];
const HISTORY_FIELDS=['land','improvement','total','class','exemptions'];

async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function reply(status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}});
}
function yearsOf(value:any){
  return Array.isArray(value)?value.map(Number).filter((year:number)=>Number.isInteger(year)).sort((a:number,b:number)=>a-b):[];
}
function sameArray(a:number[],b:number[]){return a.length===b.length&&a.every((value,index)=>value===b[index])}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  let body:any={};try{body=await req.json()}catch{return reply(400,{error:'Invalid JSON'})}
  const token=String(body?.token||'').trim();
  if(!/^[A-Za-z0-9_-]{40,160}$/.test(token))return reply(401,{error:'Invalid canary token'});
  const hash=await sha256Hex(token),now=new Date().toISOString();
  const {data:gate,error:gateError}=await admin.from('watchdog_test_bootstrap_tokens')
    .update({used_at:now})
    .eq('token_hash',hash)
    .is('used_at',null)
    .gt('expires_at',now)
    .contains('metadata',{purpose:'modiv_longitudinal_missing_year_canary',release_id:RELEASE_ID,no_real_spend:true})
    .select('id')
    .maybeSingle();
  if(gateError||!gate)return reply(401,{error:'Invalid or expired canary token'});

  const {data:release,error:releaseError}=await admin.from('modiv_longitudinal_releases')
    .select('release_id,storage_prefix,source_years,manifest,status')
    .eq('release_id',RELEASE_ID)
    .eq('status','live')
    .maybeSingle();
  const privacy=release?.manifest?.privacy_contract||{};
  if(releaseError||!release||release?.manifest?.source_id!==SOURCE_ID||Number(release?.manifest?.schema_version)!==2||!sameArray(yearsOf(release?.source_years),SOURCE_YEARS)||privacy?.safe_fields_only!==true||privacy?.raw_archives_persisted!==false){
    return reply(502,{ok:false,error:'Live MOD-IV release contract mismatch'});
  }

  for(const district of DISTRICTS){
    const path=`${release.storage_prefix}/district/${district}.json.gz`;
    const {data,error}=await admin.storage.from('modiv-longitudinal').download(path);
    if(error||!data)continue;
    let partition:any=null;
    try{
      partition=await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).json();
    }catch{continue}
    if(partition?.schema_version!==2||partition?.source_id!==SOURCE_ID||String(partition?.district_code)!==district||!sameArray(yearsOf(partition?.source_years),SOURCE_YEARS)||!partition?.records)continue;
    for(const [recordKey,record] of Object.entries(partition.records) as [string,any][]){
      const observed=yearsOf(record?.years);
      if(!observed.length||observed.length>=SOURCE_YEARS.length||observed.some((year:number)=>!SOURCE_YEARS.includes(year)))continue;
      const missing=SOURCE_YEARS.filter(year=>!observed.includes(year));
      const fieldYears:any={};
      let synthesized=false;
      for(const field of HISTORY_FIELDS){
        const years=Object.keys(record?.[field]||{}).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
        fieldYears[field]=years;
        if(years.some(year=>missing.includes(year)||!observed.includes(year)))synthesized=true;
      }
      if(synthesized)continue;
      return reply(200,{
        ok:true,
        release_id:RELEASE_ID,
        source_id:SOURCE_ID,
        district_code:district,
        record_key:recordKey,
        assessment_history_depth:observed.length,
        assessment_record_years:observed,
        missing_years:missing,
        retained_history_field_years:fieldYears,
        synthesized_missing_years:false,
        privacy_contract:{safe_fields_only:true,raw_archives_persisted:false},
        checked_at:now
      });
    }
  }
  return reply(502,{ok:false,error:'No real partial-history parcel found in bounded canary districts'});
});
