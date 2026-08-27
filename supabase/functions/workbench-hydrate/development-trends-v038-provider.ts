export const DEVELOPMENT_TRENDS_V038_PROVIDER_VERSION='nj-dca-development-trends-v038';
const RELEASE='nj-dca-development-trends-2025-08-21-v1';
const SOURCE=`NJ DCA Development Trends Viewer · as of 2025-08-21 · latest published annual data 2024 · ${RELEASE}`;
const DATA_URL='https://raw.githubusercontent.com/johnscafide/njtaxrelief/160bbf0ab65fba8a395a7adc436d8866c6ba3196/property/data/dca-development-trends-v038.json';
const CALC='watchdog-dca-development-trends-window-v1';
const TTL=6*60*60*1000;
let cached:any=null,cachedAt=0;

const PREFIX='njplus.nj-dca-development-trends.';
const latestFields=[
 'latest_annual_housing_units_authorized',
 'latest_annual_one_two_family_units_authorized',
 'latest_annual_multifamily_units_authorized',
 'latest_annual_mixed_use_units_authorized',
 'latest_annual_new_housing_units_authorized',
 'latest_annual_new_one_two_family_units_authorized',
 'latest_annual_new_multifamily_units_authorized',
 'latest_annual_new_mixed_use_units_authorized',
 'latest_annual_residential_addition_alteration_units_authorized',
 'latest_annual_construction_cost_authorized',
 'latest_annual_residential_new_construction_cost',
 'latest_annual_residential_addition_alteration_cost',
 'latest_annual_nonresidential_new_construction_cost',
 'latest_annual_nonresidential_addition_alteration_cost',
 'latest_annual_office_new_construction_square_feet',
 'latest_annual_office_addition_square_feet',
 'latest_annual_retail_new_construction_square_feet',
 'latest_annual_retail_addition_square_feet',
 'latest_annual_total_nonresidential_square_feet',
 'latest_annual_demolitions',
 'latest_annual_one_two_family_demolitions',
 'latest_annual_multifamily_demolitions',
 'latest_annual_mixed_use_demolitions',
 'latest_annual_net_housing_unit_change',
 'latest_annual_net_one_two_family_unit_change',
 'latest_annual_net_multifamily_unit_change',
 'latest_annual_net_mixed_use_unit_change'
] as const;
const historyFields=[
 'housing_units_authorized',
 'new_housing_units_authorized',
 'construction_cost_authorized',
 'total_nonresidential_square_feet',
 'demolitions',
 'net_housing_unit_change'
] as const;

type HistoryField=typeof historyFields[number];
const historyId=(f:HistoryField)=>PREFIX+f+'_history_2020_2024';
const rollingId=(f:HistoryField)=>'watchdog.njplus.rolling_5yr_'+f;
const deltaId=(f:HistoryField)=>'watchdog.njplus.latest_yoy_'+f+'_delta';
const targetIds=new Set<string>([
 PREFIX+'latest_data_year',
 ...latestFields.map(f=>PREFIX+f),
 ...historyFields.map(historyId),
 ...historyFields.map(rollingId),
 ...historyFields.map(deltaId),
]);

function district(pin:string){return String(pin||'').replace(/\D/g,'').slice(0,4)}
function summary(meta:Record<string,Record<string,any>>){
 const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};
 for(const pinMeta of Object.values(meta||{}))for(const row of Object.values(pinMeta||{})){const s=String((row as any)?.status||'');out[s]=(out[s]||0)+1}
 return out;
}
async function sourceRoot(){
 if(cached&&Date.now()-cachedAt<TTL)return cached;
 try{
  const r=await fetch(DATA_URL,{headers:{accept:'application/json'}});
  if(!r.ok)return null;
  const j=await r.json();
  if(j?.source_version!==RELEASE||j?.latest_data_year!==2024||j?.municipality_count!==564||!j?.municipalities)return null;
  cached=j;cachedAt=Date.now();return j;
 }catch{return null}
}
function historyValue(root:any,rec:any,field:HistoryField){
 const idx=(root?.series_field_order||[]).indexOf(field);
 if(idx<0||!Array.isArray(rec?.[3]?.[idx]))return null;
 const years=Array.isArray(root?.series_years)?root.series_years:[];
 const values=rec[3][idx];
 if(years.length!==values.length)return null;
 return years.map((year:any,i:number)=>({year:Number(year),value:values[i]}));
}
function sourceField(root:any,id:string){
 if(id===PREFIX+'latest_data_year')return 'LATEST DATA YEAR';
 for(const f of latestFields)if(id===PREFIX+f)return String(root?.fields?.[f]?.source_heading||f);
 for(const f of historyFields)if(id===historyId(f)||id===rollingId(f)||id===deltaId(f))return String(root?.series_fields?.[f]?.source_heading||f);
 return '';
}
function resolve(root:any,rec:any,id:string){
 if(id===PREFIX+'latest_data_year')return {value:root?.latest_data_year,kind:'authoritative_reference'};
 for(const f of latestFields){
  if(id===PREFIX+f){
   const idx=(root?.field_order||[]).indexOf(f);
   return {value:idx>=0?rec?.[2]?.[idx]:undefined,kind:'authoritative_reference'};
  }
 }
 for(const f of historyFields){
  const hist=historyValue(root,rec,f);
  if(id===historyId(f))return {value:hist,kind:'authoritative_reference'};
  if(id===rollingId(f)){
   if(!hist||hist.length!==5||hist.some((x:any)=>typeof x?.value!=='number'))return {value:undefined,kind:'derived_governed'};
   return {value:hist.reduce((s:number,x:any)=>s+x.value,0),kind:'derived_governed'};
  }
  if(id===deltaId(f)){
   if(!hist||hist.length!==5||hist.some((x:any)=>typeof x?.value!=='number'))return {value:undefined,kind:'derived_governed'};
   return {value:hist[4].value-hist[3].value,kind:'derived_governed'};
  }
 }
 return {value:undefined,kind:'authoritative_reference'};
}

export async function runWithDevelopmentTrendsV038(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
 let body:any=null;try{body=await request.clone().json()}catch{return handler(request,info)}
 const ids=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
 const targets=ids.filter((id:string)=>targetIds.has(id));if(!targets.length)return handler(request,info);
 const response=await handler(request,info);if(!response.ok)return response;
 let payload:any=null;try{payload=await response.clone().json()}catch{return response}
 const root=await sourceRoot();
 const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
 payload.markers||={};payload.meta||={};
 for(const pin of pins){
  payload.markers[pin]||={};payload.meta[pin]||={};
  const rec=root?.municipalities?.[district(pin)];
  for(const id of targets){
   if(String(payload.meta[pin]?.[id]?.status||'')==='not_entitled')continue;
   delete payload.markers[pin][id];
   const resolved=rec&&root?resolve(root,rec,id):{value:undefined,kind:id.startsWith('watchdog.')?'derived_governed':'authoritative_reference'};
   const meta:any={provider_kind:resolved.kind,source:SOURCE,scope:'municipality',provider_version:DEVELOPMENT_TRENDS_V038_PROVIDER_VERSION,source_release:RELEASE,source_field:sourceField(root,id)};
   if(resolved.kind==='derived_governed')meta.calculation_key=CALC;
   if(root&&rec&&resolved.value!==undefined&&resolved.value!==null){
    payload.markers[pin][id]=resolved.value;payload.meta[pin][id]={status:'available',...meta,observed_at:new Date().toISOString()};
   }else{
    payload.meta[pin][id]={status:root?'source_checked_no_value':'dependency_missing',...meta,reason:root?'The governed DCA annual source artifact has no usable value for this municipality/field.':'The governed DCA Development Trends v0.38 source artifact could not be loaded.',checked_at:new Date().toISOString()};
   }
  }
 }
 payload.provider_summary=summary(payload.meta);payload.provider_versions||={};payload.provider_versions.development_trends_v038=DEVELOPMENT_TRENDS_V038_PROVIDER_VERSION;
 const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','private, no-store');
 return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:h});
}
