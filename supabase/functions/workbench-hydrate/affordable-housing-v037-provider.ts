export const AFFORDABLE_HOUSING_V037_PROVIDER_VERSION='nj-dca-affordable-housing-v037';
const RELEASE='dca-affordable-housing-v037-feb-2026';
const SOURCE=`NJ DCA Affordable Housing Municipal Status Report · February 2026 · ${RELEASE}`;
const DATA_URL='https://raw.githubusercontent.com/johnscafide/njtaxrelief/e53a987b7a27430ecb7a12ce36e1b0cdf42e2e5b/property/data/affordable-housing-v037.json';
const TTL=6*60*60*1000;
let cached:any=null,cachedAt=0;

type Kind='derived_governed'|'authoritative_reference';
type Spec={field:string,kind:Kind,source_field:string,calculation_key?:string};
const AGG='dca-affordable-housing-v037-municipal-aggregate';
const specs:Record<string,Spec>={
 'njplus.nj-dca-affordable-housing.reported_affordable_project_count':{field:'reported_affordable_project_count',kind:'derived_governed',source_field:'Project ID',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_single_family':{field:'affordable_units_single_family',kind:'derived_governed',source_field:'Single-Family',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_two_family':{field:'affordable_units_two_family',kind:'derived_governed',source_field:'Two-Family',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_townhouse':{field:'affordable_units_townhouse',kind:'derived_governed',source_field:'Townhouse',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_apartment':{field:'affordable_units_apartment',kind:'derived_governed',source_field:'Apartment',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_condo':{field:'affordable_units_condo',kind:'derived_governed',source_field:'Condo',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_manufactured_home':{field:'affordable_units_manufactured_home',kind:'derived_governed',source_field:'Manufactured Home',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_mobile_home':{field:'affordable_units_mobile_home',kind:'derived_governed',source_field:'Mobile Home',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_type_unknown':{field:'affordable_units_type_unknown',kind:'derived_governed',source_field:'Unit Type Unknown',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_very_low_income':{field:'affordable_units_very_low_income',kind:'derived_governed',source_field:'Very Low Income (Affordable at 30% or Less of Area Median Income)',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_affordability_level_unknown':{field:'affordable_units_affordability_level_unknown',kind:'derived_governed',source_field:'Affordability Level Unknown',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_special_needs':{field:'affordable_units_special_needs',kind:'derived_governed',source_field:'Special Needs/Dis-abled',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_family':{field:'affordable_units_family',kind:'derived_governed',source_field:'Family',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.affordable_units_age_restricted':{field:'affordable_units_age_restricted',kind:'derived_governed',source_field:'Age-Restricted (Senior)',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.projects_with_building_permit':{field:'projects_with_building_permit',kind:'derived_governed',source_field:'Date Building Permit Issued',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.projects_with_certificate_of_occupancy':{field:'projects_with_certificate_of_occupancy',kind:'derived_governed',source_field:'Certificate of Occupancy Granted',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.earliest_affordability_control_start_date':{field:'earliest_affordability_control_start_date',kind:'derived_governed',source_field:'Beginning Date of Earliest Affordability Controls',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.earliest_affordability_control_expiration_date':{field:'earliest_affordability_control_expiration_date',kind:'derived_governed',source_field:'Expiration Date of Earliest Affordability Controls',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.minimum_affordability_restriction_term_years':{field:'minimum_affordability_restriction_term_years',kind:'derived_governed',source_field:'Affordability Restriction Term (in Years) - Earliest Controls',calculation_key:AGG},
 'njplus.nj-dca-affordable-housing.ahtf_can_retain_nonresidential_development_fee':{field:'ahtf_can_retain_nonresidential_development_fee',kind:'authoritative_reference',source_field:'Can Retain Non-Residential Development Fee?'},
 'njplus.nj-dca-affordable-housing.ahtf_confirmed':{field:'ahtf_confirmed',kind:'authoritative_reference',source_field:'Has Confirmed Affordable Housing Trust Fund?'},
 'njplus.nj-dca-affordable-housing.ahtf_no_data_submitted':{field:'ahtf_no_data_submitted',kind:'authoritative_reference',source_field:'No AHTF Data Submitted'},
 'njplus.nj-dca-affordable-housing.ahtf_total_income_since_inception':{field:'ahtf_total_income_since_inception',kind:'authoritative_reference',source_field:'Total Income Since Inception'},
 'njplus.nj-dca-affordable-housing.ahtf_total_expenditures_since_inception':{field:'ahtf_total_expenditures_since_inception',kind:'authoritative_reference',source_field:'Total Expenditures Since Inception'},
 'njplus.nj-dca-affordable-housing.ahtf_residential_development_fees':{field:'ahtf_residential_development_fees',kind:'authoritative_reference',source_field:'Residential Development Fees'},
 'njplus.nj-dca-affordable-housing.ahtf_nonresidential_development_fees':{field:'ahtf_nonresidential_development_fees',kind:'authoritative_reference',source_field:'Nonresidential Development Fees'},
 'njplus.nj-dca-affordable-housing.ahtf_interest_earned':{field:'ahtf_interest_earned',kind:'authoritative_reference',source_field:'Interest Earned'},
 'njplus.nj-dca-affordable-housing.ahtf_municipal_contributions':{field:'ahtf_municipal_contributions',kind:'authoritative_reference',source_field:'Municipal Contributions'},
 'njplus.nj-dca-affordable-housing.ahtf_homeownership_assistance':{field:'ahtf_homeownership_assistance',kind:'authoritative_reference',source_field:'Homeownership Assistance'},
 'njplus.nj-dca-affordable-housing.ahtf_rental_assistance':{field:'ahtf_rental_assistance',kind:'authoritative_reference',source_field:'Rental Assistance'},
 'njplus.nj-dca-affordable-housing.ahtf_new_construction_expenditures':{field:'ahtf_new_construction_expenditures',kind:'authoritative_reference',source_field:'New Construction'},
};

function wanted(ids:string[]){return ids.filter(id=>specs[id]);}
function district(pin:string){const d=String(pin||'').replace(/\D/g,'');return d.slice(0,4)}
function own(o:any,k:string){return !!o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k)}
function summary(meta:Record<string,Record<string,any>>){
 const out:Record<string,number>={available:0,source_checked_no_value:0,dependency_missing:0,provider_error:0,not_computed:0,provider_missing:0,not_entitled:0};
 for(const pinMeta of Object.values(meta||{}))for(const row of Object.values(pinMeta||{})){const s=String((row as any)?.status||'');out[s]=(out[s]||0)+1}
 return out;
}
async function sourceRoot(){
 if(cached&&Date.now()-cachedAt<TTL)return cached;
 try{const r=await fetch(DATA_URL,{headers:{accept:'application/json'}});if(!r.ok)return null;const j=await r.json();if(j?.version!==RELEASE||!j?.municipalities)return null;cached=j;cachedAt=Date.now();return j}catch{return null}
}

export async function runWithAffordableHousingV037(handler:Deno.ServeHandler,request:Request,info:Deno.ServeHandlerInfo){
 let body:any=null;try{body=await request.clone().json()}catch{return handler(request,info)}
 const ids=[...new Set((Array.isArray(body?.marker_ids)?body.marker_ids:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
 const targets=wanted(ids);if(!targets.length)return handler(request,info);
 const response=await handler(request,info);if(!response.ok)return response;
 let payload:any=null;try{payload=await response.clone().json()}catch{return response}
 const root=await sourceRoot();
 const pins=[...new Set((Array.isArray(body?.pams_pins)?body.pams_pins:[]).map((x:any)=>String(x||'').trim()).filter(Boolean))];
 payload.markers||={};payload.meta||={};
 for(const pin of pins){
  payload.markers[pin]||={};payload.meta[pin]||={};const rec=root?.municipalities?.[district(pin)];
  for(const id of targets){
   if(String(payload.meta[pin]?.[id]?.status||'')==='not_entitled')continue;
   const spec=specs[id];delete payload.markers[pin][id];
   if(rec&&own(rec,spec.field)&&rec[spec.field]!==null&&rec[spec.field]!==undefined){
    payload.markers[pin][id]=rec[spec.field];payload.meta[pin][id]={status:'available',provider_kind:spec.kind,source:SOURCE,scope:'municipality',provider_version:AFFORDABLE_HOUSING_V037_PROVIDER_VERSION,source_release:RELEASE,source_field:spec.source_field,...(spec.calculation_key?{calculation_key:spec.calculation_key}:{}),observed_at:new Date().toISOString()};
   }else{
    payload.meta[pin][id]={status:root?'source_checked_no_value':'dependency_missing',provider_kind:spec.kind,source:SOURCE,scope:'municipality',provider_version:AFFORDABLE_HOUSING_V037_PROVIDER_VERSION,source_release:RELEASE,source_field:spec.source_field,...(spec.calculation_key?{calculation_key:spec.calculation_key}:{}),reason:root?'The official February 2026 DCA workbook has no usable value for this municipality/field.':'The governed DCA v0.37 source artifact could not be loaded.',checked_at:new Date().toISOString()};
   }
  }
 }
 payload.provider_summary=summary(payload.meta);payload.provider_versions||={};payload.provider_versions.affordable_housing_v037=AFFORDABLE_HOUSING_V037_PROVIDER_VERSION;
 const h=new Headers(response.headers);h.set('Content-Type','application/json; charset=utf-8');h.set('Cache-Control','private, no-store');
 return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers:h});
}
