// Parcel-grounded NJDEP Site Remediation / CSRR provider.
// Uses the official SRP Preferred ID layer's COMU_CODE + PARCELS fields.
// No point-distance matching is used for parcel facts.

type CsrrObservation={
  status:'available'|'source_checked_no_value'|'dependency_missing'|'provider_error'|'provider_missing';
  value:any;
  reason?:string;
  source?:string;
};

type QueryResult={ok:boolean;features:any[];error?:string};

const LAYER='https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer/24';
const SOURCE='NJDEP CSRR SRP Preferred ID · exact COMU_CODE + PARCELS match';
const CACHE_TTL=30*60*1000;
const VINTAGE_TTL=6*60*60*1000;
const cache=new Map<string,{at:number;features:any[]}>();
let vintageCache:{at:number;value:string|null}|null=null;

const FIELDS=new Set([
  'kcsl_case_status',
  'kcsl_program_interest',
  'kcsl_site_id',
  'environmental_layer_vintage',
]);

function cleanPart(v:any){return String(v??'').trim().toUpperCase().replace(/\s+/g,'')}
function districtFrom(row:any){const pin=String(row?.pams_pin||'').replace(/\D/g,'');return pin.length>=4?pin.slice(0,4):cleanPart(row?.cd_code).replace(/\D/g,'').slice(0,4)}
function parcelToken(row:any){const block=cleanPart(row?.block),lot=cleanPart(row?.lot);return block&&lot?`${block}-${lot}`:''}
function sql(v:string){return v.replace(/'/g,"''")}
function tokens(v:any){return String(v??'').split(';').map(cleanPart).filter(Boolean)}
function uniq(values:any[]){const seen=new Set<string>(),out:any[]=[];for(const value of values){if(value===null||value===undefined||value==='')continue;const key=typeof value==='string'?value.trim():String(value);if(!key||seen.has(key))continue;seen.add(key);out.push(typeof value==='string'?value.trim():value)}return out}
function scalarOrList(values:any[]){const v=uniq(values);if(!v.length)return null;return v.length===1?v[0]:v}

async function queryParcel(district:string,target:string):Promise<QueryResult>{
  const ck=district+'|'+target,old=cache.get(ck);
  if(old&&Date.now()-old.at<CACHE_TTL)return{ok:true,features:old.features};
  const where=`COMU_CODE='${sql(district)}' AND PARCELS LIKE '%${sql(target)}%'`;
  const q=new URLSearchParams({
    f:'json',where,
    outFields:'PREFERRED_ID,SITE_ID,CASE_STATUS,KCSL,COMU_CODE,PARCELS,DATALOAD_DATE',
    returnGeometry:'false',resultRecordCount:'2000'
  });
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),5000);
  try{
    const r=await fetch(LAYER+'/query?'+q.toString(),{signal:c.signal,headers:{accept:'application/json'}});
    if(!r.ok)return{ok:false,features:[],error:'provider_http_'+r.status};
    const j=await r.json();if(j?.error)return{ok:false,features:[],error:'provider_arcgis_error'};
    const exact=(Array.isArray(j?.features)?j.features:[]).filter((feature:any)=>tokens(feature?.attributes?.PARCELS).includes(target));
    cache.set(ck,{at:Date.now(),features:exact});
    return{ok:true,features:exact};
  }catch(error){
    return{ok:false,features:[],error:error instanceof DOMException&&error.name==='AbortError'?'provider_timeout':'provider_unavailable'};
  }finally{clearTimeout(timer)}
}

async function sourceVintage():Promise<{ok:boolean;value:string|null;error?:string}>{
  if(vintageCache&&Date.now()-vintageCache.at<VINTAGE_TTL)return{ok:true,value:vintageCache.value};
  const stats=JSON.stringify([{statisticType:'max',onStatisticField:'DATALOAD_DATE',outStatisticFieldName:'max_dataload'}]);
  const q=new URLSearchParams({f:'json',where:'1=1',outStatistics:stats,returnGeometry:'false'});
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),5000);
  try{
    const r=await fetch(LAYER+'/query?'+q.toString(),{signal:c.signal,headers:{accept:'application/json'}});
    if(!r.ok)return{ok:false,value:null,error:'provider_http_'+r.status};
    const j=await r.json();if(j?.error)return{ok:false,value:null,error:'provider_arcgis_error'};
    const raw=j?.features?.[0]?.attributes?.max_dataload;
    const ms=Number(raw),value=Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():null;
    vintageCache={at:Date.now(),value};return{ok:true,value};
  }catch(error){
    return{ok:false,value:null,error:error instanceof DOMException&&error.name==='AbortError'?'provider_timeout':'provider_unavailable'};
  }finally{clearTimeout(timer)}
}

export function isCsrrMarker(marker:any){return String(marker?.source_id||'')==='njdep-csrr-gis'&&FIELDS.has(String(marker?.field||''))}

export async function csrrObservation(marker:any,row:any):Promise<CsrrObservation>{
  const field=String(marker?.field||'');
  if(!FIELDS.has(field))return{status:'provider_missing',value:null,reason:'csrr_field_not_mapped',source:SOURCE};
  if(field==='environmental_layer_vintage'){
    const v=await sourceVintage();
    if(!v.ok)return{status:'provider_error',value:null,reason:v.error||'provider_error',source:SOURCE};
    return v.value?{status:'available',value:v.value,source:SOURCE}:{status:'source_checked_no_value',value:null,reason:'dataload_vintage_unpublished',source:SOURCE};
  }
  const qualifier=cleanPart(row?.qualifier);
  if(qualifier)return{status:'dependency_missing',value:null,reason:'source_parcel_field_not_unit_qualified',source:SOURCE};
  const district=districtFrom(row),target=parcelToken(row);
  if(!/^\d{4}$/.test(district)||!target)return{status:'dependency_missing',value:null,reason:'parcel_key_unavailable',source:SOURCE};
  const result=await queryParcel(district,target);
  if(!result.ok)return{status:'provider_error',value:null,reason:result.error||'provider_error',source:SOURCE};
  const kcsl=result.features.filter((feature:any)=>String(feature?.attributes?.KCSL??'').trim()!=='');
  if(!kcsl.length)return{status:'source_checked_no_value',value:null,reason:'no_exact_kcsl_parcel_record',source:SOURCE};
  let value:any=null;
  if(field==='kcsl_case_status')value=scalarOrList(kcsl.map((f:any)=>f?.attributes?.CASE_STATUS));
  else if(field==='kcsl_program_interest')value=scalarOrList(kcsl.map((f:any)=>f?.attributes?.PREFERRED_ID));
  else if(field==='kcsl_site_id')value=scalarOrList(kcsl.map((f:any)=>f?.attributes?.SITE_ID));
  return value===null?{status:'source_checked_no_value',value:null,reason:'exact_kcsl_field_unpublished',source:SOURCE}:{status:'available',value,source:SOURCE};
}

export const CSRR_PROVIDER_VERSION='njdep-csrr-parcel-v1';
