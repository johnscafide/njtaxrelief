#!/usr/bin/env python3
"""Build the v0.31 New Jersey bulk-data Pro+ marker contract.

This contract deliberately distinguishes fields the platform can ingest from
official statewide feeds from derived screening signals.  It never converts a
government map, permit or program record into a legal, valuation, lending,
insurance, eligibility, zoning or title conclusion.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKERS = []

AUDIENCES = {
    'permits': ['attorney','title','agent','lender','appraiser','contractor','investor'],
    'development': ['agent','lender','appraiser','contractor','investor','municipal'],
    'housing': ['agent','lender','investor','municipal','attorney'],
    'planning': ['attorney','title','agent','contractor','investor','municipal'],
}

def public(source, key, label, category, scope, audiences, tier='pro_plus', reason='Authoritative statewide public-record context for professional review.'):
    MARKERS.append({
        'id': f'njplus.{source}.{key}', 'label': label, 'description': reason,
        'category': category, 'scope': scope, 'tier': tier, 'origin': 'public',
        'professions': audiences, 'source_id': source, 'field': key,
        'source_field': key, 'professional_reason': reason,
    })

def derived(source, key, label, category, scope, audiences, formula, reason, tier='pro_plus'):
    MARKERS.append({
        'id': f'watchdog.njplus.{key}', 'label': label, 'description': reason,
        'category': category, 'scope': scope, 'tier': tier, 'origin': 'watchdog-derived',
        'professions': audiences, 'source_id': 'watchdog-nj-source-v031', 'field': key,
        'formula': formula, 'professional_reason': reason, 'unit': 'score / 100',
        'dependencies': [source],
    })

SPECS = [
 ('nj-dca-permits-raw', 'construction permits', 'permits', 'property', AUDIENCES['permits'], [
  ('permit_issued_count','Permit issued count'),('certificate_count','Certificate count'),('latest_permit_date','Latest permit date'),('latest_certificate_date','Latest certificate date'),('permit_type_mix','Permit type mix'),('use_group_mix','Use-group mix'),('authorized_construction_cost','Authorized construction cost'),('authorized_square_feet','Authorized square feet'),('rental_units_gained','Rental units gained'),('sale_units_gained','For-sale units gained')], [
  ('permit_to_certificate_lag','Permit-to-certificate lag','normalized(days_between(latest_permit, latest_certificate))','Shows public lifecycle timing; it is not a construction-completion finding.'),
  ('construction_scope_signal','Construction Scope Signal','weighted(authorized_construction_cost, authorized_square_feet, permit_type_mix)','Makes recorded project scope easier to triage.'),
  ('permit_activity_momentum','Permit Activity Momentum','weighted(rolling_12m_permits, rolling_36m_permits)','Shows whether recorded activity is accelerating or cooling.'),
  ('certificate_gap_priority','Certificate Gap Priority','weighted(open_permit_count, oldest_open_permit_age)','Prioritizes public permit/certificate follow-up without treating a gap as a violation.')]),
 ('nj-dca-development-trends', 'development trends', 'development', 'municipality', AUDIENCES['development'], [
  ('housing_units_authorized','Housing units authorized'),('new_housing_units_authorized','New-construction units authorized'),('office_square_feet_authorized','Office square feet authorized'),('retail_square_feet_authorized','Retail square feet authorized'),('other_nonresidential_square_feet','Other nonresidential square feet authorized'),('construction_cost_authorized','Construction cost authorized'),('demolitions','Demolitions'),('certificate_of_occupancy_count','Certificates of occupancy'),('rental_units_created','Rental units created'),('for_sale_units_created','For-sale units created')], [
  ('development_pipeline_velocity','Development Pipeline Velocity','weighted(yoy_units_authorized, yoy_construction_cost)','Summarizes the direction of reported local development activity.'),
  ('housing_supply_delivery_ratio','Housing Supply Delivery Ratio','certificates_of_occupancy / max(housing_units_authorized, 1)','Compares reported completions with authorized units; it is not a future supply forecast.'),
  ('commercial_buildout_signal','Commercial Buildout Signal','weighted(office_square_feet_authorized, retail_square_feet_authorized, other_nonresidential_square_feet)','Creates a consistent commercial construction screen.'),
  ('demolition_redevelopment_watch','Demolition Redevelopment Watch','weighted(demolitions, new_housing_units_authorized, construction_cost_authorized)','Signals where local public construction records merit a redevelopment review.')]),
 ('nj-dca-new-home-warranty', 'new home warranties', 'housing', 'municipality', AUDIENCES['housing'], [
  ('new_home_warranty_enrollments','New-home warranty enrollments'),('new_home_warranty_average_price','Average new-home price'),('new_home_warranty_median_price','Median new-home price'),('new_home_warranty_sales_count','New-home sales count'),('new_home_warranty_quarter','Warranty report quarter'),('new_home_warranty_year','Warranty report year'),('new_home_warranty_price_change','New-home price change'),('new_home_warranty_enrollment_change','Warranty enrollment change'),('new_home_warranty_county_rank','County warranty enrollment rank'),('new_home_warranty_municipal_rank','Municipal warranty enrollment rank')], [
  ('new_build_price_pressure','New-Build Price Pressure','normalized(new_home_warranty_price_change)','Shows reported new-home price movement, not a price forecast.'),
  ('new_build_delivery_momentum','New-Build Delivery Momentum','weighted(enrollment_change, sales_count_change)','Summarizes reported warranty enrollment momentum.'),
  ('new_build_market_depth','New-Build Market Depth','normalized(new_home_warranty_sales_count)','Shows the depth of available reported new-home transactions.'),
  ('new_build_comp_context','New-Build Comparable Context','weighted(sales_count, median_price_recency, price_dispersion)','Shows how much reported new-home evidence is available for a comparison conversation.')]),
 ('nj-dca-municipal-housing-profile', 'municipal housing profiles', 'housing', 'municipality', AUDIENCES['housing'], [
  ('housing_stock','Housing stock'),('owner_occupied_share','Owner-occupied share'),('renter_occupied_share','Renter-occupied share'),('vacancy_rate','Vacancy rate'),('median_gross_rent','Median gross rent'),('median_home_value','Median home value'),('housing_cost_burden_share','Housing cost burden share'),('eviction_rate','Eviction rate'),('housing_production','Housing production'),('household_growth','Household growth')], [
  ('rental_market_pressure','Rental Market Pressure','weighted(vacancy_rate inverse, rent_change, eviction_rate)','Presents public housing conditions for market research; not tenant screening.'),
  ('housing_affordability_gap','Housing Affordability Gap','weighted(housing_cost_burden_share, income_to_rent_gap)','Highlights municipal-level public affordability context.'),
  ('housing_supply_balance','Housing Supply Balance','weighted(housing_production, household_growth, vacancy_rate)','Summarizes public supply and demand context; it is not a rent or home-value forecast.'),
  ('municipal_housing_evidence_depth','Municipal Housing Evidence Depth','coverage(profile_fields)','Shows whether a municipal housing brief has a complete published data footprint.')]),
 ('nj-dca-affordable-housing', 'affordable housing monitoring', 'housing', 'municipality', AUDIENCES['housing'], [
  ('affordable_units_total','Affordable units total'),('affordable_units_rental','Affordable rental units'),('affordable_units_for_sale','Affordable for-sale units'),('affordable_units_pipeline','Affordable units in pipeline'),('affordable_trust_fund_balance','Affordable housing trust-fund balance'),('low_income_households','Low-income households'),('moderate_income_households','Moderate-income households'),('hud_subsidized_units','HUD-subsidized units'),('low_income_cost_burden','Low-income cost burden'),('affordable_housing_reporting_status','Affordable housing reporting status')], [
  ('affordable_supply_coverage','Affordable Supply Coverage','affordable_units_total / max(low_income_households, 1)','Compares reported units with reported households; not a compliance opinion.'),
  ('affordable_pipeline_signal','Affordable Pipeline Signal','weighted(affordable_units_pipeline, trust_fund_balance)','Summarizes reported affordable-housing capacity under monitoring.'),
  ('rent_support_context','Rent Support Context','weighted(hud_subsidized_units, affordable_units_rental)','Provides municipal support context, never household eligibility.'),
  ('housing_program_record_freshness','Housing Program Record Freshness','age(affordable_housing_reporting_status)','Shows when published program data should be refreshed before reliance.')]),
 ('nj-dca-community-assets', 'community assets and designations', 'planning', 'property', AUDIENCES['planning'], [
  ('transit_station_access','Transit-station access'),('bus_terminal_access','Bus-terminal access'),('hospital_access','Hospital access'),('college_access','College access'),('park_access','Park access'),('library_access','Library access'),('opportunity_zone_status','Opportunity Zone status'),('urban_enterprise_zone_status','Urban Enterprise Zone status'),('transit_village_status','Transit Village status'),('redevelopment_area_status','Redevelopment-area status')], [
  ('amenity_access_profile','Amenity Access Profile','weighted(transit, hospital, college, park, library proximity)','Makes state-mapped community amenities comparable without asserting neighborhood quality.'),
  ('development_designation_stack','Development Designation Stack','count(opportunity_zone, urban_enterprise_zone, transit_village, redevelopment_area)','Counts state/federal designation contexts for professional research.'),
  ('public_facility_proximity_signal','Public Facility Proximity Signal','weighted(hospital_access, library_access, park_access)','Creates an explainable public-facility proximity summary.'),
  ('site_marketing_context','Site Marketing Context','weighted(amenity_access_profile, development_designation_stack)','Packages sourced location context for an agent or investor brief, not a valuation.')]),
 ('nj-dca-zoning-directory', 'zoning information directory', 'planning', 'municipality', AUDIENCES['planning'], [
  ('zoning_map_url','Official zoning-map link'),('zoning_ordinance_url','Zoning-ordinance link'),('zoning_officer_contact','Zoning officer contact'),('zoning_map_last_checked','Zoning-map last checked'),('municipal_zoning_portal','Municipal zoning portal'),('redevelopment_plan_link','Redevelopment-plan link'),('master_plan_link','Master-plan link'),('planning_board_link','Planning-board link'),('land_use_board_link','Land-use board link'),('zoning_directory_status','Zoning-directory status')], [
  ('zoning_research_readiness','Zoning Research Readiness','coverage(zoning_map_url, zoning_ordinance_url, zoning_officer_contact, master_plan_link)','Measures the completeness of linked public zoning resources—not permitted use.'),
  ('planning_document_currency','Planning Document Currency','age(zoning_map_last_checked, master_plan_link)','Flags linked resources that may need direct municipal confirmation.'),
  ('development_entitlement_entrypoint','Development Entitlement Entrypoint','coverage(planning_board_link, land_use_board_link, redevelopment_plan_link)','Makes the public starting points for entitlement research scannable.'),
  ('municipal_land_use_transparency','Municipal Land-Use Transparency','weighted(zoning_research_readiness, planning_document_currency inverse)','Summarizes availability of public links, not the quality of a municipality.')]),
 ('nj-dca-pilot-forecast', 'PILOT financial agreements', 'municipal finance', 'municipality', ['attorney','agent','lender','appraiser','investor','municipal'], [
  ('pilot_agreement_count','PILOT agreement count'),('pilot_project_count','PILOT project count'),('pilot_project_assessment','PILOT project assessment'),('pilot_payment_schedule','PILOT payment schedule'),('pilot_term_remaining','PILOT term remaining'),('pilot_expiration_year','PILOT expiration year'),('pilot_revenue_projection','PILOT revenue projection'),('pilot_forecast_year','PILOT forecast year'),('pilot_project_type','PILOT project type'),('pilot_municipal_share','PILOT municipal share')], [
  ('pilot_rolloff_watch','PILOT Rolloff Watch','weighted(term_remaining inverse, revenue_projection)','Highlights when published agreement terms approach expiration.'),
  ('pilot_revenue_concentration','PILOT Revenue Concentration','pilot_project_assessment / max(municipal_tax_base, 1)','Shows public PILOT exposure relative to the published tax base.'),
  ('pilot_forecast_confidence','PILOT Forecast Confidence','coverage(payment_schedule, term_remaining, forecast_year)','Shows the completeness of an available public forecast—not a revenue prediction.'),
  ('development_incentive_profile','Development Incentive Profile','weighted(pilot_project_count, project_type_mix, revenue_projection)','Summarizes published PILOT activity for municipal or investment research.')]),
 ('nj-dca-modiv-longitudinal', 'MOD-IV longitudinal database', 'assessment', 'property', ['attorney','title','agent','lender','appraiser','investor','municipal'], [
  ('assessment_history_depth','Assessment-history depth'),('assessment_land_history','Land-assessment history'),('assessment_improvement_history','Improvement-assessment history'),('assessment_total_history','Total-assessment history'),('property_class_history','Property-class history'),('exemption_code_history','Exemption-code history'),('added_assessment_history','Added-assessment history'),('omitted_assessment_history','Omitted-assessment history'),('parcel_record_change_count','Parcel-record change count'),('assessment_record_years','Assessment record years')], [
  ('assessment_change_trace','Assessment Change Trace','ordered(assessment_land_history, assessment_improvement_history, assessment_total_history)','Organizes published assessment history for professional review.'),
  ('parcel_record_volatility','Parcel Record Volatility','normalized(parcel_record_change_count, property_class_history)','Shows the amount of public-record movement, not a property-condition finding.'),
  ('assessment_component_shift','Assessment Component Shift','Latest consecutive published MOD-IV transition: normalize the land-share change minus improvement-share change across the full possible -200 to +200 percentage-point differential into 0-100; 50 is unchanged composition; no synthetic years.','Flags changes in published assessment composition for review.'),
  ('assessment_history_reliability','Assessment History Reliability','weighted(assessment_history_depth, source_freshness, parcel_identity_confidence)','Shows the strength of available historical public assessment context.')]),
 ('nj-dca-neighborhood-trends', 'neighborhood trends', 'housing', 'municipality', AUDIENCES['housing'], [
  ('population_change','Population change'),('employment_density','Employment density'),('household_income','Household income'),('home_value_change','Home-value change'),('real_estate_tax_median','Median real-estate tax'),('walkability_score','Walkability score'),('rental_cost_change','Rental-cost change'),('housing_unit_change','Housing-unit change'),('commute_mode_mix','Commute-mode mix'),('neighborhood_trend_year','Neighborhood trend year')], [
  ('local_demand_context','Local Demand Context','weighted(population_change, employment_density, household_income trend)','Summarizes public area trends; it never profiles individuals or protected classes.'),
  ('household_cost_context','Household Cost Context','weighted(real_estate_tax_median, rental_cost_change, home_value_change)','Provides broad municipal or area cost context, not affordability advice.'),
  ('accessibility_context','Accessibility Context','weighted(walkability_score, commute_mode_mix, transit_station_access)','Makes public mobility context easier to compare.'),
  ('neighborhood_trend_freshness','Neighborhood Trend Freshness','age(neighborhood_trend_year)','Shows the vintage of published neighborhood trend context.')]),
 ('njdep-csrr-gis', 'contaminated site remediation GIS', 'environment', 'property', ['attorney','title','agent','lender','appraiser','contractor','investor','insurance'], [
  ('kcsl_case_status','Known-contaminated-site case status'),('kcsl_program_interest','Contaminated-site program interest'),('kcsl_remediation_phase','Remediation phase'),('kcsl_remediation_status','Remediation status'),('kcsl_site_id','Contaminated-site site identifier'),('deed_notice_reference','Environmental deed-notice reference'),('cea_reference','Groundwater CEA reference'),('ust_facility_reference','UST facility reference'),('brownfield_inventory_status','Brownfield inventory status'),('environmental_layer_vintage','Environmental layer vintage')], [
  ('environmental_record_resolution','Environmental Record Resolution','coverage(kcsl_case_status, remediation_phase, remediation_status, deed_notice_reference)','Shows whether a public environmental screen has usable detail; it is not an environmental clearance.'),
  ('environmental_case_activity','Environmental Case Activity','weighted(remediation_phase, remediation_status, source_freshness)','Prioritizes cases for review from official record status.'),
  ('brownfield_reuse_context','Brownfield Reuse Context','weighted(brownfield_inventory_status, remediation_status, redevelopment_area_status)','Highlights public redevelopment context without indicating suitability.'),
  ('environmental_source_currency','Environmental Source Currency','age(environmental_layer_vintage)','Shows when a professional should refresh the official environmental source.')]),
]

for source, _source_label, category, scope, audience, fields, calculations in SPECS:
    for key, label in fields:
        public(source, key, label, category, scope, audience,
               reason=f'Published { _source_label } data for professional review; verify the official record before reliance.')
    for key, label, formula, reason in calculations:
        derived(source, key, label, category, scope, audience, formula, reason)

assert len(MARKERS) == 154, len(MARKERS)
assert len({m['id'] for m in MARKERS}) == len(MARKERS)
doc = {
    'schema_version': 1, 'version': '0.31.0', 'released': '2026-08-07',
    'definition': '154 governed New Jersey source-expansion markers across statewide DCA and NJDEP datasets. Direct fields remain public-record facts; Watchdog calculations only prioritize research. They are not legal, zoning, title, appraisal, environmental, lending, insurance, investment, eligibility or transaction determinations.',
    'activation_rule': 'A source-marked field is shown only after the source-specific refresh and quality gate succeed. Catalog inclusion never means live coverage.',
    'markers': MARKERS,
}
(ROOT / 'data' / 'nj-proplus-source-pack-v031.json').write_text(json.dumps(doc, indent=2) + '\n')
print(json.dumps({'total': len(MARKERS), 'public': sum(m['origin']=='public' for m in MARKERS), 'derived': sum(m['origin']=='watchdog-derived' for m in MARKERS)}, indent=2))
