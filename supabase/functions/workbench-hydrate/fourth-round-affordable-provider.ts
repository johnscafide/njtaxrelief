const DATA_URL='https://raw.githubusercontent.com/johnscafide/njtaxrelief/e3ea74d0c210db8e4efafd0b1637838db4840568/property/data/fourth-round-affordable-published.json';
const PREFIX='njplus.nj-dca-fourth-round-affordable.';
const VERSION='nj-dca-fourth-round-2025-2035-v1';
const SOURCE=`NJ DCA Fourth Round (2025–2035) non-binding affordable housing calculations · published Methodology Appendix A · ${VERSION}`;
const ELIGIBLE=new Set(['pro_plus','teams','developer']);
const FIELDS=new Set([
  'present_need','prospective_need','prospective_need_capped','qualified_urban_aid',
  'nonresidential_value_factor_pct','land_capacity_factor_pct','income_capacity_factor_pct',
  'average_allocation_factor_pct','cap_1000_20pct'
]);
const TTL=6*60*60*1000;
let cache:any=null,cacheAt=0;

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
    if(!j?.validation?.publishable||Number(j?.validation?.matched_municipalities)!==564||Number(j?.validation?.present_need_statewide_total)!==65410||!j?.municipalities)return null;
    const byMunicode:Record<string,any>={};
    for(const rec of Object.values(j.municipalities) as any[]){
      const code=clean(rec?.dca_municode).replace(/\D/g,'').padStart(4,'0');
      if(/^\d{4}$/.test(code)&&!byMunicode[code])byMunicode[code]=rec;
    }
    if(Object.keys(byMunicode).length!==564)return null;
    cache={...j,by_municode:byMunicode};cacheAt=Date.now();return cache;
  }catch{return null}
}

export async function enrichFourthRoundAffordable(request:Request,response:Response){
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
    const code=treasuryCode(pin),rec=/^\d{4}$/.test(code)?root?.by_municode?.[code]:null;
    for(const id of ids){
      if(clean(payload.meta?.[pin]?.[id]?.status)==='not_entitled')continue;
      const field=id.slice(PREFIX.length);
      if(!root){
        delete payload.markers[pin][id];
        payload.meta[pin][id]={status:'provider_error',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'Governed Fourth Round published snapshot failed its 564-municipality/65,410 statewide validation gate or could not be loaded.'};
        continue;
      }
      if(!rec){
        delete payload.markers[pin][id];
        payload.meta[pin][id]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'No unique DCA Municode match is present in the validated Fourth Round snapshot.'};
        continue;
      }
      const value=rec?.[field];
      if(value===null||value===undefined||value===''){
        delete payload.markers[pin][id];
        payload.meta[pin][id]={status:'source_checked_no_value',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,reason:'DCA published the municipal row but the requested field is blank; Watchdog does not coerce a blank to zero.'};
        continue;
      }
      payload.markers[pin][id]=value;
      payload.meta[pin][id]={
        status:'available',provider_kind:'authoritative_reference',source:SOURCE,scope:'municipality',provider_version:VERSION,
        observed_at:root?.generated_at,
        interpretation:'Observed value from DCA’s published Fourth Round calculation table. DCA describes the calculations as non-binding guidance; this is not a legal determination of municipal affordable-housing obligation.'
      };
    }
  }
  payload.provider_summary=providerSummary(payload.meta);payload.provider_versions||={};payload.provider_versions.fourth_round_affordable=VERSION;
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','private, no-store');
  return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
