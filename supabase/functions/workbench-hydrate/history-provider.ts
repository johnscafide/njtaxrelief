import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PREFIX = 'watchdog.history.';
const VERSION = 'watchdog-history-v1';
const ELIGIBLE_PLANS = new Set(['pro_plus','teams','developer']);
const MAP: Record<string,{source:string,field:string}> = {
  'watchdog.history.watchdog_score_delta': { source:'watchdog.score', field:'score_delta' },
  'watchdog.history.watchdog_score_volatility': { source:'watchdog.score', field:'score_stddev' },
  'watchdog.history.watchdog_score_trend_30d': { source:'watchdog.score', field:'trend_points_per_30d' },
  'watchdog.history.tax_pressure_delta': { source:'watchdog.tax_pressure', field:'score_delta' },
  'watchdog.history.tax_pressure_volatility': { source:'watchdog.tax_pressure', field:'score_stddev' },
  'watchdog.history.tax_pressure_trend_30d': { source:'watchdog.tax_pressure', field:'trend_points_per_30d' },
  'watchdog.history.revaluation_risk_delta': { source:'watchdog.revaluation_risk', field:'score_delta' },
  'watchdog.history.uniformity_delta': { source:'uniformity.score', field:'score_delta' },
  'watchdog.history.observation_count': { source:'watchdog.score', field:'observation_count' },
  'watchdog.history.observation_span_days': { source:'watchdog.score', field:'observed_span_days' },
};

function clean(value: unknown){ return String(value ?? '').trim(); }
function numeric(value: unknown){ const n=Number(value); return Number.isFinite(n) ? n : null; }
function recalc(meta: Record<string,Record<string,any>>){
  const out: Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};
  for(const pinMeta of Object.values(meta||{})) for(const row of Object.values(pinMeta||{})){ const s=clean((row as any)?.status); out[s]=(out[s]||0)+1; }
  return out;
}

export async function enrichHistory(request: Request, response: Response){
  if(request.method!=='POST' || !response.ok) return response;
  let body:any; try{ body=await request.json(); }catch{return response;}
  const ids=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map(clean).filter((id:string)=>id.startsWith(PREFIX)&&MAP[id]))] as string[];
  if(!ids.length) return response;
  let payload:any; try{ payload=await response.clone().json(); }catch{return response;}
  if(!ELIGIBLE_PLANS.has(clean(payload?.plan))) return response;
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map(clean).filter(Boolean))] as string[];
  if(!pins.length) return response;

  const url=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key) return response;
  const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const sources=[...new Set(ids.map(id=>MAP[id].source))];
  const {data,error}=await supabase.from('score_history_metrics').select('pams_pin,marker_id,observation_count,first_observed_at,last_observed_at,score_delta,score_stddev,observed_span_days,trend_points_per_30d,refreshed_at').in('pams_pin',pins).in('marker_id',sources);
  const rows=new Map<string,any>();
  for(const row of data||[]) rows.set(`${clean(row.pams_pin)}|${clean(row.marker_id)}`,row);

  payload.markers ||= {}; payload.meta ||= {};
  for(const pin of pins){
    payload.markers[pin] ||= {}; payload.meta[pin] ||= {};
    for(const id of ids){
      if(clean(payload.meta?.[pin]?.[id]?.status)==='not_entitled') continue;
      const spec=MAP[id]; const row=rows.get(`${pin}|${spec.source}`);
      if(error){
        delete payload.markers[pin][id];
        payload.meta[pin][id]={status:'provider_error',provider_kind:'derived_governed',source:'Watchdog longitudinal score history',scope:'property',provider_version:VERSION,reason:'Longitudinal history metric lookup failed.'};
        continue;
      }
      if(!row || Number(row.observation_count||0)<2){
        delete payload.markers[pin][id];
        payload.meta[pin][id]={status:'dependency_missing',provider_kind:'derived_governed',source:'Watchdog longitudinal score history',scope:'property',provider_version:VERSION,reason:'At least two trusted observations are required.'};
        continue;
      }
      const value=spec.field==='observation_count' ? Number(row.observation_count) : numeric(row[spec.field]);
      if(value===null){
        delete payload.markers[pin][id];
        payload.meta[pin][id]={status:'dependency_missing',provider_kind:'derived_governed',source:'Watchdog longitudinal score history',scope:'property',provider_version:VERSION,reason:`Required history field ${spec.field} is unavailable.`};
        continue;
      }
      payload.markers[pin][id]=value;
      payload.meta[pin][id]={status:'available',provider_kind:'derived_governed',source:'Watchdog longitudinal score history',scope:'property',provider_version:VERSION,source_marker:spec.source,observation_count:Number(row.observation_count),first_observed_at:row.first_observed_at,last_observed_at:row.last_observed_at,observed_at:row.refreshed_at||row.last_observed_at,interpretation:id.endsWith('_trend_30d')?'Observed rate normalized to 30 days; not a forecast.':'Observed longitudinal statistic; unavailable without at least two trusted observations.'};
    }
  }
  payload.provider_summary=recalc(payload.meta);
  payload.provider_versions ||= {}; payload.provider_versions.history=VERSION;
  const headers=new Headers(response.headers); headers.set('Content-Type','application/json; charset=utf-8'); headers.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
