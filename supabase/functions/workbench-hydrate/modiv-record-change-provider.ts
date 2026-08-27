export const MODIV_RECORD_CHANGE_PROVIDER_VERSION='watchdog-modiv-record-change-v1';
const TARGET='njplus.nj-dca-modiv-longitudinal.parcel_record_change_count';
const RELEASE='treasury-modiv-2021-2026-v2';
const SOURCE=`Watchdog exact consecutive-year record transition count over NJ Division of Taxation annual MOD-IV assessment lists · ${RELEASE}`;
const HISTORY_IDS=[
  'njplus.nj-dca-modiv-longitudinal.assessment_record_years',
  'njplus.nj-dca-modiv-longitudinal.assessment_land_history',
  'njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',
  'njplus.nj-dca-modiv-longitudinal.assessment_total_history',
  'njplus.nj-dca-modiv-longitudinal.property_class_history',
  'njplus.nj-dca-modiv-longitudinal.exemption_code_history',
];
const HISTORY_FIELDS=HISTORY_IDS.slice(1);

function summary(meta:Record<string,Record<string,any>>){
  const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};
  for(const pinMeta of Object.values(meta||{}))for(const row of Object.values(pinMeta||{})){const s=String((row as any)?.status||'');out[s]=(out[s]||0)+1}
  return out;
}
function stable(v:any){return JSON.stringify(v===undefined?null:v)}
function own(o:any,k:string){return !!o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k)}

function calculate(payload:any,pin:string){
  const yearsRaw=payload?.markers?.[pin]?.[HISTORY_IDS[0]];
  const years=(Array.isArray(yearsRaw)?yearsRaw:[]).map((x:any)=>Number(x)).filter((x:number)=>Number.isInteger(x)).sort((a:number,b:number)=>a-b);
  const histories=HISTORY_FIELDS.map(id=>payload?.markers?.[pin]?.[id]);
  const historyMeta=HISTORY_IDS.map(id=>payload?.meta?.[pin]?.[id]);
  if(historyMeta.some(m=>String(m?.status||'')!=='available'))return{ok:false,status:'dependency_missing',reason:'One or more certified MOD-IV longitudinal history dependencies are unavailable.'};
  if(histories.some(h=>!h||typeof h!=='object'||Array.isArray(h)))return{ok:false,status:'source_checked_no_value',reason:'Certified MOD-IV history objects are incomplete for the requested parcel.'};
  let compared=0,changes=0;
  for(let i=1;i<years.length;i++){
    const prev=years[i-1],cur=years[i];
    if(cur!==prev+1)continue;
    const py=String(prev),cy=String(cur);
    if(histories.some(h=>!own(h,py)||!own(h,cy)))return{ok:false,status:'source_checked_no_value',reason:'A retained MOD-IV field is missing for a consecutive observed-year transition.'};
    compared++;
    if(histories.some(h=>stable(h[py])!==stable(h[cy])))changes++;
  }
  if(compared===0)return{ok:false,status:'source_checked_no_value',reason:'Fewer than two consecutive certified annual MOD-IV records are available; no transition count is reported.'};
  return{ok:true,value:changes,compared,years};
}

export async function enrichModivRecordChange(request:Request,response:Response){
  if(request.method!=='POST')return response;
  let original:any=null;
  try{original=await request.clone().json()}catch{return response}
  const originalIds=[...new Set((Array.isArray(original?.marker_ids)?original.marker_ids:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
  if(!originalIds.includes(TARGET))return response;
  if(!response.ok)return response;
  return response;
}

export async function runWithModivRecordChange(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
  let body:any=null;
  try{body=await request.clone().json()}catch{return handler(request,info)}
  const originalIds=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
  if(!originalIds.includes(TARGET))return handler(request,info);
  const augmentedIds=[...new Set([...originalIds,...HISTORY_IDS])];
  const headers=new Headers(request.headers);headers.delete('content-length');
  const augmented=new Request(request.url,{method:request.method,headers,body:JSON.stringify({...body,marker_ids:augmentedIds})});
  const response=await handler(augmented,info);
  if(!response.ok)return response;
  let payload:any=null;
  try{payload=await response.clone().json()}catch{return response}
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
  payload.markers ||= {};payload.meta ||= {};
  for(const pin of pins){
    payload.markers[pin] ||= {};payload.meta[pin] ||= {};
    const prior=payload.meta[pin]?.[TARGET];
    if(String(prior?.status||'')==='not_entitled')continue;
    const result=calculate(payload,pin);
    delete payload.markers[pin][TARGET];
    if(result.ok){
      payload.markers[pin][TARGET]=result.value;
      payload.meta[pin][TARGET]={status:'available',provider_kind:'derived_governed',source:SOURCE,scope:'property',provider_version:MODIV_RECORD_CHANGE_PROVIDER_VERSION,calculation_key:MODIV_RECORD_CHANGE_PROVIDER_VERSION,source_release:RELEASE,compared_consecutive_transitions:result.compared,source_years:result.years,observed_at:new Date().toISOString()};
    }else{
      payload.meta[pin][TARGET]={status:result.status,provider_kind:'derived_governed',source:SOURCE,scope:'property',provider_version:MODIV_RECORD_CHANGE_PROVIDER_VERSION,calculation_key:MODIV_RECORD_CHANGE_PROVIDER_VERSION,source_release:RELEASE,reason:result.reason,checked_at:new Date().toISOString()};
    }
    for(const id of HISTORY_IDS){if(originalIds.includes(id))continue;delete payload.markers[pin][id];delete payload.meta[pin][id]}
  }
  payload.provider_summary=summary(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.modiv_record_change=MODIV_RECORD_CHANGE_PROVIDER_VERSION;
  const outHeaders=new Headers(response.headers);outHeaders.set('Content-Type','application/json; charset=utf-8');outHeaders.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:outHeaders});
}
