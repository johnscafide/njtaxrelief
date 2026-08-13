// NJW-142 — generic NJDEP ArcGIS resolver for registry markers carrying source_layer.
// Uses parcel centroid from workbench-hydrate; observed GIS facts only, no person-level inference.
const SERVICES:Record<string,string>={
  'njdep-geology-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer',
  'njdep-hydro-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',
  'njdep-land-live':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer',
  'njdep-csrr-gis':'https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer'
};
const cache=new Map<string,{at:number,v:any}>();
const TTL=6*60*60*1000;
function norm(s:string){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function distanceFor(field:string){const m=String(field).match(/within_(\d+)(m|km)/);if(!m)return 0;return Number(m[1])*(m[2]==='km'?1000:1)}
function pick(attrs:any,field:string){if(!attrs)return null;const keys=Object.keys(attrs),want=norm(field);for(const k of keys)if(norm(k)===want)return attrs[k];const words=want.replace(/hit$|reference$|status$|tier$|traveltime$/g,'');for(const k of keys){const nk=norm(k);if(words&&nk.includes(words))return attrs[k]}const banned=/^(objectid|fid|shape|globalid|created|creator|edited|editor)/i;for(const k of keys)if(!banned.test(k)&&attrs[k]!=null&&attrs[k]!=='')return attrs[k];return null}
export async function njdepValue(marker:any,row:any){
  const src=String(marker?.source_id||''),base=SERVICES[src],layer=String(marker?.source_layer??'');
  const lat=Number(row?.lat),lon=Number(row?.lon),field=String(marker?.field||'');
  if(!base||!layer||!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const d=distanceFor(field),ck=[src,layer,lat.toFixed(5),lon.toFixed(5),d].join('|'),old=cache.get(ck);
  let features:any[]=[];
  if(old&&Date.now()-old.at<TTL)features=old.v;else{
    const q=new URLSearchParams({f:'json',where:'1=1',geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',returnGeometry:'false',resultRecordCount:'5'});
    if(d){q.set('distance',String(d));q.set('units','esriSRUnit_Meter')}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
    try{const r=await fetch(base+'/'+encodeURIComponent(layer)+'/query?'+q.toString(),{signal:controller.signal,headers:{accept:'application/json'}});if(!r.ok)return null;const j=await r.json();features=Array.isArray(j.features)?j.features:[];cache.set(ck,{at:Date.now(),v:features});}catch{return null}finally{clearTimeout(timer)}
  }
  if(/(_hit|_within_|within_|_count$)/.test(field))return field.endsWith('_count')?features.length:features.length>0;
  if(!features.length)return null;
  return pick(features[0].attributes||{},field);
}
export function isNjdepMarker(marker:any){return !!SERVICES[String(marker?.source_id||'')] && marker?.source_layer!=null}
export const NJDEP_PROVIDER_VERSION='njdep-live-v1';