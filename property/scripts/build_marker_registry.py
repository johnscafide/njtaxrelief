#!/usr/bin/env python3
"""Build the public Watchdog marker catalog from fields already implemented in /property."""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
markers = []

PROF = {
    "consumer": "Homeowner / buyer", "attorney": "Attorney", "title": "Title / closing",
    "agent": "Real estate agent", "lender": "Mortgage lender / broker", "appraiser": "Appraiser",
    "contractor": "Contractor / developer", "investor": "Investor / portfolio", "municipal": "Municipal professional"
}

def add(mid, label, category, scope, tier, origin, professions, source, description="", field=None):
    markers.append({"id":mid,"label":label,"description":description or label,"category":category,
        "scope":scope,"tier":tier,"origin":origin,"proprietary":origin=="watchdog-derived",
        "professions":professions,"source_id":source,"status":"live","field":field or mid.split('.')[-1]})

# The saved-property / parcel model surfaced in dashboard + report.
core = [
 ("address","Street address","standard"),("municipality","Municipality","standard"),("county","County","standard"),
 ("block","Tax block","standard"),("lot","Tax lot","standard"),("qualifier","Lot qualifier","pro"),
 ("pams_pin","NJ parcel identifier","pro"),("property_class","Property class","standard"),("land_assessment","Land assessment","standard"),
 ("improvement_assessment","Improvement assessment","standard"),("assessed_value","Total assessed value","standard"),
 ("annual_tax","Annual property tax","standard"),("market_value","Estimated market value","standard"),("owner_name","Owner name on record","pro"),
 ("sale_price","Last sale price","standard"),("sale_date","Last sale date","standard"),("deed_book","Deed book","pro"),("deed_page","Deed page","pro"),
 ("year_built","Year built","standard"),("square_feet","Square feet","standard"),("lot_area","Lot area","pro"),("building_description","Building description","pro"),
 ("lat","Latitude","pro"),("lon","Longitude","pro"),("treasury_code","Treasury municipality code","pro")]
for f,l,t in core: add('property.'+f,l,'parcel','property',t,'public',['consumer','attorney','title','agent','lender','appraiser','contractor','investor'],'nj-parcels-modiv',field=f)

# Annual tax rates are individually selectable Data Center columns.
for y in range(2016,2026):
    add(f'tax.rate_{y}',f'{y} general tax rate','tax','municipality','standard' if y>=2024 else 'pro','public',['consumer','attorney','agent','lender','appraiser','investor','municipal'],'nj-division-taxation')

for f,l in [("ratio","Verified-sale assessment ratio"),("sample_size","Verified-sale sample size"),("median_price","Median verified sale price"),("p25","25th percentile sale price"),("p75","75th percentile sale price"),("ppsf","Median price per square foot"),("drift","Assessment-to-sale-price drift")]:
    add('sales.'+f,l,'sales','municipality','pro','public',['agent','lender','appraiser','investor','attorney'],'nj-sr1a')

for f,l,t,o in [
 ('watchdog_score','Watchdog Score','standard','watchdog-derived'),('fairness_score','Assessment Fairness Index','standard','watchdog-derived'),
 ('market_value_estimate','Watchdog market value estimate','standard','watchdog-derived'),('chapter123_position','Chapter 123 position','standard','watchdog-derived'),
 ('effective_tax_rate','Effective tax rate on estimated market value','standard','watchdog-derived'),
 ('chapter123_lower_bound','Chapter 123 lower bound','pro','watchdog-derived'),('chapter123_upper_bound','Chapter 123 upper bound','pro','watchdog-derived'),
 ('assessment_drift','Assessment drift signal','pro','watchdog-derived'),('reassessment_risk','Reassessment risk score','pro','watchdog-derived'),
 ('improvement_ratio','Improvement-to-total ratio','pro','watchdog-derived'),('tax_trajectory','Tax trajectory','pro','watchdog-derived'),
 ('tax_pressure','Tax pressure score','pro','watchdog-derived'),('town_percentile','Town percentile','pro','watchdog-derived'),
 ('appeal_odds','Appeal odds','pro','watchdog-derived'),('true_cost','True ownership cost','pro','watchdog-derived'),
 ('closing_cost_estimate','Buyer closing-cost estimate','pro','watchdog-derived'),('added_omitted_risk','Added/omitted assessment risk','pro','watchdog-derived'),
 ('abatement_exposure','Abatement exposure signal','pro','watchdog-derived'),('exempt_pilot_exposure','Exempt/PILOT exposure signal','pro','watchdog-derived'),
 ('revaluation_risk','Revaluation radar risk','pro','watchdog-derived'),('investor_screen','Investor screen score','pro','watchdog-derived')]:
    add('watchdog.'+f,l,'watchdog intelligence','property' if f not in ('town_percentile','tax_pressure','revaluation_risk') else 'municipality',t,o,['consumer','attorney','agent','lender','appraiser','investor'],'watchdog-models')

# County appeal outcome fields, latest plus each historical year already shipped in appeals.json.
appeal_fields = [('total','Appeals filed'),('wins','Assessment reductions'),('affirmed','Assessments affirmed'),('withdrawn','Appeals withdrawn'),('dismissed','Appeals dismissed'),('stipulated','Stipulated outcomes'),('revised','Revised outcomes'),('residential','Residential appeals'),('commercial','Commercial appeals'),('residential_share','Residential appeal share'),('assessed_appealed','Assessment value appealed'),('total_reduction','Total assessment reduction'),('avg_reduction_per_win','Average reduction per win'),('pct_of_value_cut','Percent of appealed value reduced'),('win_rate_decided','Win rate among decided appeals'),('win_rate_filed','Win rate among filed appeals')]
for f,l in appeal_fields:
    add('appeals.latest_'+f,'Latest '+l,'appeals','county','pro','public',['attorney','agent','lender','appraiser','investor'],'nj-tax-court-appeals')
    for y in range(2016,2026): add(f'appeals.{f}_{y}',f'{y} {l}','appeals','county','pro_plus' if y<2021 else 'pro','public',['attorney','agent','appraiser','investor','municipal'],'nj-tax-court-appeals')

# Uniformity / COD current + time series.
for f,l in [('coefficient','Coefficient of deviation'),('general','General assessment ratio'),('commercial','Commercial assessment ratio'),('vacant','Vacant-land assessment ratio'),('sales','Usable sales count'),('score','Uniformity score'),('percentile','Uniformity percentile'),('volatility','Uniformity volatility')]:
    add('uniformity.'+f,l,'assessment uniformity','municipality','pro','watchdog-derived' if f in ('score','percentile','volatility') else 'public',['attorney','agent','lender','appraiser','investor','municipal'],'nj-cod')
for y in range(2016,2026): add(f'uniformity.cod_{y}',f'{y} coefficient of deviation','assessment uniformity','municipality','pro_plus','public',['attorney','lender','appraiser','investor','municipal'],'nj-cod')

# Municipal budget / ratable pressure fields already generated in budget-pressure.json.
budget = [
 ('current_appropriation','Current appropriation'),('prior_appropriation','Prior appropriation'),('appropriation_growth','Appropriation growth'),
 ('collection_rate','Tax collection rate'),('debt_payment','Debt payment'),('debt_service_share','Debt-service share'),('net_debt_pct','Net debt percent'),
 ('structural_imbalance','Structural budget imbalance'),('structural_imbalance_share','Structural imbalance share'),('municipal_share','Municipal levy share'),
 ('county_share','County levy share'),('school_share','School levy share'),('total_levy_cagr','Total levy CAGR'),('municipal_levy_cagr','Municipal levy CAGR'),
 ('county_levy_cagr','County levy CAGR'),('school_levy_cagr','School levy CAGR'),('equalized_value_cagr','Equalized-value CAGR'),('ratable_growth','Ratable-base growth'),
 ('levy_base_gap','Levy/base growth gap'),('total_levy_change','Total levy change'),('pressure_score','Municipal budget-pressure score'),('pressure_band','Municipal budget-pressure band')]
for f,l in budget: add('budget.'+f,l,'municipal finance','municipality','pro','watchdog-derived' if f in ('pressure_score','pressure_band','structural_imbalance','structural_imbalance_share','levy_base_gap') else 'public',['attorney','agent','lender','appraiser','investor','municipal'],'nj-dca-budget')

# Exempt/PILOT/abatement fields already generated and exposed by the app.
for f,l in [('exempt_value','Exempt assessed value'),('exempt_share','Exempt share of assessed base'),('exempt_nonpilot_value','Non-PILOT exempt value'),('pilot_count','PILOT count'),('pilot_billing','PILOT billing'),('pilot_assessed_value','PILOT assessed value'),('pilot_value_share','PILOT value share'),('partial_exemptions_abatements','Partial exemptions / abatements'),('partial_relief_share','Partial relief share'),('municipal_subsidy','Municipal tax-base subsidy estimate'),('subsidy_budget_share','Subsidy share of municipal budget'),('tax_if_conventional','Tax if conventionally taxable'),('exempt_percentile','Exempt-share percentile'),('pilot_percentile','PILOT-share percentile'),('subsidy_percentile','Subsidy percentile')]:
    derived=f in ('exempt_share','pilot_value_share','partial_relief_share','municipal_subsidy','subsidy_budget_share','tax_if_conventional','exempt_percentile','pilot_percentile','subsidy_percentile')
    add('exemption.'+f,l,'exemptions & PILOT','municipality','pro_plus' if derived else 'pro','watchdog-derived' if derived else 'public',['attorney','agent','lender','appraiser','investor','municipal'],'nj-abstract-pilot')
for f,l in [('total_base','Total assessment base'),('net_base','Net taxable base'),('land','Land assessment base'),('improvements','Improvement assessment base'),('abated','Abated assessment'),('abated_share','Abated share'),('percentile','Abatement percentile'),('vs_median','Abatement vs statewide median')]:
    add('abatement.'+f,l,'abatements','municipality','pro','watchdog-derived' if f in ('abated_share','percentile','vs_median') else 'public',['attorney','agent','lender','appraiser','investor','municipal'],'nj-tax-abstract')

# Live professional preflight fields (the state endpoints are queried at report time).
for f,l,cat in [
 ('permit_count','DCA permit record count','permits'),('open_permit_count','Permit-issued / certificate gap count','permits'),('latest_permit_date','Latest permit date','permits'),
 ('contaminated_site_500m','Known contaminated sites within 500m','environment'),('deed_notice_hit','NJDEP deed-notice intersection','environment'),('cea_hit','Groundwater CEA intersection','environment'),
 ('ust_250m','Underground storage-tank sites within 250m','environment'),('tidelands_reference_hit','Tidelands reference intersection','title & land'),('highlands_hit','Highlands area intersection','development'),('pinelands_hit','Pinelands area intersection','development'),
 ('fema_flood_zone','FEMA/NFHL flood-zone intersection','flood'),('tidal_cafe_hit','Tidal climate-adjusted flood elevation hit','flood'),('wetlands_2012_hit','NJDEP 2012 wetlands reference hit','wetlands'),('epa_priority_wetland_hit','EPA Priority Wetlands hit','wetlands')]:
    add('preflight.'+f,l,cat,'property','pro_plus','public',['attorney','title','agent','lender','appraiser','contractor','investor'],'njdep-dca-live')

# New professional workflow calculations in this release.
for f,l,cat in [('escrow_scenario_tax','Scenario annual tax','lending'),('escrow_monthly_delta','Scenario monthly escrow delta','lending'),('escrow_reserve_12m','12-month escrow-shock reserve','lending'),('escrow_shock_band','Escrow-shock band','lending'),('lien_search_completion','Municipal search completion','closing'),('lien_open_items','Open municipal-search items','closing'),('lien_issue_count','Municipal-search issue count','closing'),('constraint_stack_count','Development-constraint stack count','development')]:
    add('watchdog.'+f,l,cat,'property','pro_plus','watchdog-derived',['attorney','title','agent','lender','contractor','investor'],'watchdog-professional')

summary={"total":len(markers),"public_source":sum(m['origin']=='public' for m in markers),"proprietary_derived":sum(m['proprietary'] for m in markers)}
summary['by_tier']={t:sum(m['tier']==t for m in markers) for t in ('standard','pro','pro_plus')}
summary['by_profession']={p:sum(p in m['professions'] for m in markers) for p in PROF}
summary['percent_of_goal']=round(len(markers)/10,1)
doc={"schema_version":1,"generated_at":datetime.now().astimezone().isoformat(timespec='seconds'),"target_markers":1000,"definition":"One marker is one distinct selectable field or calculated statistic; repeated parcel/town values are not counted as new markers.","tier_rule":"Standard sees Standard. Pro sees Standard + profession-relevant Pro. Pro+ sees every marker.","summary":summary,"professions":[{"id":k,"label":v} for k,v in PROF.items()],"markers":markers}
(ROOT/'data'/'marker-registry.json').write_text(json.dumps(doc,indent=2)+'\n')
print(json.dumps(summary,indent=2))
