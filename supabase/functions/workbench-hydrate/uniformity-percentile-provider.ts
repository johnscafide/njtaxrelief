export const UNIFORMITY_PERCENTILE_PROVIDER_VERSION='watchdog-uniformity-percentile-v1';
const ID='uniformity.percentile';
const SOURCE='Watchdog statewide percentile of governed Assessment Uniformity Score over NJ Division of Taxation COD artifact';
export async function runWithUniformityPercentile(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
 let body:any=null;try{body=await request.clone().json()}catch{return handler(request,info)}
 const ids=(Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:any)=>String(x||''));if(!ids.includes(ID))return handler(request,info);
 const response=await handler(request,info);if(!response.ok)return response;let payload:any;try{payload=await response.clone().json()}catch{return response}
 for(const [pin,values] of Object.entries(payload?.markers||{})){const v=(values as any)?.[ID],m=payload?.meta?.[pin]?.[ID];if(v!==null&&v!==undefined&&m?.status==='available'){payload.meta[pin][ID]={...m,provider_kind:'derived_governed',source:SOURCE,provider_version:UNIFORMITY_PERCENTILE_PROVIDER_VERSION,formula:'Statewide percentile rank of the governed Assessment Uniformity Score as published in the canonical Watchdog uniformity artifact',percentile_scope:'New Jersey districts with a governed uniformity score'};}}
 payload.provider_versions||={};payload.provider_versions.uniformity_percentile=UNIFORMITY_PERCENTILE_PROVIDER_VERSION;const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','private, no-store');return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:h});
}
