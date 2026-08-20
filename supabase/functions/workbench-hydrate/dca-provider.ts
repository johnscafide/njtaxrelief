// NJ public-data resolver used by Workbench hydration.
// Serves DCA construction permits/development, 2026 MOD-IV municipal intelligence,
// NJ Division of Taxation general tax rates, Abstract-of-Ratables abatements,
// the combined statewide exemption/PILOT aggregate, and governed DCA housing context.
const API='https://data.nj.gov/resource/w9se-dmra.json';
const BASE='https://njpropertytaxrelief.com';
const MODIV_API=BASE+'/property/data/statewide-intelligence.json';
const TAX_RATES_API=BASE+'/property/tax-rates.json';
const EXEMPT_API=BASE+'/property/data/exempt-pilot.json';
const ABATEMENTS_API=BASE+'/property/abatements.json';
const AFFORDABLE_API=BASE+'/property/data/affordable-housing.json';
const NEIGHBORHOOD_API=BASE+'/property/data/neighborhood-trends.json';

const cache=new Map<string,{at:number,rows:any[]}>();
const TTL=30*60*1000;
let modivRootCache:any=null,modivRootAt=0;
let municipalRootCache:any=null,municipalRootAt=0;
const MODIV_TTL=6*60*60*1000;
const MUNICIPAL_TTL=6*60*60*1000;

const MODIV_FIELDS=new Set([
  'median_assessed_value','assessment_dispersion_iqr_pct','median_annual_tax','tax_dispersion_iqr_pct',
  'median_assessment_change_pct','assessment_growth_positive_share_pct','assessment_change_dispersion_pct',
  'assessment_jump_share_pct','median_land_share_pct','improvement_value_share_pct','residential_parcel_share_pct',
  'commercial_parcel_share_pct','exempt_parcel_share_pct','vacant_parcel_share_pct','farm_parcel_share_pct',
  'recent_sale_turnover_pct','median_building_age','pre_1978_building_share_pct','recent_build_share_pct',
  'median_effective_tax_rate_pct','median_sale_assessment_ratio_pct','sale_assessment_ratio_dispersion_pct',
  'median_parcel_acres','assessed_value_per_acre'
]);

const EXEMPT_FIELDS=new Set([
  'exempt_value','exempt_share','exempt_nonpilot_value','pilot_count','pilot_billing','pilot_assessed_value',
  'pilot_value_share','partial_exemptions_abatements','partial_relief_share','municipal_subsidy',
  'subsidy_budget_share','tax_if_conventional','exempt_percentile','pilot_percentile','subsidy_percentile'
]);
const EXEMPT_DERIVED_FIELDS=new Set([
  'exempt_share','pilot_value_share','partial_relief_share','municipal_subsidy','subsidy_budget_share',
  'tax_if_conventional','exempt_percentile','pilot_percentile','subsidy_percentile'
]);
const EXEMPT_ABSTRACT_ONLY=new Set(['partial_exemptions_abatements','partial_relief_share']);
const EXEMPT_PILOT_ONLY=new Set([
  'pilot_count','pilot_billing','pilot_assessed_value','pilot_value_share','municipal_subsidy',
  'subsidy_budget_share','tax_if_conventional','pilot_percentile','subsidy_percentile'
]);

const ABATEMENT_FIELDS=new Set(['total_base','net_base','land','improvements','abated','abated_share','percentile','vs_median']);
const ABATEMENT_DERIVED_FIELDS=new Set(['abated_share','percentile','vs_median']);
const AFFORDABLE_FIELDS=new Set([
  'affordable_housing_reporting_status','affordable_trust_fund_balance','affordable_units_for_sale',
  'affordable_units_rental','affordable_units_total','low_income_households','moderate_income_households'
]);
const NEIGHBORHOOD_FIELDS=new Set([
  'population_change','housing_unit_change','rental_cost_change','home_value_change',
  'household_income','employment_density','neighborhood_trend_year'
]);
const NEIGHBORHOOD_DERIVED_FIELDS=new Set([
  'population_change','housing_unit_change','rental_cost_change','home_value_change','employment_density','neighborhood_trend_year'
]);

function esc(v:any){return String(v??'').replace(/'/g,"''").trim()}
function num(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function treasury(row:any){const pin=String(row?.pams_pin||'').replace(/\D/g,'');return pin.slice(0,4)||String(row?.cd_code||'').trim()}
function normMunicipality(v:any){return String(v??'').toUpperCase().replace(/\./g,'').replace(/\bTOWNSHIP\b/g,'TWP').replace(/\bBOROUGH\b/g,'BORO').replace(/\s+/g,' ').trim()}
function normCounty(v:any){return String(v??'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').replace(/\s+/g,' ').trim()}
function collapseDuplicateType(v:string){return v.replace(/\b(CITY|BORO|TWP|TOWN|VILLAGE)\s+\1$/,'$1')}

async function fetchRows(key:string,where:string,limit='50000'){
  const old=cache.get(key);if(old&&Date.now()-old.at<TTL)return old.rows;
  const q=new URLSearchParams({$where:where,$limit:limit,$order:'permitdate DESC'});
  try{const r=await fetch(API+'?'+q.toString(),{headers:{accept:'application/json'}});if(!r.ok)return[];const j=await r.json();const rows=Array.isArray(j)?j:[];cache.set(key,{at:Date.now(),rows});return rows}catch{return[]}
}

async function fetchJson(url:string){
  try{const r=await fetch(url,{headers:{accept:'application/json'}});return r.ok?await r.json():null}catch{return null}
}

async function modivRoot(){
  if(modivRootCache&&Date.now()-modivRootAt<MODIV_TTL)return modivRootCache;
  const j=await fetchJson(MODIV_API);
  if(!j||String(j?.source_id||'')!=='treasury-modiv-2026'||!j?.municipalities)return null;
  modivRootCache=j;modivRootAt=Date.now();return j
}

async function municipalRoots(){
  if(municipalRootCache&&Date.now()-municipalRootAt<MUNICIPAL_TTL)return municipalRootCache;
  const [taxRates,exemptPilot,abatements,affordableHousing,neighborhoodTrends]=await Promise.all([
    fetchJson(TAX_RATES_API),fetchJson(EXEMPT_API),fetchJson(ABATEMENTS_API),fetchJson(AFFORDABLE_API),fetchJson(NEIGHBORHOOD_API)
  ]);
  const rateIndex:Record<string,any>={};
  for(const [key,row] of Object.entries(taxRates?.rates||{})){
    const m=String(key).match(/^(.*)\s+\(([^)]+)\)$/);if(!m)continue;
    const exact=normMunicipality(m[1])+'|'+normCounty(m[2]);
    rateIndex[exact]=row;
    const collapsed=collapseDuplicateType(normMunicipality(m[1]))+'|'+normCounty(m[2]);
    if(!rateIndex[collapsed])rateIndex[collapsed]=row;
  }
  municipalRootCache={taxRates,exemptPilot,abatements,affordableHousing,neighborhoodTrends,rateIndex};municipalRootAt=Date.now();return municipalRootCache
}

async function modivIntelValue(row:any,field:string){
  if(!MODIV_FIELDS.has(field))return null;
  const tc=treasury(row);if(!/^\d{4}$/.test(tc))return {v:null,checked:true,kind:'derived_governed',source:'Watchdog 2026 MOD-IV statewide intelligence'};
  const root=await modivRoot();if(!root)return {v:null,checked:true,kind:'derived_governed',source:'Watchdog 2026 MOD-IV statewide intelligence'};
  const signal=root?.municipalities?.[tc]?.signals?.[field];
  return {v:signal?.value??null,checked:true,kind:'derived_governed',source:'Watchdog 2026 MOD-IV statewide intelligence · '+MODIV_INTEL_PROVIDER_VERSION};
}

function taxRateValue(root:any,row:any,field:string){
  const m=String(field||'').match(/^rate_(20\d{2})$/);if(!m)return null;
  const county=normCounty(row?.county),town=normMunicipality(row?.town);
  if(!town||!county)return {v:null,checked:true,kind:'authoritative_reference',source:'NJ Division of Taxation general tax rates'};
  const key=town+'|'+county,collapsed=collapseDuplicateType(town)+'|'+county;
  const rates=root?.rateIndex?.[key]||root?.rateIndex?.[collapsed];
  return {v:rates?.[m[1]]??null,checked:true,kind:'authoritative_reference',source:'NJ Division of Taxation general tax rates 2016–2025 · '+MUNICIPAL_REFERENCE_PROVIDER_VERSION};
}

function exemptionValue(root:any,row:any,field:string,origin:string){
  if(!EXEMPT_FIELDS.has(field))return null;
  const tc=treasury(row),rec=root?.exemptPilot?.municipalities?.[tc];
  if(!/^\d{4}$/.test(tc)||!rec)return {v:null,checked:true,kind:origin==='watchdog-derived'?'derived_governed':'authoritative_reference',source:'NJ Abstract of Ratables + DCA PILOT aggregate'};
  const cov=rec.coverage||{},hasAbstract=!!cov.abstract_2025,hasPilot=!!cov.dca_pilot_2026;
  const covered=EXEMPT_ABSTRACT_ONLY.has(field)?hasAbstract:EXEMPT_PILOT_ONLY.has(field)?hasPilot:(hasAbstract&&hasPilot);
  const kind=origin==='watchdog-derived'||EXEMPT_DERIVED_FIELDS.has(field)?'derived_governed':'authoritative_reference';
  return {v:covered?(rec[field]??null):null,checked:true,kind,source:'NJ 2025 Abstract of Ratables + DCA 2026 PILOT aggregate · '+MUNICIPAL_REFERENCE_PROVIDER_VERSION};
}

function positiveMedianShare(root:any){
  const vals=Object.values(root?.abatements?.districts||{}).map((x:any)=>Number(x?.abated_share)).filter((x:number)=>Number.isFinite(x)&&x>0).sort((a:number,b:number)=>a-b);
  if(!vals.length)return 0;const mid=Math.floor(vals.length/2);return vals.length%2?vals[mid]:(vals[mid-1]+vals[mid])/2
}

function abatementValue(root:any,row:any,field:string,origin:string){
  if(!ABATEMENT_FIELDS.has(field))return null;
  const tc=treasury(row),rec=root?.abatements?.districts?.[tc];
  const kind=origin==='watchdog-derived'||ABATEMENT_DERIVED_FIELDS.has(field)?'derived_governed':'authoritative_reference';
  if(!/^\d{4}$/.test(tc)||!rec)return {v:null,checked:true,kind,source:'NJ Division of Taxation 2025 Abstract of Ratables'};
  let v=rec[field]??null;
  if(field==='vs_median'){
    const median=Number(root?.abatements?.statewide_median_share)||positiveMedianShare(root);
    const share=Number(rec?.abated_share);
    v=median>0&&Number.isFinite(share)?share/median:0;
  }
  return {v,checked:true,kind,source:'NJ Division of Taxation 2025 Abstract of Ratables · '+MUNICIPAL_REFERENCE_PROVIDER_VERSION};
}

function affordableHousingValue(root:any,row:any,field:string){
  if(!AFFORDABLE_FIELDS.has(field))return null;
  const tc=treasury(row),rec=root?.affordableHousing?.districts?.[tc];
  if(!/^\d{4}$/.test(tc)||!rec)return {v:null,checked:true,kind:'authoritative_reference',source:'NJ DCA affordable housing municipal status reporting'};
  const v=field==='affordable_housing_reporting_status'?rec?.reporting_status:rec?.[field];
  return {v:v??null,checked:true,kind:'authoritative_reference',source:'NJ DCA affordable housing municipal status reporting · '+MUNICIPAL_HOUSING_PROVIDER_VERSION};
}

function neighborhoodTrendValue(root:any,row:any,field:string){
  if(!NEIGHBORHOOD_FIELDS.has(field))return null;
  const tc=treasury(row),rec=root?.neighborhoodTrends?.municipalities?.[tc];
  const kind=NEIGHBORHOOD_DERIVED_FIELDS.has(field)?'derived_governed':'authoritative_reference';
  if(!/^\d{4}$/.test(tc)||!rec)return {v:null,checked:true,kind,source:'NJ DCA 2026 Neighborhood Trends Database'};
  return {v:rec?.[field]??null,checked:true,kind,source:'NJ DCA 2026 Neighborhood Trends Database · '+MUNICIPAL_HOUSING_PROVIDER_VERSION};
}

async function parcelRows(row:any){
  const tc=treasury(row),block=esc(row?.block),lot=esc(row?.lot);
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
  const src=String(marker?.source_id||''),id=String(marker?.id||''),field=String(marker?.field||''),origin=String(marker?.origin||'');
  if(src==='treasury-modiv-2026')return modivIntelValue(row,field);
  if(src==='nj-division-taxation'||src==='nj-abstract-pilot'||src==='nj-tax-abstract'||src==='nj-dca-affordable-housing'||src==='nj-dca-neighborhood-trends'){
    const root=await municipalRoots();
    if(src==='nj-division-taxation')return taxRateValue(root,row,field);
    if(src==='nj-abstract-pilot')return exemptionValue(root,row,field,origin);
    if(src==='nj-tax-abstract')return abatementValue(root,row,field,origin);
    if(src==='nj-dca-affordable-housing')return affordableHousingValue(root,row,field);
    return neighborhoodTrendValue(root,row,field);
  }
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
export const MODIV_INTEL_PROVIDER_VERSION='modiv-intelligence-2026-v1';
export const MUNICIPAL_REFERENCE_PROVIDER_VERSION='nj-municipal-reference-live-v1';
export const MUNICIPAL_HOUSING_PROVIDER_VERSION='nj-dca-housing-context-live-v1';
