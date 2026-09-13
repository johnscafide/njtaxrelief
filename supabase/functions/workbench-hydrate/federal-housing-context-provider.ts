const DATA_URL='https://raw.githubusercontent.com/johnscafide/njtaxrelief/37d3e87d85d818713dac31e6145fdd41a4447008/property/data/federal-housing-context-v041.json';
const RELEASE='federal-housing-context-v041-2026-09-13';
export const FEDERAL_HOUSING_CONTEXT_PROVIDER_VERSION='federal-housing-context-v041';
const VERSION=FEDERAL_HOUSING_CONTEXT_PROVIDER_VERSION;
const ELIGIBLE=new Set(['pro_plus','teams','developer']);
const TTL=6*60*60*1000;
let cache:any=null,cacheAt=0;

const HUD_ID='njplus.nj-dca-affordable-housing.hud_subsidized_units';
const BURDEN_ID='njplus.nj-dca-affordable-housing.low_income_cost_burden';
const COMMUTE_ID='njplus.nj-dca-neighborhood-trends.commute_mode_mix';
const IDS=new Set([HUD_ID,BURDEN_ID,COMMUTE_ID]);

const HUD_SOURCE='HUD Picture of Subsidized Households FY2025 · project-level public housing and multifamily assisted units · tenant-based vouchers without project locations excluded';
const BURDEN_SOURCE='HUD CHAS 2018-2022 · Table 8 · low-income households with housing problems / low-income households';
const COMMUTE_SOURCE='U.S. Census Bureau ACS 2024 5-Year · B08301 Means of Transportation to Work · county subdivision';

function clean(v:unknown){return String(v??'').trim()}
function district(pin:unknown){return clean(pin).replace(/\D/g,'').slice(0,4)}
function own(o:any,k:string){return !!o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k)}
function summary(meta:Record<string,Record<string,any>>){const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};for(const p of Object.values(meta||{}))for(const r of Object.values(p||{})){const s=clean((r as any)?.status);out[s]=(out[s]||0)+1}return out}
function finiteNumber(v:any){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}

async function load(){
  if(cache&&Date.now()-cacheAt<TTL)return cache;
  try{
    const r=await fetch(DATA_URL,{headers:{accept:'application/json'}});if(!r.ok)return null;
    const j=await r.json();
    if(Number(j?.schema_version)!==1||clean(j?.release)!==RELEASE||!j?.municipalities||Object.keys(j.municipalities).length!==564)return null;
    const a=j.municipalities?.['0101'],b=j.municipalities?.['0102'];
    if(Number(a?.hud_subsidized_units)!==16||Number(a?.low_income_cost_burden)!==77.33||Number(a?.commute_mode_mix?.drive)!==85.26)return null;
    if(Number(b?.hud_subsidized_units)!==3405||Number(b?.low_income_cost_burden)!==67.27||Number(b?.commute_mode_mix?.transit)!==20.38)return null;
    cache=j;cacheAt=Date.now();return j;
  }catch{return null}
}

function unavailableMeta(id:string,root:any,rec:any){
  if(id===HUD_ID){
    if(!root)return {status:'provider_error',provider_kind:'derived_governed',source:HUD_SOURCE,scope:'municipality',provider_version:VERSION,reason:'The governed federal housing context artifact failed its release, 564-municipality, or positive-control validation gate.'};
    return {status:'source_checked_no_value',provider_kind:'derived_governed',source:HUD_SOURCE,scope:'municipality',provider_version:VERSION,reason:rec?'No usable HUD subsidized-unit value is present for this municipality.':'No canonical municipality record is present in the governed artifact.'};
  }
  if(id===BURDEN_ID){
    if(!root)return {status:'provider_error',provider_kind:'derived_governed',source:BURDEN_SOURCE,scope:'municipality',provider_version:VERSION,reason:'The governed federal housing context artifact failed its release, 564-municipality, or positive-control validation gate.'};
    return {status:'source_checked_no_value',provider_kind:'derived_governed',source:BURDEN_SOURCE,scope:'municipality',provider_version:VERSION,reason:rec?'HUD CHAS does not publish a usable denominator/numerator pair for this municipality; Watchdog does not coerce a blank to zero.':'No canonical municipality record is present in the governed artifact.'};
  }
  if(!root)return {status:'provider_error',provider_kind:'derived_governed',source:COMMUTE_SOURCE,scope:'municipality',provider_version:VERSION,reason:'The governed federal housing context artifact failed its release, 564-municipality, or positive-control validation gate.'};
  return {status:'source_checked_no_value',provider_kind:'derived_governed',source:COMMUTE_SOURCE,scope:'municipality',provider_version:VERSION,reason:rec?'ACS B08301 does not publish a complete usable commute-mode denominator/component set for this municipality; Watchdog does not manufacture missing shares.':'No canonical municipality record is present in the governed artifact.'};
}

export async function enrichFederalHousingContext(request:Request,response:Response){
  if(request.method!=='POST'||!response.ok)return response;
  let body:any;try{body=await request.json()}catch{return response}
  const requested=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map(clean).filter((id:string)=>IDS.has(id)))] as string[];
  if(!requested.length)return response;
  let payload:any;try{payload=await response.clone().json()}catch{return response}
  if(!ELIGIBLE.has(clean(payload?.plan)))return response;
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map(clean).filter(Boolean))] as string[];if(!pins.length)return response;
  const root=await load();payload.markers||={};payload.meta||={};
  for(const pin of pins){
    payload.markers[pin]||={};payload.meta[pin]||={};const d=district(pin),rec=/^\d{4}$/.test(d)?root?.municipalities?.[d]:null;
    for(const id of requested){
      if(clean(payload.meta?.[pin]?.[id]?.status)==='not_entitled')continue;
      delete payload.markers[pin][id];
      if(!root||!rec){payload.meta[pin][id]=unavailableMeta(id,root,rec);continue}
      if(id===HUD_ID){
        const value=finiteNumber(rec.hud_subsidized_units);
        if(value===null||value<0){payload.meta[pin][id]=unavailableMeta(id,root,rec);continue}
        payload.markers[pin][id]=value;
        payload.meta[pin][id]={status:'available',provider_kind:'derived_governed',source:HUD_SOURCE,scope:'municipality',provider_version:VERSION,source_release:RELEASE,source_field:'total_units',calculation_key:'dedupe project code by max total_units, then sum uniquely assigned projects by municipality',interpretation:'HUD-assisted project units assigned to this municipality from public geocoded project records. This excludes tenant-based vouchers without project locations and is not a count of households currently receiving assistance.'};
        continue;
      }
      if(id===BURDEN_ID){
        const value=finiteNumber(rec.low_income_cost_burden),num=finiteNumber(rec.low_income_cost_burden_numerator),den=finiteNumber(rec.low_income_households_denominator);
        if(value===null||num===null||den===null||den<=0){payload.meta[pin][id]=unavailableMeta(id,root,rec);continue}
        payload.markers[pin][id]=value;
        payload.meta[pin][id]={status:'available',provider_kind:'derived_governed',source:BURDEN_SOURCE,scope:'municipality',provider_version:VERSION,source_release:RELEASE,source_field:'Table 8 low-income housing-problem households / low-income households',calculation_key:'100 * numerator / denominator',numerator:num,denominator:den,unit:'percent',interpretation:'Share of HUD CHAS low-income households represented by the governed Table 8 housing-problem numerator. This is municipality-level housing context, not an eligibility determination.'};
        continue;
      }
      const mix=rec.commute_mode_mix;
      const keys=['drive','transit','walk_bike','work_from_home','other'];
      if(!mix||keys.some(k=>finiteNumber(mix[k])===null)){payload.meta[pin][id]=unavailableMeta(id,root,rec);continue}
      const value={drive:Number(mix.drive),transit:Number(mix.transit),walk_bike:Number(mix.walk_bike),work_from_home:Number(mix.work_from_home),other:Number(mix.other)};
      payload.markers[pin][id]=value;
      payload.meta[pin][id]={status:'available',provider_kind:'derived_governed',source:COMMUTE_SOURCE,scope:'municipality',provider_version:VERSION,source_release:RELEASE,source_field:'B08301',calculation_key:'drive=B08301_003E+B08301_004E; transit=B08301_010E; walk_bike=B08301_018E+B08301_019E; work_from_home=B08301_021E; other=B08301_016E+B08301_017E+B08301_020E; divide each by B08301_001E',total_workers:rec.commute_total_workers,source_geography:rec.commute_source_geography,unit:'percent shares',interpretation:'Structured municipality commute-mode mix. Categories are mutually exclusive compact groups derived only from published ACS B08301 estimates and sum to approximately 100% subject to rounding.'};
    }
  }
  payload.provider_summary=summary(payload.meta);payload.provider_versions||={};payload.provider_versions.federal_housing_context=VERSION;
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','private, no-store');return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
