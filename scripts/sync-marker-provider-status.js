const fs=require('fs');
const p='property/data/marker-registry.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
const sourceLive=new Set(['nj-sr1a','nj-cod','nj-dca-budget','nj-tax-court-appeals','njdep-geology-live','njdep-hydro-live','njdep-land-live','njdep-csrr-gis']);
const parcelFields=new Set(['address','street_address','municipality','town','county','zip','postal','block','lot','qualifier','pams_pin','property_class','prop_class','property_use','year_built','construction_year','lot_area','acres','units','dwelling_units','building_description','building_desc','building_class','land_description','land_assessment','land_value','improvement_assessment','improvement_value','assessed_value','total_assessment','annual_tax','property_tax','effective_tax_rate','sale_price','last_sale_price','sale_year','last_sale_year','sale_date','deed_date','deed_book','deed_page','sales_code','parcel_last_update','parcel_publication_date','pcl_mun','cd_code','additional_lots','facility_name','gis_pin','old_property_id','parcel_guid','shape_area','shape_length','lat','lon','latitude','longitude','treasury_code','district_code','lot_area_sqft','square_feet_lot']);
const noValue=new Set(['owner_name','mailing_address','mailing_city_state','mailing_zip','mailing_zip4']);
const directLive=new Set(['watchdog.building_age_years','watchdog.years_since_last_sale','watchdog.tax_to_assessment_rate','watchdog.land_share_pct','watchdog.improvement_share_pct','watchdog.assessment_per_acre','property.lot_area_sqft','watchdog.watchdog_score','watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score']);
function state(m){const src=String(m.source_id||''),f=String(m.field||''),id=String(m.id||'');if(src==='nj-parcels-modiv'&&noValue.has(f))return'unavailable';if(directLive.has(id))return'live';if(src==='nj-parcels-modiv'&&parcelFields.has(f))return'live';if(sourceLive.has(src)){if(src.startsWith('njdep-')&&!m.source_layer)return'planned';return'live'}return'planned'}
const c={live:0,planned:0,unavailable:0};
for(const m of j.markers||[]){m.provider_status=state(m);m.provider_contract='workbench-hydrate-v11';c[m.provider_status]++}
j.provider_summary={...c,total:(j.markers||[]).length,coverage_pct:Number((c.live/Math.max(1,(j.markers||[]).length)*100).toFixed(1)),contract:'workbench-hydrate-v11'};
j.provider_status_definition={live:'A connected resolver can check this marker.',planned:'Cataloged marker without a connected resolver path.',unavailable:'Connected source does not supply this field.'};
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
console.log(j.provider_summary);
