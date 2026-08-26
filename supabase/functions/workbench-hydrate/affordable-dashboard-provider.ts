const DATA_URL='https://www.watchdogindex.com/property/data/affordable-dashboard-supplement.json';
const PREFIX='njplus.nj-dca-affordable-housing.';
const VERSION='nj-dca-affordable-dashboard-2026-v1';
const SOURCE=`NJ DCA Affordable Housing Reporting Dashboard · February 2026 · ${VERSION}`;
const ELIGIBLE=new Set(['pro_plus','teams','developer']);
const FIELDS=new Set(['hud_subsidized_units','low_income_cost_burden']);
const TTL=6*60*60*1000;
let cache:any=null, cacheAt=0;

function clean(v:unknown){return String(v??'').trim()}
function treasuryCode(pin:unknown){return clean(pin).replace(/\D/g,'').slice(0,4)}
function providerSummary(meta:Record<string,Record<string,any>>){
  const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};
  for(const p of Object.values(meta||{}))for(const row of Object.values(p||{})){const s=clean((row as any)?.status);out[s]=(out[s]||0)+1}
  return out;
}
async function loadData(){
  if(cache&&Date.now()-cacheAt<TTL)return cache;
  try{
    const r=await fetch(DATA_URL,{headers:{accept:'application/json'}});if(!r.ok)return null;
    const j=await r.json();if(!j?.municipalities||String(j?.reporting_period||'')!=='February 2026')return null;
    cache=j;cacheAt=Date.now();return j;
  }catch{return null}
}

export async function enrichAffordableDashboard(request:Request,response:Response){
  if(request.method!=='POST'||!response.ok)return response;
  let body:any;try{body=await request.json()}catch{return response}
  const ids=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map(clean).filter((id:string)=>id.startsWith(PREFIX)&&FIELDS.has(id.slice(PREFIX.length))))] as string[];
  if(!ids.length)return response;
  let payload:any;try{payload=await response.clone().json()}catch{return response}
  if(!ELIGIBLE.has(clean(payload?.plan)))return response;
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map(clean).filter(Boolean))] as string[];
  if(!pins.length)return response;
  const root=await loadData();payload.markers||={};payload.meta||={};
  for(const pin of pins){
    payload.markers[pin]||={};payload.meta[pin]||={};
    const code=treasuryCode(pin), rec=/^\d{4}$/.test(code)?root?.municipalities?.[code]:null;
    for(const id of ids){
      if(clean(payload.meta?.[pin]?.[id]?.status)==='not_entitled')continue;
      const field=id.slice(PREFIX.length);
      if(!root){delete payload.markers[pin][id];payload.meta[pin][id]={status:'provider_error',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'Governed affordable-dashboard supplement could not be loaded.'};continue}
      if(!rec){delete payload.markers[pin][id];payload.meta[pin][id]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'No matching municipality row is available in the governed dashboard export.'};continue}
      const value=rec?.[field];
      if(value===null||value===undefined||value===''){delete payload.markers[pin][id];payload.meta[pin][id]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'The dashboard export was checked but the requested value is unavailable.'};continue}
      payload.markers[pin][id]=value;
      payload.meta[pin][id]={status:'available',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,observed_at:root?.generated_at,interpretation:field==='hud_subsidized_units'?'Municipality HUD-subsidized-unit value from the official DCA Affordable Housing Dashboard export.':'Municipality LMI cost-burden value from the official DCA Affordable Housing Dashboard export; not the broader all-household cost-burden metric.'};
    }
  }
  payload.provider_summary=providerSummary(payload.meta);payload.provider_versions||={};payload.provider_versions.affordable_dashboard=VERSION;
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
