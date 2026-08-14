const fs=require('fs');
const p='property/data/marker-registry.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
// Highest-priority source of truth: a snapshot of Supabase's data_center_provider_coverage
// table (see property/data/db-governed-status.json). This is the same table
// workbench-provider-registry queries live in production, so any marker with a row here
// overrides every heuristic below -- including workbench-derived (33 formulas) and the
// Chapter 123 engine, neither of which the heuristics in this script know how to detect.
// Refresh this file whenever data_center_provider_coverage changes (query: select marker_id,
// value_status from data_center_provider_coverage).
let dbGoverned={};
try{dbGoverned=JSON.parse(fs.readFileSync('property/data/db-governed-status.json','utf8')).statuses||{}}catch{}
const sourceLive=new Set(['nj-sr1a','nj-cod','nj-dca-budget','nj-tax-court-appeals','njdep-geology-live','njdep-hydro-live','njdep-land-live','njdep-csrr-gis']);
const parcelFields=new Set(['address','street_address','municipality','town','county','zip','postal','block','lot','qualifier','pams_pin','property_class','prop_class','property_use','year_built','construction_year','lot_area','acres','units','dwelling_units','building_description','building_desc','building_class','land_description','land_assessment','land_value','improvement_assessment','improvement_value','assessed_value','total_assessment','annual_tax','property_tax','effective_tax_rate','sale_price','last_sale_price','sale_year','last_sale_year','sale_date','deed_date','deed_book','deed_page','sales_code','parcel_last_update','parcel_publication_date','pcl_mun','cd_code','additional_lots','facility_name','gis_pin','old_property_id','parcel_guid','shape_area','shape_length','lat','lon','latitude','longitude','treasury_code','district_code','lot_area_sqft','square_feet_lot']);
const noValue=new Set(['owner_name','mailing_address','mailing_city_state','mailing_zip','mailing_zip4','market_value','square_feet']);
const directLive=new Set(['watchdog.building_age_years','watchdog.years_since_last_sale','watchdog.tax_to_assessment_rate','watchdog.land_share_pct','watchdog.improvement_share_pct','watchdog.assessment_per_acre','property.lot_area_sqft']);
// 2026-08-14 audit fixes (see NJ_Watchdog_Data_Marker_Audit report):
// 1) these 5 markers resolve through workbench-hydrate's trusted-observation path, same as
//    DB governance (data_center_provider_coverage) marks them: only "partial", not "live" --
//    they only return a value when a prior score_observations row already exists.
const trustedObservation=new Set(['watchdog.watchdog_score','watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score']);
// 2) all 14 "preflight" markers are resolved by MARKER ID in workbench-hydrate's dedicated
//    NJDEP/FEMA spatial resolver (environment-provider.ts) and DCA permit resolver
//    (dca-provider.ts) -- NOT by source_id. Their catalog source_id ("njdep-dca-live") never
//    matched anything in the deployed resolver, which is why they were stuck on "planned"
//    despite being confirmed live in data_center_provider_coverage. Matching by ID directly
//    is more accurate than trying to force them into the source_id family mechanism below.
const preflightLive=new Set(['preflight.contaminated_site_500m','preflight.deed_notice_hit','preflight.cea_hit','preflight.ust_250m','preflight.tidelands_reference_hit','preflight.highlands_hit','preflight.pinelands_hit','preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit','preflight.permit_count','preflight.open_permit_count','preflight.latest_permit_date']);
// 3) DCA raw permit feed (parcel-level) and DCA development-trends rollup (municipal-level) are
//    both live in dca-provider.ts, but only for the specific fields each resolver implements.
const dcaPermitFields=new Set(['permit_count','open_permit_count','latest_permit_date','permit_issued_count','certificate_count','latest_certificate_date','permit_type_mix','use_group_mix','authorized_construction_cost','authorized_square_feet','rental_units_gained','sale_units_gained']);
const dcaDevFields=new Set(['housing_units_authorized','new_housing_units_authorized','office_square_feet_authorized','retail_square_feet_authorized','other_nonresidential_square_feet','construction_cost_authorized','demolitions','certificate_of_occupancy_count','rental_units_created','for_sale_units_created']);
// 4) nj-cod is live as a family, but uniformity.json only carries 2022-2025 and has no
//    percentile/volatility fields yet -- these 8 specific fields are not actually computable
//    even though the rest of the nj-cod family is. Without this exclusion the blanket
//    sourceLive('nj-cod') rule below would incorrectly mark all 8 "live".
const codNotYetLive=new Set(['cod_2016','cod_2017','cod_2018','cod_2019','cod_2020','cod_2021','percentile','volatility']);
// 5) confirmed genuinely unavailable, not just unconnected -- no authoritative statewide DCA
//    PILOT-forecast dataset exists (per dca_source_registry). "planned" implied this was just
//    a matter of time; it isn't, unless a new source is found.
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
  if(src==='nj-cod'&&codNotYetLive.has(f))return'planned';
  if(sourceLive.has(src)){if(src.startsWith('njdep-')&&!m.source_layer)return'planned';return'live'}
  return'planned'
}
const c={live:0,planned:0,partial:0,unavailable:0};
for(const m of j.markers||[]){m.provider_status=state(m);m.provider_contract='workbench-hydrate-v15';c[m.provider_status]++}
j.provider_summary={...c,total:(j.markers||[]).length,coverage_pct:Number((c.live/Math.max(1,(j.markers||[]).length)*100).toFixed(1)),contract:'workbench-hydrate-v15'};
j.provider_status_definition={live:'A connected resolver can check this marker.',partial:'Resolves only when a supporting record (e.g. a trusted score observation) already exists; blank otherwise.',planned:'Cataloged marker without a connected resolver path.',unavailable:'Connected source does not supply this field, or no authoritative source has been confirmed at all.'};
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
console.log(j.provider_summary);
