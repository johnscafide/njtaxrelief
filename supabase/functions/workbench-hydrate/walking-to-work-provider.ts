const DATA_URL='https://raw.githubusercontent.com/johnscafide/njtaxrelief/657ca89bea23915f832be1c1c7a39273d25afc6a/property/data/neighborhood-trends.json';
const MARKER_ID='njplus.nj-dca-neighborhood-trends.walking_to_work_share';
const VERSION='nj-dca-neighborhood-trends-walk-2020-24-v1';
const SOURCE=`NJ DCA 2026 Neighborhood Trends Database · % Walking to Work, 2020-24 Estimate · ${VERSION}`;
const ELIGIBLE=new Set(['pro_plus','teams','developer']);
const TTL=6*60*60*1000;let cache:any=null,cacheAt=0;
function clean(v:unknown){return String(v??'').trim()}
function district(pin:unknown){return clean(pin).replace(/\D/g,'').slice(0,4)}
function summary(meta:Record<string,Record<string,any>>){const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};for(const p of Object.values(meta||{}))for(const r of Object.values(p||{})){const s=clean((r as any)?.status);out[s]=(out[s]||0)+1}return out}
async function load(){if(cache&&Date.now()-cacheAt<TTL)return cache;try{const r=await fetch(DATA_URL,{headers:{accept:'application/json'}});if(!r.ok)return null;const j=await r.json();if(Number(j?.schema_version)!==3||Number(j?.municipalities_matched)!==564||!j?.walking_to_work_validation?.publishable||Number(j?.walking_to_work_validation?.municipalities_matched)!==564||!j?.municipalities)return null;if(Number(j.municipalities?.['0101']?.walking_to_work_share)!==1.4275||Number(j.municipalities?.['0102']?.walking_to_work_share)!==11.8692)return null;cache=j;cacheAt=Date.now();return j}catch{return null}}
export async function enrichWalkingToWork(request:Request,response:Response){
  if(request.method!=='POST'||!response.ok)return response;let body:any;try{body=await request.json()}catch{return response}
  const requested=(Array.isArray(body?.marker_ids)?body.marker_ids:[]).map(clean).includes(MARKER_ID);if(!requested)return response;
  let payload:any;try{payload=await response.clone().json()}catch{return response}if(!ELIGIBLE.has(clean(payload?.plan)))return response;
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map(clean).filter(Boolean))] as string[];if(!pins.length)return response;
  const root=await load();payload.markers||={};payload.meta||={};
  for(const pin of pins){payload.markers[pin]||={};payload.meta[pin]||={};if(clean(payload.meta?.[pin]?.[MARKER_ID]?.status)==='not_entitled')continue;const d=district(pin),rec=/^\d{4}$/.test(d)?root?.municipalities?.[d]:null;
    if(!root){delete payload.markers[pin][MARKER_ID];payload.meta[pin][MARKER_ID]={status:'provider_error',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'Governed Neighborhood Trends mobility snapshot failed its 564-municipality/canary validation gate or could not be loaded.'};continue}
    if(!rec){delete payload.markers[pin][MARKER_ID];payload.meta[pin][MARKER_ID]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'No unique municipality match is present in the validated Neighborhood Trends snapshot.'};continue}
    const value=rec.walking_to_work_share;if(value===null||value===undefined||value===''){delete payload.markers[pin][MARKER_ID];payload.meta[pin][MARKER_ID]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'DCA municipality row has no current walking-to-work percentage; Watchdog does not coerce a blank to zero.'};continue}
    payload.markers[pin][MARKER_ID]=value;payload.meta[pin][MARKER_ID]={status:'available',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,observed_at:root?.generated_at,interpretation:'Published percentage of employed workers age 16 and older walking to work. This is a mobility statistic, not a generalized walkability score or commute-mode mix.'};
  }
  payload.provider_summary=summary(payload.meta);payload.provider_versions||={};payload.provider_versions.walking_to_work=VERSION;const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','private, no-store');return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
