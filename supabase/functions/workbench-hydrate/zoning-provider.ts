// Governed NJ DCA Municipal Zoning directory resolver.
// This provider exposes only directory links published by DCA. It does not infer zoning,
// permitted use, entitlement status, or document currentness.

type ZoningObservation={
  status:'available'|'source_checked_no_value'|'dependency_missing'|'provider_error'|'provider_missing';
  value:any;
  reason?:string;
  source?:string;
};

type QueryResult={ok:boolean;features:any[];error?:string};

const SERVICE='https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/Municipal_Zoning/FeatureServer/0';
const SOURCE='NJ DCA Municipal Zoning Feature Service · directory known to DCA as of 2026-03-23';
const FIELD_MAP:Record<string,string>={
  zoning_map_url:'Map',
  zoning_ordinance_url:'Ordinance',
  municipal_zoning_portal:'Website',
};
const CACHE_TTL=6*60*60*1000;
const cache=new Map<string,{at:number;features:any[]}>();

async function query(lat:number,lon:number):Promise<QueryResult>{
  const key=lat.toFixed(5)+'|'+lon.toFixed(5);
  const old=cache.get(key);
  if(old&&Date.now()-old.at<CACHE_TTL)return{ok:true,features:old.features};
  const q=new URLSearchParams({
    f:'json',
    where:'1=1',
    geometry:lon+','+lat,
    geometryType:'esriGeometryPoint',
    inSR:'4326',
    spatialRel:'esriSpatialRelIntersects',
    outFields:'Map,Ordinance,Website,Muni,Municipali,County_1',
    returnGeometry:'false',
    resultRecordCount:'2',
  });
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4500);
  try{
    const response=await fetch(SERVICE+'/query?'+q.toString(),{signal:controller.signal,headers:{accept:'application/json'}});
    if(!response.ok)return{ok:false,features:[],error:'provider_http_'+response.status};
    const json=await response.json();
    if(json?.error)return{ok:false,features:[],error:'provider_arcgis_error'};
    const features=Array.isArray(json?.features)?json.features:[];
    cache.set(key,{at:Date.now(),features});
    return{ok:true,features};
  }catch(error){
    return{ok:false,features:[],error:error instanceof DOMException&&error.name==='AbortError'?'provider_timeout':'provider_unavailable'};
  }finally{
    clearTimeout(timer);
  }
}

export function isZoningDirectoryMarker(marker:any){
  return String(marker?.source_id||'')==='nj-dca-zoning-directory' && !!FIELD_MAP[String(marker?.field||'')];
}

export async function zoningDirectoryObservation(marker:any,row:any):Promise<ZoningObservation>{
  const field=String(marker?.field||'');
  const sourceField=FIELD_MAP[field];
  if(!sourceField)return{status:'provider_missing',value:null,reason:'zoning_directory_field_not_mapped',source:SOURCE};
  const lat=Number(row?.lat),lon=Number(row?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return{status:'dependency_missing',value:null,reason:'parcel_coordinates_unavailable',source:SOURCE};
  const result=await query(lat,lon);
  if(!result.ok)return{status:'provider_error',value:null,reason:result.error||'zoning_directory_provider_error',source:SOURCE};
  if(!result.features.length)return{status:'source_checked_no_value',value:null,reason:'municipality_not_resolved',source:SOURCE};
  const attrs=result.features[0]?.attributes||{};
  const value=attrs[sourceField];
  if(value===null||value===undefined||String(value).trim()==='')return{status:'source_checked_no_value',value:null,reason:'directory_field_unpublished',source:SOURCE};
  return{status:'available',value:String(value).trim(),source:SOURCE};
}

export const DCA_ZONING_PROVIDER_VERSION='nj-dca-zoning-directory-v1-20260323';
