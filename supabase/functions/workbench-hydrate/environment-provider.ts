// Phase 4 governed spatial preflight resolver.
// NJDEP layers use explicit service/layer mappings; FEMA NFHL is kept as a separate authoritative service.
type Spec={base:string,layer:string,distance?:number,mode?:'hit'|'count'|'value'|'fema'};
type QueryResult={ok:boolean,features:any[],error?:string};
export type SpatialObservation={status:'available'|'source_checked_no_value'|'dependency_missing'|'provider_error'|'provider_missing',value:any,reason?:string};
const SERVICES:Record<string,string>={
 'njdep-geology-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer',
 'njdep-hydro-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',
 'njdep-land-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer',
 'njdep-csrr-gis':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer'
};
const FEMA_NFHL='https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
const PRE:Record<string,Spec>={
 'preflight.contaminated_site_500m':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer',layer:'0',distance:500,mode:'count'},
 'preflight.deed_notice_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental/MapServer',layer:'40',mode:'hit'},
 'preflight.cea_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer',layer:'5',mode:'hit'},
 'preflight.ust_250m':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer',layer:'9',distance:250,mode:'count'},
 'preflight.tidelands_reference_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',layer:'30',mode:'hit'},
 'preflight.highlands_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer',layer:'6',mode:'hit'},
 'preflight.pinelands_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer',layer:'7',mode:'hit'},
 'preflight.fema_flood_zone':{base:FEMA_NFHL,layer:'28',mode:'fema'},
 'preflight.tidal_cafe_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',layer:'48',mode:'hit'},
 'preflight.wetlands_2012_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land_lu/MapServer',layer:'2',mode:'hit'},
 'preflight.epa_priority_wetland_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer',layer:'79',mode:'hit'}
};
const cache=new Map<string,{at:number,v:any[]}>(),TTL=6*60*60*1000;
function norm(s:string){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function distanceFor(field:string){const m=String(field).match(/within_(\d+)(m|km)|_(\d+)m$/);if(!m)return 0;return m[3]?Number(m[3]):Number(m[1])*(m[2]==='km'?1000:1)}
function pick(attrs:any,field:string){if(!attrs)return null;const want=norm(field);for(const k of Object.keys(attrs))if(norm(k)===want)return attrs[k];for(const k of Object.keys(attrs)){const nk=norm(k);if(want&&nk.includes(want.replace(/hit$|reference$|status$|tier$|traveltime$/g,'')))return attrs[k]}return null}
async function query(spec:Spec,lat:number,lon:number):Promise<QueryResult>{const ck=[spec.base,spec.layer,lat.toFixed(5),lon.toFixed(5),spec.distance||0].join('|'),old=cache.get(ck);if(old&&Date.now()-old.at<TTL)return{ok:true,features:old.v};const q=new URLSearchParams({f:'json',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',returnGeometry:'false',resultRecordCount:'10'});if(spec.distance){q.set('distance',String(spec.distance));q.set('units','esriSRUnit_Meter')}const c=new AbortController(),t=setTimeout(()=>c.abort(),4500);try{const r=await fetch(spec.base+'/'+spec.layer+'/query?'+q.toString(),{signal:c.signal,headers:{accept:'application/json'}});if(!r.ok)return{ok:false,features:[],error:'provider_http_'+r.status};const j=await r.json();if(j?.error)return{ok:false,features:[],error:'provider_arcgis_error'};const v=Array.isArray(j.features)?j.features:[];cache.set(ck,{at:Date.now(),v});return{ok:true,features:v}}catch(e){return{ok:false,features:[],error:e instanceof DOMException&&e.name==='AbortError'?'provider_timeout':'provider_unavailable'}}finally{clearTimeout(t)}}
function femaValue(fs:any[]){if(!fs.length)return null;const a=fs[0]?.attributes||{};const zone=String(a.FLD_ZONE||'').trim(),sub=String(a.ZONE_SUBTY||'').trim();if(zone&&sub&&sub.toLowerCase()!=='null')return zone+' · '+sub;if(zone)return zone;if(sub&&sub.toLowerCase()!=='null')return sub;return 'Mapped NFHL flood hazard'}
export async function njdepObservation(marker:any,row:any):Promise<SpatialObservation>{const lat=Number(row?.lat),lon=Number(row?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return{status:'dependency_missing',value:null,reason:'parcel_coordinates_unavailable'};const id=String(marker?.id||''),pre=PRE[id];let spec=pre;if(!spec){const base=SERVICES[String(marker?.source_id||'')],layer=String(marker?.source_layer??'');if(!base||!layer)return{status:'provider_missing',value:null,reason:'spatial_provider_mapping_missing'};spec={base,layer,distance:distanceFor(String(marker?.field||''))}}const result=await query(spec,lat,lon);if(!result.ok)return{status:'provider_error',value:null,reason:result.error||'spatial_provider_error'};const fs=result.features,field=String(marker?.field||'');if(spec.mode==='fema'){const v=femaValue(fs);return v==null?{status:'source_checked_no_value',value:null}:{status:'available',value:v}}if(spec.mode==='count'||field.endsWith('_count')||/_(\d+)m$/.test(field))return{status:'available',value:fs.length};if(spec.mode==='hit'||/_hit$|within_/.test(field))return{status:'available',value:fs.length>0};if(!fs.length)return{status:'source_checked_no_value',value:null};const v=pick(fs[0].attributes||{},field);return v===null||v===undefined||v===''?{status:'source_checked_no_value',value:null}:{status:'available',value:v}}
export async function njdepValue(marker:any,row:any){const result=await njdepObservation(marker,row);return result.status==='available'?result.value:null}
export function isNjdepMarker(marker:any){return !!PRE[String(marker?.id||'')] || (!!SERVICES[String(marker?.source_id||'')]&&marker?.source_layer!=null)}
export const NJDEP_PROVIDER_VERSION='spatial-preflight-v6-evidence-states';
