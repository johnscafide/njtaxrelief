export const UFB_V039_PROVIDER_VERSION='nj-dca-ufb-v039';
const RELEASE='nj-dca-ufb-2025-2025-10-23-v1';
const WORKBOOK_SHA='79a59be4c4ab2669d60ebb8072aab5a5775df7025e66cb95a887e1c39ed8ccaa';
const SOURCE=`NJ DCA User Friendly Budget Database · 2025 Summary · self-reported/unaudited municipal submissions · ${RELEASE}`;
const BASE='https://raw.githubusercontent.com/johnscafide/njtaxrelief/93a3af6298f04a4dc8630822cb86b521af887aef/property/data/ufb-v039';
const PREFIX='njplus.nj-dca-ufb-2025.';
const TTL=6*60*60*1000;
let manifestCache:any=null,manifestAt=0;
const countyCache=new Map<string,{at:number,data:any}>();

function district(pin:string){return String(pin||'').replace(/\D/g,'').slice(0,4)}
function summary(meta:Record<string,Record<string,any>>){const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};for(const p of Object.values(meta||{}))for(const row of Object.values(p||{})){const s=String((row as any)?.status||'');out[s]=(out[s]||0)+1}return out}
async function getJson(url:string){try{const r=await fetch(url,{headers:{accept:'application/json'}});if(!r.ok)return null;return await r.json()}catch{return null}}
async function manifest(){if(manifestCache&&Date.now()-manifestAt<TTL)return manifestCache;const m=await getJson(BASE+'/manifest.json');if(!m||m.release!==RELEASE||m.provider_version!==UFB_V039_PROVIDER_VERSION||m.workbook_sha256!==WORKBOOK_SHA||m.field_count!==179||m.municipality_count!==564)return null;manifestCache=m;manifestAt=Date.now();return m}
async function county(code:string){const cc=code.slice(0,2),hit=countyCache.get(cc);if(hit&&Date.now()-hit.at<TTL)return hit.data;const d=await getJson(BASE+'/'+cc+'.json');if(!d||d.release!==RELEASE||d.county_code!==cc||!d.municipalities)return null;countyCache.set(cc,{at:Date.now(),data:d});return d}

export async function runWithUfbV039(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
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
   delete payload.markers[pin][id];const ix=fieldIndex.get(id)!;const fm=fieldMeta.get(id)||{};const value=rec?.[4]?.[ix];
   const quality={no_ufb_available:Boolean(rec?.[2]),significant_data_missing:Boolean(rec?.[3])};
   const meta:any={provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:UFB_V039_PROVIDER_VERSION,source_release:RELEASE,source_field:String(fm.source_field||''),source_sheet:'2025 Summary',budget_year:2025,workbook_sha256:WORKBOOK_SHA,source_quality:quality};
   if(m&&rec&&value!==undefined&&value!==null){
    payload.markers[pin][id]=value;payload.meta[pin][id]={status:'available',...meta,observed_at:new Date().toISOString()};
   }else{
    let reason='The governed NJ DCA UFB v0.39 source artifact could not be loaded.';
    if(m&&rec)reason=quality.no_ufb_available?'NJ DCA marks this municipality No UFB Available for the 2025 Summary.':quality.significant_data_missing?'NJ DCA marks significant UFB data missing and this source cell has no usable value.':'The NJ DCA 2025 Summary source cell is blank, --, or tagged No data.';
    else if(m&&!rec)reason='The governed 2025 UFB source artifact has no current-municipality record for this district.';
    payload.meta[pin][id]={status:m?'source_checked_no_value':'dependency_missing',...meta,reason,checked_at:new Date().toISOString()};
   }
  }
 }
 payload.provider_summary=summary(payload.meta);payload.provider_versions||={};payload.provider_versions.ufb_v039=UFB_V039_PROVIDER_VERSION;
 const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','private, no-store');
 return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:h});
}
