const RELEASE_ID='treasury-modiv-2021-2026-v2';
const SOURCE_ID='nj-dca-modiv-longitudinal';
const SOURCE_YEARS=[2021,2022,2023,2024,2025,2026];
const DISTRICTS=['0101','0415','0818'];
const HISTORY_FIELDS=['land','improvement','total','class','exemptions'];

function yearsOf(value:any){
  return Array.isArray(value)?value.map(Number).filter((year:number)=>Number.isInteger(year)).sort((a:number,b:number)=>a-b):[];
}
function sameArray(a:number[],b:number[]){return a.length===b.length&&a.every((value,index)=>value===b[index])}

export async function runModivMissingYearCanary(admin:any,gateId:string,now:string){
  const started=Date.now();
  const {data:release,error:releaseError}=await admin.from('modiv_longitudinal_releases')
    .select('release_id,storage_prefix,source_years,manifest,status')
    .eq('release_id',RELEASE_ID)
    .eq('status','live')
    .maybeSingle();
  const privacy=release?.manifest?.privacy_contract||{};
  const contractOk=!releaseError&&!!release
    && release?.manifest?.source_id===SOURCE_ID
    && Number(release?.manifest?.schema_version)===2
    && sameArray(yearsOf(release?.source_years),SOURCE_YEARS)
    && privacy?.safe_fields_only===true
    && privacy?.raw_archives_persisted===false
    && privacy?.owner_names_retained===false
    && privacy?.mailing_addresses_retained===false
    && privacy?.social_security_numbers_retained===false
    && privacy?.mortgage_account_numbers_retained===false;
  if(!contractOk){
    const evidence={ok:false,scenario:'modiv_longitudinal_missing_year_v1',target_function:'modiv-longitudinal-private-source',status_code:502,duration_ms:Date.now()-started,assertion:{ok:false,reason:'live_release_contract_mismatch'}};
    await admin.from('watchdog_test_auth_events').insert({token_id:gateId,user_id:null,event_type:'provider_release_canary',metadata:evidence});
    return evidence;
  }

  for(const district of DISTRICTS){
    const path=`${release.storage_prefix}/district/${district}.json.gz`;
    const {data,error}=await admin.storage.from('modiv-longitudinal').download(path);
    if(error||!data)continue;
    let partition:any=null;
    try{
      partition=await new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).json();
    }catch{continue}
    if(Number(partition?.schema_version)!==2||partition?.source_id!==SOURCE_ID||String(partition?.district_code)!==district||!sameArray(yearsOf(partition?.source_years),SOURCE_YEARS)||!partition?.records)continue;
    for(const [recordKey,record] of Object.entries(partition.records) as [string,any][]){
      const observed=yearsOf(record?.years);
      if(!observed.length||observed.length>=SOURCE_YEARS.length||observed.some((year:number)=>!SOURCE_YEARS.includes(year)))continue;
      const missing=SOURCE_YEARS.filter(year=>!observed.includes(year));
      const fieldYears:Record<string,number[]>={};
      let synthesized=false;
      for(const field of HISTORY_FIELDS){
        const years=Object.keys(record?.[field]||{}).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
        fieldYears[field]=years;
        if(years.some(year=>missing.includes(year)||!observed.includes(year)))synthesized=true;
      }
      if(synthesized)continue;
      const payload={release_id:RELEASE_ID,source_id:SOURCE_ID,district_code:district,record_key:recordKey,assessment_history_depth:observed.length,assessment_record_years:observed,missing_years:missing,retained_history_field_years:fieldYears,synthesized_missing_years:false,privacy_contract:{safe_fields_only:true,raw_archives_persisted:false},checked_at:now};
      const evidence={ok:true,scenario:'modiv_longitudinal_missing_year_v1',target_function:'modiv-longitudinal-private-source',status_code:200,duration_ms:Date.now()-started,assertion:{ok:true,missing_years:missing,synthesized_missing_years:false},payload};
      await admin.from('watchdog_test_auth_events').insert({token_id:gateId,user_id:null,event_type:'provider_release_canary',metadata:evidence});
      return evidence;
    }
  }
  const evidence={ok:false,scenario:'modiv_longitudinal_missing_year_v1',target_function:'modiv-longitudinal-private-source',status_code:502,duration_ms:Date.now()-started,assertion:{ok:false,reason:'no_real_partial_history_control_found'}};
  await admin.from('watchdog_test_auth_events').insert({token_id:gateId,user_id:null,event_type:'provider_release_canary',metadata:evidence});
  return evidence;
}
