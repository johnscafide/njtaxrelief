// Governed NJ DCA Municipal Zoning directory resolver.
// This provider exposes only directory links, zoning-office contacts, and directory listing
// status published by DCA. It does not infer zoning, permitted use, board identity,
// entitlement status, plan availability, or document currentness.
import { ZONING_CONTACTS_01_07 } from './zoning-contact-data-01-07.ts';
import { ZONING_CONTACTS_08_14 } from './zoning-contact-data-08-14.ts';
import { ZONING_CONTACTS_15_21 } from './zoning-contact-data-15-21.ts';

type ZoningObservation={
  status:'available'|'source_checked_no_value'|'dependency_missing'|'provider_error'|'provider_missing';
  value:any;
  reason?:string;
  source?:string;
};

type QueryResult={ok:boolean;features:any[];error?:string};
type ContactTuple=[string|null,string|null];

const SERVICE='https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/Municipal_Zoning/FeatureServer/0';
const SPATIAL_SOURCE='NJ DCA Municipal Zoning Feature Service · directory known to DCA as of 2026-03-23';
const DIRECTORY_SOURCE='NJ DCA Zoning Information Directory workbook · source last modified 2026-03-17';
const FIELD_MAP:Record<string,string>={
  zoning_map_url:'Map',
  zoning_ordinance_url:'Ordinance',
  municipal_zoning_portal:'Website',
};
const DIRECTORY_FIELDS=new Set(['zoning_officer_contact','zoning_directory_status']);
const CONTACTS:Record<string,ContactTuple>={
  ...(ZONING_CONTACTS_01_07 as Record<string,ContactTuple>),
  ...(ZONING_CONTACTS_08_14 as Record<string,ContactTuple>),
  ...(ZONING_CONTACTS_15_21 as Record<string,ContactTuple>),
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

function districtCode(row:any):string|null{
  const pin=String(row?.pams_pin||'').trim();
  const fromPin=pin.match(/^(\d{4})/);
  if(fromPin)return fromPin[1];
  const raw=String(row?.cd_code||row?.district_code||'').replace(/\D/g,'');
  return raw.length>=4?raw.slice(0,4):null;
}

function directoryObservation(field:string,row:any):ZoningObservation{
  const district=districtCode(row);
  if(!district)return{status:'dependency_missing',value:null,reason:'municipality_code_unavailable',source:DIRECTORY_SOURCE};
  const contact=CONTACTS[district];
  if(!contact)return{status:'source_checked_no_value',value:null,reason:'municipality_not_listed_in_governed_directory_snapshot',source:DIRECTORY_SOURCE};
  if(field==='zoning_directory_status')return{status:'available',value:'listed',source:DIRECTORY_SOURCE};
  if(field==='zoning_officer_contact'){
    const [phone,emailOrContactPage]=contact;
    if(!phone&&!emailOrContactPage)return{status:'source_checked_no_value',value:null,reason:'zoning_office_contact_unpublished',source:DIRECTORY_SOURCE};
    return{status:'available',value:{phone:phone||null,email_or_contact_page:emailOrContactPage||null},source:DIRECTORY_SOURCE};
  }
  return{status:'provider_missing',value:null,reason:'zoning_directory_field_not_mapped',source:DIRECTORY_SOURCE};
}

export function isZoningDirectoryMarker(marker:any){
  if(String(marker?.source_id||'')!=='nj-dca-zoning-directory')return false;
  const field=String(marker?.field||'');
  return !!FIELD_MAP[field]||DIRECTORY_FIELDS.has(field);
}

export async function zoningDirectoryObservation(marker:any,row:any):Promise<ZoningObservation>{
  const field=String(marker?.field||'');
  if(DIRECTORY_FIELDS.has(field))return directoryObservation(field,row);
  const sourceField=FIELD_MAP[field];
  if(!sourceField)return{status:'provider_missing',value:null,reason:'zoning_directory_field_not_mapped',source:SPATIAL_SOURCE};
  const lat=Number(row?.lat),lon=Number(row?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return{status:'dependency_missing',value:null,reason:'parcel_coordinates_unavailable',source:SPATIAL_SOURCE};
  const result=await query(lat,lon);
  if(!result.ok)return{status:'provider_error',value:null,reason:result.error||'zoning_directory_provider_error',source:SPATIAL_SOURCE};
  if(!result.features.length)return{status:'source_checked_no_value',value:null,reason:'municipality_not_resolved',source:SPATIAL_SOURCE};
  const attrs=result.features[0]?.attributes||{};
  const value=attrs[sourceField];
  if(value===null||value===undefined||String(value).trim()==='')return{status:'source_checked_no_value',value:null,reason:'directory_field_unpublished',source:SPATIAL_SOURCE};
  return{status:'available',value:String(value).trim(),source:SPATIAL_SOURCE};
}

export const DCA_ZONING_PROVIDER_VERSION='nj-dca-zoning-directory-v2-20260317-contact-status';
