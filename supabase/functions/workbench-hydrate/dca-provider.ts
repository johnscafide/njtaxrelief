// Phase 3/4 DCA construction-permit resolver.
// Official source: NJOIT Open Data / NJ DCA dataset w9se-dmra.
const API='https://data.nj.gov/resource/w9se-dmra.json';
const cache=new Map<string,{at:number,rows:any[]}>();
const TTL=30*60*1000;
function esc(v:any){return String(v??'').replace(/'/g,"''").trim()}
function num(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
async function rowsFor(row:any){
  const treasury=String(row?.pams_pin||'').slice(0,4)||String(row?.cd_code||'').trim();
  const block=esc(row?.block),lot=esc(row?.lot);
  if(!/^\d{4}$/.test(treasury))return [];
  const key=[treasury,block,lot].join('|'),old=cache.get(key);if(old&&Date.now()-old.at<TTL)return old.rows;
  const parts=[`treasurycode='${treasury}'`];
  // The official feed includes block/lot. Prefer parcel-level matching; if absent use municipality aggregate.
  if(block)parts.push(`block='${block}'`); if(lot)parts.push(`lot='${lot}'`);
  const q=new URLSearchParams({$where:parts.join(' AND '),$limit:'5000',$order:'permitdate DESC'});
  try{const r=await fetch(API+'?'+q.toString(),{headers:{accept:'application/json'}});if(!r.ok)return[];const j=await r.json();const rows=Array.isArray(j)?j:[];cache.set(key,{at:Date.now(),rows});return rows}catch{return[]}
}
function maxDate(rows:any[],key:string){let best='';for(const r of rows){const v=String(r?.[key]||'');if(v&&v>best)best=v}return best||null}
function mix(rows:any[],key:string){const m:Record<string,number>={};for(const r of rows){const k=String(r?.[key]||'Unknown').trim()||'Unknown';m[k]=(m[k]||0)+1}return Object.keys(m).length?m:null}
export async function dcaPermitValue(marker:any,row:any){
  const src=String(marker?.source_id||''),id=String(marker?.id||''),field=String(marker?.field||'');
  if(src!=='nj-dca-permits-raw'&&!id.startsWith('preflight.'))return null;
  if(!['permit_count','open_permit_count','latest_permit_date','permit_issued_count','certificate_count','latest_certificate_date','permit_type_mix','use_group_mix','authorized_construction_cost','authorized_square_feet','rental_units_gained','sale_units_gained'].includes(field))return null;
  const rows=await rowsFor(row); if(!rows.length)return {v:null,checked:true};
  const issued=rows.filter(x=>String(x.status||'').toUpperCase()==='P'),cert=rows.filter(x=>String(x.status||'').toUpperCase()==='C');
  let v:any=null;
  if(field==='permit_count'||field==='permit_issued_count')v=issued.length;
  else if(field==='certificate_count')v=cert.length;
  else if(field==='open_permit_count')v=Math.max(0,issued.length-cert.length);
  else if(field==='latest_permit_date')v=maxDate(issued,'permitdate');
  else if(field==='latest_certificate_date')v=maxDate(cert,'certdate');
  else if(field==='permit_type_mix')v=mix(rows,'permittypedesc');
  else if(field==='use_group_mix')v=mix(rows,'usegroupdesc');
  else if(field==='authorized_construction_cost')v=rows.reduce((s,x)=>s+num(x.constcost),0);
  else if(field==='authorized_square_feet')v=rows.reduce((s,x)=>s+num(x.squarefeet),0);
  else if(field==='rental_units_gained')v=rows.reduce((s,x)=>s+num(x.rentgained),0);
  else if(field==='sale_units_gained')v=rows.reduce((s,x)=>s+num(x.salegained),0);
  return {v,checked:true};
}
export const DCA_PERMIT_PROVIDER_VERSION='nj-dca-permits-live-v1';
