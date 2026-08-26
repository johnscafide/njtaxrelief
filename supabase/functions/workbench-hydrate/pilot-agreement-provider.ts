const DATA_URL='https://www.watchdogindex.com/property/data/pilot-agreement-intelligence.json';
const PREFIX='njplus.nj-dca-pilot-forecast.';
const VERSION='nj-dca-pilot-agreement-2026-v1';
const SOURCE=`NJ DCA PILOT Database and Viewer 2026 · Raw Data from UFBs · ${VERSION}`;
const ELIGIBLE=new Set(['pro_plus','teams','developer']);
const FIELDS=new Set(['pilot_agreement_count','pilot_expiration_year','pilot_term_remaining','pilot_project_type']);
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
    const j=await r.json();
    if(Number(j?.release_year)!==2026||Number(j?.source_year)!==2025||!j?.municipalities)return null;
    cache=j;cacheAt=Date.now();return j;
  }catch{return null}
}
function monthsRemaining(iso:string){
  const target=new Date(`${iso}T00:00:00Z`);if(Number.isNaN(target.getTime()))return null;
  const now=new Date();if(target.getTime()<now.getTime())return null;
  const days=(target.getTime()-now.getTime())/86400000;
  return Math.max(0,Math.round(days/30.4375));
}
function typeMix(value:any){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const rows=Object.entries(value).map(([k,v])=>[clean(k),Number(v)] as [string,number]).filter(([k,v])=>k&&Number.isFinite(v)&&v>0);
  if(!rows.length)return null;
  rows.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return rows.map(([k,v])=>`${k}: ${v}`).join('; ');
}

export async function enrichPilotAgreement(request:Request,response:Response){
  if(request.method!=='POST'||!response.ok)return response;
  let body:any;try{body=await request.json()}catch{return response}
  const ids=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map(clean).filter((id:string)=>id.startsWith(PREFIX)&&FIELDS.has(id.slice(PREFIX.length))))] as string[];
  if(!ids.length)return response;
  let payload:any;try{payload=await response.clone().json()}catch{return response}
  if(!ELIGIBLE.has(clean(payload?.plan)))return response;
  const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map(clean).filter(Boolean))] as string[];
  if(!pins.length)return response;
  const root=await loadData();
  payload.markers||={};payload.meta||={};
  for(const pin of pins){
    payload.markers[pin]||={};payload.meta[pin]||={};
    const code=treasuryCode(pin), rec=/^\d{4}$/.test(code)?root?.municipalities?.[code]:null;
    for(const id of ids){
      if(clean(payload.meta?.[pin]?.[id]?.status)==='not_entitled')continue;
      const field=id.slice(PREFIX.length);
      if(!root){
        delete payload.markers[pin][id];payload.meta[pin][id]={status:'provider_error',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'Governed row-level PILOT agreement snapshot could not be loaded.'};continue;
      }
      if(!rec){
        delete payload.markers[pin][id];payload.meta[pin][id]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'No matching reported PILOT agreement rows are available for the parcel municipality.'};continue;
      }
      let value:any=null, interpretation='';
      if(field==='pilot_agreement_count'){
        value=rec?.reported_agreement_fingerprint_count;
        interpretation='Count of distinct reported agreement fingerprints (project name + reported start/end dates + reported project type); not a legal count of enforceable agreements.';
      }else if(field==='pilot_expiration_year'){
        value=rec?.next_reported_expiration_year;
        interpretation='Earliest future year among valid reported agreement end dates; does not determine that an agreement remains active or unamended.';
      }else if(field==='pilot_term_remaining'){
        value=rec?.next_reported_expiration_date?monthsRemaining(rec.next_reported_expiration_date):null;
        interpretation='Approximate months until the earliest future reported agreement end date; not a legal term determination.';
      }else if(field==='pilot_project_type'){
        value=typeMix(rec?.project_type_mix);
        interpretation='Reported project-type mix across municipal PILOT rows; no arbitrary single type is selected.';
      }
      if(value===null||value===undefined||value===''){
        delete payload.markers[pin][id];payload.meta[pin][id]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'The row-level source was checked but the requested reported agreement fact is unavailable.'};continue;
      }
      payload.markers[pin][id]=value;
      payload.meta[pin][id]={status:'available',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,source_year:2025,release_year:2026,observed_at:root?.generated_at,interpretation};
    }
  }
  payload.provider_summary=providerSummary(payload.meta);payload.provider_versions||={};payload.provider_versions.dca_pilot_agreement=VERSION;
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
