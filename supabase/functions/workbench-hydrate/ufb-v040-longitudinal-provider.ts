export const UFB_V040_PROVIDER_VERSION='nj-dca-ufb-v040-longitudinal';
const RELEASE='nj-dca-ufb-2015-2025-v1';
const WORKBOOK_SHA='79a59be4c4ab2669d60ebb8072aab5a5775df7025e66cb95a887e1c39ed8ccaa';
const SOURCE=`NJ DCA User Friendly Budget Database · annual Summary sheets 2015-2025 · self-reported/unaudited municipal submissions · ${RELEASE}`;
const BASE='https://raw.githubusercontent.com/johnscafide/njtaxrelief/abee4a42403d0b9532aed8bdaa5dd216157775fa/property/data/ufb-v040';
const PREFIX='njplus.nj-dca-ufb-longitudinal.';
const TTL=6*60*60*1000;
let manifestCache:any=null,manifestAt=0;
const countyCache=new Map<string,{at:number,data:any}>();

function district(pin:string){return String(pin||'').replace(/\D/g,'').slice(0,4)}
function summary(meta:Record<string,Record<string,any>>){const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};for(const p of Object.values(meta||{}))for(const row of Object.values(p||{})){const s=String((row as any)?.status||'');out[s]=(out[s]||0)+1}return out}
async function getJson(url:string){try{const r=await fetch(url,{headers:{accept:'application/json'}});if(!r.ok)return null;return await r.json()}catch{return null}}
async function manifest(){if(manifestCache&&Date.now()-manifestAt<TTL)return manifestCache;const m=await getJson(BASE+'/manifest.json');if(!m||m.release!==RELEASE||m.provider_version!==UFB_V040_PROVIDER_VERSION||m.workbook_sha256!==WORKBOOK_SHA||m.field_count!==130||m.municipality_count!==564)return null;manifestCache=m;manifestAt=Date.now();return m}
async function county(code:string){const cc=code.slice(0,2),hit=countyCache.get(cc);if(hit&&Date.now()-hit.at<TTL)return hit.data;const d=await getJson(BASE+'/'+cc+'.json');if(!d||d.release!==RELEASE||d.county_code!==cc||!d.municipalities)return null;countyCache.set(cc,{at:Date.now(),data:d});return d}
function historyObject(raw:any){if(!Array.isArray(raw)||!raw.length)return null;const out:Record<string,any>={};for(const row of raw){if(Array.isArray(row)&&row.length>=2&&Number.isFinite(Number(row[0]))&&row[1]!==null&&row[1]!==undefined)out[String(row[0])]=row[1]}return Object.keys(out).length?out:null}

export async function runWithUfbV040Longitudinal(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
 let body:any=null;try{body=await request.clone().json()}catch{return handler(request,info)}
 const ids=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
 if(!ids.some((id:string)=>id.startsWith(PREFIX)))return handler(request,info);
 const response=await handler(request,info);if(!response.ok)return response;
 let payload:any=null;try{payload=await response.clone().json()}catch{return response}
 const m=await manifest();const fieldIndex=new Map<string,number>();const fieldMeta=new Map<string,any>();
 for(let i=0;i<(m?.fields||[]).length;i++){const f=m.fields[i];fieldIndex.set(String(f.marker_id||''),i);fieldMeta.set(String(f.marker_id||''),f)}
 const targets=ids.filter((id:string)=>fieldIndex.has(id));if(!targets.length)return response;
 const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
 payload.markers||={};payload.meta||={};
 const countyByCode=new Map<string,any>();
 for(const pin of pins){const code=district(pin);if(code.length===4&&!countyByCode.has(code.slice(0,2)))countyByCode.set(code.slice(0,2),m?await county(code):null)}
 for(const pin of pins){
  payload.markers[pin]||={};payload.meta[pin]||={};const code=district(pin),c=countyByCode.get(code.slice(0,2)),rec=c?.municipalities?.[code];
  for(const id of targets){
   if(String(payload.meta[pin]?.[id]?.status||'')==='not_entitled')continue;
   delete payload.markers[pin][id];const ix=fieldIndex.get(id)!;const fm=fieldMeta.get(id)||{};const rawHistory=rec?.[3]?.[ix];const value=historyObject(rawHistory);
   const qualityByYear=Array.isArray(rec?.[2])?rec[2].map((q:any)=>({year:Number(q?.[0]),no_ufb_available:Boolean(q?.[1]),significant_data_missing:Boolean(q?.[2])})):[];
   const meta:any={provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:UFB_V040_PROVIDER_VERSION,source_release:RELEASE,source_field:String(fm.source_field||''),source_sheets:m?.source_sheets||[],observation_years:m?.observation_years||[],observation_year_semantics:m?.observation_year_semantics||null,workbook_sha256:WORKBOOK_SHA,source_quality_by_year:qualityByYear,missing_years_synthesized:false,history_contract:'actual_source_observations_only'};
   if(m&&rec&&value){payload.markers[pin][id]=value;payload.meta[pin][id]={status:'available',...meta,observed_at:new Date().toISOString()};}
   else{
    let reason='The governed NJ DCA UFB v0.40 longitudinal source artifact could not be loaded.';
    if(m&&rec)reason='No usable published annual Summary-sheet observations exist for this municipality and field in the governed 2015-2025 history; missing years were not synthesized.';
    else if(m&&!rec)reason='The governed UFB longitudinal source artifact has no current-municipality record for this district.';
    payload.meta[pin][id]={status:m?'source_checked_no_value':'dependency_missing',...meta,reason,checked_at:new Date().toISOString()};
   }
  }
 }
 payload.provider_summary=summary(payload.meta);payload.provider_versions||={};payload.provider_versions.ufb_v040_longitudinal=UFB_V040_PROVIDER_VERSION;
 const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','private, no-store');
 return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:h});
}
