const fs=require('fs');
const p='property/data/marker-registry.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
// Highest-priority source of truth: committed snapshots of Supabase's
// data_center_provider_coverage table. The base snapshot is intentionally
// supplemented by the newer overlay because production provider coverage can
// advance between full snapshot refreshes. Overlay wins on conflicts, matching
// scripts/build-derived-governance.js and preventing this legacy/manual sync
// path from regressing newly certified LIVE/PARTIAL/UNAVAILABLE states.
let baseGoverned={},overlayGoverned={};
try{baseGoverned=JSON.parse(fs.readFileSync('property/data/db-governed-status.json','utf8')).statuses||{}}catch{}
try{overlayGoverned=JSON.parse(fs.readFileSync('property/data/db-governed-provider-overlay.json','utf8')).statuses||{}}catch{}
const dbGoverned={...baseGoverned,...overlayGoverned};
const sourceLive=new Set(['nj-sr1a','nj-cod','nj-dca-budget','nj-tax-court-appeals','njdep-geology-live','njdep-hydro-live','njdep-land-live','njdep-csrr-gis']);
const parcelFields=new Set(['address','street_address','municipality','town','county','zip','postal','block','lot','qualifier','pams_pin','property_class','prop_class','property_use','year_built','construction_year','lot_area','acres','units','dwelling_units','building_description','building_desc','building_class','land_description','land_assessment','land_value','improvement_assessment','improvement_value','assessed_value','total_assessment','annual_tax','property_tax','effective_tax_rate','sale_price','last_sale_price','sale_year','last_sale_year','sale_date','deed_date','deed_book','deed_page','sales_code','parcel_last_update','parcel_publication_date','pcl_mun','cd_code','additional_lots','facility_name','gis_pin','old_property_id','parcel_guid','shape_area','shape_length','lat','lon','latitude','longitude','treasury_code','district_code','lot_area_sqft','square_feet_lot']);
const noValue=new Set(['owner_name','mailing_address','mailing_city_state','mailing_zip','mailing_zip4','market_value','square_feet']);
const directLive=new Set(['watchdog.building_age_years','watchdog.years_since_last_sale','watchdog.tax_to_assessment_rate','watchdog.land_share_pct','watchdog.improvement_share_pct','watchdog.assessment_per_acre','property.lot_area_sqft']);
const trustedObservation=new Set(['watchdog.watchdog_score','watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score']);
const preflightLive=new Set(['preflight.contaminated_site_500m','preflight.deed_notice_hit','preflight.cea_hit','preflight.ust_250m','preflight.tidelands_reference_hit','preflight.highlands_hit','preflight.pinelands_hit','preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.permit_count','preflight.open_permit_count','preflight.latest_permit_date']);
const dcaPermitFields=new Set(['permit_count','open_permit_count','latest_permit_date','permit_issued_count','certificate_count','latest_certificate_date','permit_type_mix','use_group_mix','authorized_construction_cost','authorized_square_feet','rental_units_gained','sale_units_gained']);
const dcaDevFields=new Set(['housing_units_authorized','new_housing_units_authorized','office_square_feet_authorized','retail_square_feet_authorized','other_nonresidential_square_feet','construction_cost_authorized','demolitions','certificate_of_occupancy_count','rental_units_created','for_sale_units_created']);
const modivIntelFields=new Set(['median_assessed_value','assessment_dispersion_iqr_pct','median_annual_tax','tax_dispersion_iqr_pct','median_assessment_change_pct','assessment_growth_positive_share_pct','assessment_change_dispersion_pct','assessment_jump_share_pct','median_land_share_pct','improvement_value_share_pct','residential_parcel_share_pct','commercial_parcel_share_pct','exempt_parcel_share_pct','vacant_parcel_share_pct','farm_parcel_share_pct','recent_sale_turnover_pct','median_building_age','pre_1978_building_share_pct','recent_build_share_pct','median_effective_tax_rate_pct','median_sale_assessment_ratio_pct','sale_assessment_ratio_dispersion_pct','median_parcel_acres','assessed_value_per_acre']);
// Municipal-reference provider gates. Explicit allow-lists prevent future catalog additions
// from becoming live merely because they reuse one of these source IDs.
const taxRateFields=new Set(Array.from({length:10},(_,i)=>'rate_'+(2016+i)));
const exemptPilotFields=new Set(['exempt_value','exempt_share','exempt_nonpilot_value','pilot_count','pilot_billing','pilot_assessed_value','pilot_value_share','partial_exemptions_abatements','partial_relief_share','municipal_subsidy','subsidy_budget_share','tax_if_conventional','exempt_percentile','pilot_percentile','subsidy_percentile']);
const abatementFields=new Set(['total_base','net_base','land','improvements','abated','abated_share','percentile','vs_median']);
const codNotYetLive=new Set(['cod_2016','cod_2017','cod_2018','cod_2019','cod_2020','cod_2021','percentile','volatility']);
const pilotForecastUnavailable='nj-dca-pilot-forecast';
function state(m){
  const src=String(m.source_id||''),f=String(m.field||''),id=String(m.id||'');
  if(Object.prototype.hasOwnProperty.call(dbGoverned,id))return dbGoverned[id];
  if(trustedObservation.has(id))return'partial';
  if(preflightLive.has(id))return'live';
  if(src===pilotForecastUnavailable)return'unavailable';
  if(src==='nj-parcels-modiv'&&noValue.has(f))return'unavailable';
  if(directLive.has(id))return'live';
  if(src==='nj-parcels-modiv'&&parcelFields.has(f))return'live';
  if(src==='nj-dca-permits-raw'&&dcaPermitFields.has(f))return'live';
  if(src==='nj-dca-development-trends'&&dcaDevFields.has(f))return'live';
  if(src==='treasury-modiv-2026'&&modivIntelFields.has(f))return'live';
  if(src==='nj-division-taxation'&&taxRateFields.has(f))return'live';
  if(src==='nj-abstract-pilot'&&exemptPilotFields.has(f))return'live';
  if(src==='nj-tax-abstract'&&abatementFields.has(f))return'live';
  if(src==='nj-cod'&&codNotYetLive.has(f))return'planned';
  if(sourceLive.has(src)){
    if(m.origin==='watchdog-derived'||m.proprietary===true)return'planned';
    if(src.startsWith('njdep-')&&!m.source_layer)return'planned';
    return'live';
  }
  return'planned';
}
const c={live:0,planned:0,partial:0,unavailable:0};
for(const m of j.markers||[]){
  m.provider_status=state(m);
  // Do not stamp a stale engine version. The database-first snapshots determine
  // status; runtime provider/source metadata remains authoritative for execution.
  if(!m.provider_contract)m.provider_contract='database-first-provider-governance';
  c[m.provider_status]++;
}
j.provider_summary={...c,total:(j.markers||[]).length,coverage_pct:Number((c.live/Math.max(1,(j.markers||[]).length)*100).toFixed(1)),contract:'database-first-provider-governance'};
j.provider_status_definition={live:'A connected resolver can check this marker.',partial:'Resolves only when a supporting governed record exists; blank otherwise.',planned:'Cataloged marker without a connected resolver path.',unavailable:'Connected source does not supply this field, or no authoritative source has been confirmed at all.'};
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
console.log(j.provider_summary);