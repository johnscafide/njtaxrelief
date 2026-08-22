export const MODIV_LONGITUDINAL_PROVIDER_VERSION='treasury-modiv-2021-2026-v2';

const SOURCE_ID='nj-dca-modiv-longitudinal';
const BUCKET='modiv-longitudinal';
const SOURCE_YEARS=[2021,2022,2023,2024,2025,2026];
const SUPPORTED_FIELDS=new Set([
  'assessment_history_depth',
  'assessment_land_history',
  'assessment_improvement_history',
  'assessment_total_history',
  'property_class_history',
  'exemption_code_history',
  'assessment_record_years',
]);
const SOURCE_LABEL='NJ Division of Taxation annual MOD-IV assessment lists';

type CacheEntry={at:number;payload:any};
let releaseCache:CacheEntry|null=null;
const districtCache=new Map<string,CacheEntry>();

function sameYears(value:any){return Array.isArray(value)&&value.length===SOURCE_YEARS.length&&value.every((x:any,i:number)=>Number(x)===SOURCE_YEARS[i])}
function normComponent(input:any){
  const value=String(input??'').trim().toUpperCase();
  if(!value)return'';
  if(/^\d+(?:\.\d+)?$/.test(value)){
    const [whole,frac='']=value.split('.');
    const normalizedWhole=whole.replace(/^0+(?=\d)/,'')||'0';
    const normalizedFrac=frac.replace(/0+$/,'');
    return normalizedFrac?`${normalizedWhole}.${normalizedFrac}`:normalizedWhole;
  }
  return value.replace(/\s+/g,' ');
}
function treasuryComponent(input:any){
  const value=normComponent(input);
  const match=value.match(/^(\d+)\.(\d{1,2})$/);
  if(!match)return value;
  const whole=match[1].padStart(5,'0');
  const fraction=match[2].padEnd(2,'0');
  return `${whole} ${fraction}`;
}
function sourceFor(releaseId:string){return `${SOURCE_LABEL} · ${releaseId}`}
function orderedYearObject(value:any){
  if(!value||typeof value!=='object'||Array.isArray(value))return{};
  return Object.fromEntries(Object.entries(value).sort(([a],[b])=>Number(a)-Number(b)));
}
function releaseValid(row:any){
  const privacy=row?.manifest?.privacy_contract||{};
  return row?.release_id===MODIV_LONGITUDINAL_PROVIDER_VERSION
    && row?.status==='live'
    && sameYears(row?.source_years)
    && row?.manifest?.source_id===SOURCE_ID
    && Number(row?.manifest?.schema_version)===2
    && privacy?.safe_fields_only===true
    && privacy?.raw_archives_persisted===false
    && privacy?.owner_names_retained===false
    && privacy?.mailing_addresses_retained===false
    && privacy?.social_security_numbers_retained===false
    && privacy?.mortgage_account_numbers_retained===false;
}
async function liveRelease(admin:any){
  if(releaseCache&&Date.now()-releaseCache.at<300000)return releaseCache.payload;
  const {data,error}=await admin.from('modiv_longitudinal_releases')
    .select('release_id,storage_prefix,source_years,manifest,status')
    .eq('release_id',MODIV_LONGITUDINAL_PROVIDER_VERSION)
    .eq('status','live')
    .maybeSingle();
  if(error||!releaseValid(data))return null;
  releaseCache={at:Date.now(),payload:data};
  return data;
}
async function districtPartition(admin:any,release:any,district:string){
  const cacheKey=`${release.release_id}:${district}`;
  const cached=districtCache.get(cacheKey);
  if(cached&&Date.now()-cached.at<300000)return cached.payload;
  const path=`${release.storage_prefix}/district/${district}.json.gz`;
  const {data,error}=await admin.storage.from(BUCKET).download(path);
  if(error||!data)return null;
  try{
    const stream=data.stream().pipeThrough(new DecompressionStream('gzip'));
    const payload=await new Response(stream).json();
    if(payload?.source_id!==SOURCE_ID||String(payload?.district_code)!==district||!sameYears(payload?.source_years)||!payload?.records||typeof payload.records!=='object')return null;
    districtCache.set(cacheKey,{at:Date.now(),payload});
    while(districtCache.size>2){const first=districtCache.keys().next().value;if(!first)break;districtCache.delete(first)}
    return payload;
  }catch{return null}
}
function valueFor(record:any,field:string){
  const years=Array.isArray(record?.years)?record.years.map((x:any)=>Number(x)).filter((x:number)=>Number.isInteger(x)):[];
  if(field==='assessment_history_depth')return years.length;
  if(field==='assessment_land_history')return orderedYearObject(record?.land);
  if(field==='assessment_improvement_history')return orderedYearObject(record?.improvement);
  if(field==='assessment_total_history')return orderedYearObject(record?.total);
  if(field==='property_class_history')return orderedYearObject(record?.class);
  if(field==='exemption_code_history')return orderedYearObject(record?.exemptions);
  if(field==='assessment_record_years')return years.sort((a:number,b:number)=>a-b);
  return null;
}

export async function modivLongitudinalObservation(admin:any,marker:any,row:any){
  if(String(marker?.source_id||'')!==SOURCE_ID)return null;
  const field=String(marker?.field||'');
  const release=await liveRelease(admin);
  if(!release)return{value:null,status:'dependency_missing',reason:'No certified live MOD-IV longitudinal source release is available.',providerKind:'authoritative_reference',source:SOURCE_LABEL};
  const source=sourceFor(release.release_id);
  if(!SUPPORTED_FIELDS.has(field))return{value:null,status:'dependency_missing',reason:'Marker semantics are not certified by the annual MOD-IV longitudinal source contract.',providerKind:'authoritative_reference',source};
  const pin=String(row?.pams_pin||'');
  const district=pin.slice(0,4);
  const block=normComponent(row?.block),lot=normComponent(row?.lot),qualifier=normComponent(row?.qualifier);
  if(!/^\d{4}$/.test(district)||!block||!lot)return{value:null,status:'source_checked_no_value',reason:'Exact district/block/lot parcel identity is incomplete.',providerKind:'authoritative_reference',source};
  const partition=await districtPartition(admin,release,district);
  if(!partition)return{value:null,status:'provider_error',reason:'Certified MOD-IV district partition could not be read or validated.',providerKind:'authoritative_reference',source};
  const normalizedKey=`${block}|${lot}|${qualifier}`;
  const treasuryKey=`${treasuryComponent(block)}|${treasuryComponent(lot)}|${qualifier}`;
  const record=partition.records?.[normalizedKey]??partition.records?.[treasuryKey];
  if(!record)return{value:null,status:'source_checked_no_value',reason:'Exact parcel identity is absent from the certified annual MOD-IV release.',providerKind:'authoritative_reference',source};
  return{value:valueFor(record,field),status:'available',providerKind:'authoritative_reference',source};
}
