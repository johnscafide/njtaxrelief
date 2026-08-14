// Phase 4 NJDEP spatial resolver. Explicit service/layer mappings for preflight markers;
// registry source_layer remains supported for the broader NJDEP catalog.
type Spec={base:string,layer:string,distance?:number,mode?:'hit'|'count'|'value'};
const SERVICES:Record<string,string>={
 'njdep-geology-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer',
 'njdep-hydro-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',
 'njdep-land-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer',
 'njdep-csrr-gis':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer'
};
const PRE:Record<string,Spec>={
 'preflight.contaminated_site_500m':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer',layer:'0',distance:500,mode:'count'},
 'preflight.deed_notice_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental/MapServer',layer:'40',mode:'hit'},
 'preflight.cea_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer',layer:'5',mode:'hit'},
 'preflight.ust_250m':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer',layer:'9',distance:250,mode:'count'},
 'preflight.tidelands_reference_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',layer:'30',mode:'hit'},
 'preflight.highlands_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer',layer:'6',mode:'hit'},
 'preflight.pinelands_hit':{base:'https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer',layer:'7',mode:'hit'}
};
const cache=new Map<string,{at:number,v:any[]}>(),TTL=6*60*60*1000;
function norm(s:string){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function distanceFor(field:string){const m=String(field).match(/within_(\d+)(m|km)|_(\d+)m$/);if(!m)return 0;return m[3]?Number(m[3]):Number(m[1])*(m[2]==='km'?1000:1)}
function pick(attrs:any,field:string){if(!attrs)return null;const want=norm(field);for(const k of Object.keys(attrs))if(norm(k)===want)return attrs[k];for(const k of Object.keys(attrs)){const nk=norm(k);if(want&&nk.includes(want.replace(/hit$|reference$|status$|tier$|traveltime$/g,'')))return attrs[k]}return null}
async function query(spec:Spec,lat:number,lon:number){const ck=[spec.base,spec.layer,lat.toFixed(5),lon.toFixed(5),spec.distance||0].join('|'),old=cache.get(ck);if(old&&Date.now()-old.at<TTL)return old.v;const q=new URLSearchParams({f:'json',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',returnGeometry:'false',resultRecordCount:'10'});if(spec.distance){q.set('distance',String(spec.distance));q.set('units','esriSRUnit_Meter')}const c=new AbortController(),t=setTimeout(()=>c.abort(),4500);try{const r=await fetch(spec.base+'/'+spec.layer+'/query?'+q.toString(),{signal:c.signal,headers:{accept:'application/json'}});if(!r.ok)return[];const j=await r.json(),v=Array.isArray(j.features)?j.features:[];cache.set(ck,{at:Date.now(),v});return v}catch{return[]}finally{clearTimeout(t)}}
export async function njdepValue(marker:any,row:any){const lat=Number(row?.lat),lon=Number(row?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const id=String(marker?.id||''),pre=PRE[id];let spec=pre;if(!spec){const base=SERVICES[String(marker?.source_id||'')],layer=String(marker?.source_layer??'');if(!base||!layer)return null;spec={base,layer,distance:distanceFor(String(marker?.field||''))}}const fs=await query(spec,lat,lon),field=String(marker?.field||'');if(spec.mode==='count'||field.endsWith('_count')||/_(\d+)m$/.test(field))return fs.length;if(spec.mode==='hit'||/_hit$|within_/.test(field))return fs.length>0;if(!fs.length)return null;return pick(fs[0].attributes||{},field)}
export function isNjdepMarker(marker:any){return !!PRE[String(marker?.id||'')] || (!!SERVICES[String(marker?.source_id||'')]&&marker?.source_layer!=null)}
export const NJDEP_PROVIDER_VERSION='njdep-preflight-v2';
