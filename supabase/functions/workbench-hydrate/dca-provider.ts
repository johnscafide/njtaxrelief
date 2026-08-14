// Phase 3/4 NJ DCA construction-permit + municipal development resolver.
// Authoritative source: NJ DCA / NJOIT Open Data, dataset w9se-dmra.
// The source is raw/unaudited, updated monthly, retains roughly 60 months, and may omit municipalities.
const API='https://data.nj.gov/resource/w9se-dmra.json';
const cache=new Map<string,{at:number,rows:any[]}>();
const TTL=30*60*1000;
function esc(v:any){return String(v??'').replace(/'/g,"''").trim()}
function num(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function treasury(row:any){const pin=String(row?.pams_pin||'').replace(/\D/g,'');return pin.slice(0,4)||String(row?.cd_code||'').trim()}
async function fetchRows(key:string,where:string,limit='50000'){
  const old=cache.get(key);if(old&&Date.now()-old.at<TTL)return old.rows;
  const q=new URLSearchParams({$where:where,$limit:limit,$order:'permitdate DESC'});
  try{const r=await fetch(API+'?'+q.toString(),{headers:{accept:'application/json'}});if(!r.ok)return[];const j=await r.json();const rows=Array.isArray(j)?j:[];cache.set(key,{at:Date.now(),rows});return rows}catch{return[]}
}
async function parcelRows(row:any){
  const tc=treasury(row),block=esc(row?.block),lot=esc(row?.lot);
  // Never fall back to a municipal aggregate for a property-level marker.
  if(!/^\d{4}$/.test(tc)||!block||!lot)return [];
  return fetchRows('parcel|'+tc+'|'+block+'|'+lot,`treasurycode='${tc}' AND block='${block}' AND lot='${lot}'`,'5000');
}
async function municipalRows(row:any){const tc=treasury(row);if(!/^\d{4}$/.test(tc))return[];return fetchRows('muni|'+tc,`treasurycode='${tc}'`)}
function maxDate(rows:any[],key:string){let best='';for(const r of rows){const v=String(r?.[key]||'');if(v&&v>best)best=v}return best||null}
function mix(rows:any[],key:string){const m:Record<string,number>={};for(const r of rows){const k=String(r?.[key]||'Unknown').trim()||'Unknown';m[k]=(m[k]||0)+1}return Object.keys(m).length?m:null}
function isIssued(r:any){return String(r?.status||'').toUpperCase()==='P'}
function isCert(r:any){return String(r?.status||'').toUpperCase()==='C'}
function useCode(r:any){return String(r?.usegroup||r?.use_group||'').toUpperCase().trim()}
function useDesc(r:any){return String(r?.usegroupdesc||'').toLowerCase()}
function isResidential(r:any){const c=useCode(r),d=useDesc(r);return /^R($|-|\d)/.test(c)||/residential|one family|two family|dwelling|apartment/.test(d)}
function isOffice(r:any){const c=useCode(r),d=useDesc(r);return c==='B'||/^B[- ]/.test(c)||/business|office/.test(d)}
function isRetail(r:any){const c=useCode(r),d=useDesc(r);return c==='M'||/^M[- ]/.test(c)||/mercantile|retail/.test(d)}
function permitType(r:any){return String(r?.permittype||'').padStart(2,'0')}
function sum(rows:any[],key:string){return rows.reduce((s,x)=>s+num(x?.[key]),0)}
function parcelField(rows:any[],field:string){
  const issued=rows.filter(isIssued),cert=rows.filter(isCert);
  if(field==='permit_count'||field==='permit_issued_count')return issued.length;
  if(field==='certificate_count')return cert.length;
  if(field==='open_permit_count')return Math.max(0,issued.length-cert.length);
  if(field==='latest_permit_date')return maxDate(issued,'permitdate');
  if(field==='latest_certificate_date')return maxDate(cert,'certdate');
  if(field==='permit_type_mix')return mix(issued,'permittypedesc');
  if(field==='use_group_mix')return mix(issued,'usegroupdesc');
  if(field==='authorized_construction_cost')return sum(issued,'constcost');
  if(field==='authorized_square_feet')return sum(issued,'squarefeet');
  if(field==='rental_units_gained')return sum(issued,'rentgained');
  if(field==='sale_units_gained')return sum(issued,'salegained');
  return undefined;
}
function developmentField(rows:any[],field:string){
  const issued=rows.filter(isIssued),cert=rows.filter(isCert);
  if(field==='housing_units_authorized')return sum(issued,'rentgained')+sum(issued,'salegained');
  if(field==='new_housing_units_authorized'){const x=issued.filter(r=>permitType(r)==='04');return sum(x,'rentgained')+sum(x,'salegained')}
  if(field==='office_square_feet_authorized')return sum(issued.filter(isOffice),'squarefeet');
  if(field==='retail_square_feet_authorized')return sum(issued.filter(isRetail),'squarefeet');
  if(field==='other_nonresidential_square_feet')return sum(issued.filter(r=>!isResidential(r)&&!isOffice(r)&&!isRetail(r)),'squarefeet');
  if(field==='construction_cost_authorized')return sum(issued,'constcost');
  if(field==='demolitions')return issued.filter(r=>permitType(r)==='13'||/demolition/i.test(String(r?.permittypedesc||''))).length;
  if(field==='certificate_of_occupancy_count')return cert.length;
  if(field==='rental_units_created')return sum(issued,'rentgained');
  if(field==='for_sale_units_created')return sum(issued,'salegained');
  return undefined;
}
export async function dcaPermitValue(marker:any,row:any){
  const src=String(marker?.source_id||''),id=String(marker?.id||''),field=String(marker?.field||'');
  if(src==='nj-dca-development-trends'){
    const rows=await municipalRows(row);if(!rows.length)return {v:null,checked:true};
    const v=developmentField(rows,field);return v===undefined?null:{v,checked:true};
  }
  if(src!=='nj-dca-permits-raw'&&!id.startsWith('preflight.'))return null;
  const supported=['permit_count','open_permit_count','latest_permit_date','permit_issued_count','certificate_count','latest_certificate_date','permit_type_mix','use_group_mix','authorized_construction_cost','authorized_square_feet','rental_units_gained','sale_units_gained'];
  if(!supported.includes(field))return null;
  const rows=await parcelRows(row);if(!rows.length)return {v:null,checked:true};
  const v=parcelField(rows,field);return v===undefined?null:{v,checked:true};
}
export const DCA_PERMIT_PROVIDER_VERSION='nj-dca-permits-development-live-v2';
