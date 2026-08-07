#!/usr/bin/env python3
"""Build Watchdog's v0.25 institutional marker contract."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M = []
BROAD = ['attorney','title','agent','lender','appraiser','contractor','investor','insurance']

def public(mid,label,category,source,layer,prof=None,tier='pro_plus',scope='property',reason='Adds an authoritative public-record fact to professional due diligence.'):
    M.append(dict(id=mid,label=label,description=label,category=category,scope=scope,tier=tier,origin='public',professions=prof or BROAD,source_id=source,source_layer=str(layer),field=mid.split('.')[-1],professional_reason=reason))

def derived(mid,label,category,prof,formula,reason,tier='pro_plus',scope='property'):
    M.append(dict(id='watchdog.'+mid,label=label,description=reason,category=category,scope=scope,tier=tier,origin='watchdog-derived',professions=prof,source_id='watchdog-institutional',field=mid,formula=formula,professional_reason=reason,unit='score / 100'))

# NJDEP Geology — direct observations from the public ArcGIS service.
for args in [
('geology.abandoned_mine_within_1km','Abandoned mine within 1 km','geology',0),('geology.bedrock_aquifer','Bedrock aquifer','geology',13),
('geology.bedrock_geology','Bedrock geology','geology',14),('geology.groundwater_recharge_rank','Groundwater recharge rank','water & geology',18),
('geology.sole_source_aquifer','Sole-source aquifer','water & geology',19),('geology.surficial_aquifer','Surficial aquifer','water & geology',23),
('geology.surficial_geology','Surficial geology','geology',25),('geology.historic_fill_hit','Historic fill intersection','geology',22),
('geology.acid_producing_soil_hit','Potential acid-producing soil intersection','geology',27),('geology.physiographic_province','Physiographic province','geology',20),
('geology.landslide_within_1km','Mapped landslide within 1 km','geology',1),('geology.bedrock_outcrop_hit','Bedrock outcrop intersection','geology',16),
('geology.fault_within_500m','Mapped fault within 500 m','geology',6),('geology.quarry_within_1500m','Mapped quarry within 1.5 km','geology',3),
('geology.soil_mapping_hit','NJDEP soil mapping coverage','geology',11)]: public(args[0],args[1],args[2],'njdep-geology-live',args[3])

# NJDEP Hydrography — water, wellhead and state flood-plan context.
for args in [
('water.wellhead_community_tier','Community wellhead protection tier','water protection',25),('water.wellhead_community_travel_time','Community wellhead travel-time band','water protection',25),
('water.wellhead_noncommunity_tier','Non-community wellhead protection tier','water protection',26),('water.wellhead_noncommunity_travel_time','Non-community wellhead travel-time band','water protection',26),
('water.groundwater_treatment_source_area','Groundwater treatment source-water area','water protection',27),('water.category1_water_within_500m','Category One water within 500 m','water protection',6),
('water.flood_profile_within_500m','State flood profile within 500 m','flood',29),('water.flood_plan_locator_hit','State flood-plan locator intersection','flood',28),
('water.surface_spring_within_1km','Mapped surface spring within 1 km','water & geology',34),('water.water_source_area','Water source area','water protection',16),
('water.watershed_huc11','HUC11 watershed','watershed',17),('water.subwatershed_huc14','HUC14 subwatershed','watershed',22)]: public(args[0],args[1],args[2],'njdep-hydro-live',args[3])

# NJDEP Land — land-use, historic-resource and mitigation context.
for args in [
('land.open_space_hit','Open-space parcel intersection','land use',65),('land.open_space_encumbrance','Open-space encumbrance status','land use',65),
('land.historic_property_hit','Historic property intersection','historic resources',55),('land.historic_district_hit','Historic district intersection','historic resources',57),
('land.archaeological_grid_hit','Archaeological site-grid screening hit','historic resources',56),('land.wetland_mitigation_bank_hit','Wetland mitigation bank intersection','wetlands',72),
('land.wetland_mitigation_service_area','Wetland mitigation service-area intersection','wetlands',70),('land.natural_area_preserve_hit','State natural-area preserve intersection','land use',80),
('land.open_space_within_500m','Open space within 500 m','land use',65),('land.wetlands_loi_hit','Wetlands Letter-of-Interpretation coverage','wetlands',21)]: public(args[0],args[1],args[2],'njdep-land-live',args[3])

# Existing official municipal-finance ingestion, promoted into selectable history markers.
for y in range(2021,2026): public(f'budget.total_levy_{y}',f'{y} total tax levy','municipal finance','nj-dca-budget','historical',['attorney','agent','lender','appraiser','investor','municipal'],'pro' if y>=2024 else 'pro_plus','municipality','Shows the actual municipal tax-carry trajectory behind today’s bill.')
for stem,label,prof in [('municipal_levy','municipal levy',['agent','lender','investor','municipal']),('school_levy','school levy',['agent','lender','investor','municipal']),('county_levy','county levy',['agent','lender','investor','municipal']),('tax_base','equalized tax base',['agent','lender','appraiser','investor','municipal'])]:
    for y in (2024,2025): public(f'budget.{stem}_{y}',f'{y} {label}','municipal finance','nj-dca-budget','historical',prof,'pro','municipality')

# Attorney + title (10)
for x in [
('environmental_encumbrance_severity','Environmental Encumbrance Severity','legal diligence',['attorney','title'],'weighted(deed_notice, CEA, contaminated_site, UST)','Prioritizes environmental public-record exceptions for counsel/title review.'),
('title_constraint_stack','Title Constraint Stack','title diligence',['attorney','title'],'count(tidelands, deed_notice, historic, wetlands_LOI, open_space_encumbrance)','Surfaces overlapping public-record constraints before closing.'),
('permit_closure_confidence','Permit Closure Confidence','legal diligence',['attorney','title'],'100 - normalized(open_permit_gap / permit_count)','Focuses closing review on permit/certificate gaps.'),
('source_authority_coverage','Source Authority Coverage','evidence quality',['attorney','title','appraiser'],'authoritative_fields / required_fields * 100','Shows how much of a diligence brief is backed by authoritative sources.'),
('parcel_identity_confidence','Parcel Identity Confidence','evidence quality',['attorney','title','appraiser'],'matched(address, municipality, block, lot, qualifier, PAMS_PIN) / 6 * 100','Reduces wrong-parcel risk before professional analysis.'),
('appeal_case_readiness','Appeal Case Readiness','appeals',['attorney','appraiser'],'weighted(comparable_depth, evidence_strength, chapter123_margin, deadline_readiness)','Packages appeal evidence prerequisites into one readiness signal.'),
('chapter123_margin_stability','Chapter 123 Margin Stability','appeals',['attorney','appraiser'],'100 - normalized(abs(current_margin - historical_margin))','Separates a persistent assessment signal from a one-period anomaly.'),
('evidence_chain_completeness','Evidence Chain Completeness','legal diligence',['attorney','appraiser'],'verified_sources / required_evidence_sources * 100','Makes missing source support visible before reliance.'),
('filing_deadline_risk','Filing Deadline Risk','appeals',['attorney'],'deadline_proximity * readiness_gap','Highlights matters where incomplete evidence and time pressure overlap.'),
('closing_exception_priority','Closing Exception Priority','title diligence',['attorney','title'],'weighted(open_permits, title_constraints, environmental_encumbrance, flood_context)','Ranks public-record issues for a closing checklist without making a legal determination.')]: derived(*x,'pro')

# Lender / broker (8)
for x in [
('collateral_operating_cost_stress','Collateral Operating-Cost Stress','lending',['lender'],'weighted(tax_burden, levy_growth, escrow_volatility)','Shows when recurring public charges may materially change monthly housing cost.'),
('escrow_volatility_score','Escrow Volatility Score','lending',['lender'],'normalized(stddev(tax_history) + levy_growth_gap)','Turns multi-year tax movement into an escrow planning signal.'),
('collateral_tax_reset_sensitivity','Collateral Tax-Reset Sensitivity','lending',['lender'],'transaction_tax_shock * assessment_ratio_gap','Flags collateral where a reset scenario could materially alter taxes.'),
('municipal_fiscal_capacity','Municipal Fiscal Capacity','lending',['lender','investor'],'weighted(tax_base_growth, collection_rate, inverse_debt_share)','Provides consistent municipal-finance context for collateral review.'),
('collateral_constraint_burden','Collateral Constraint Burden','lending',['lender'],'normalized(count(flood, wetlands, geology, title, permit families))','Summarizes mapped constraint density for lender diligence.'),
('environmental_collateral_review','Environmental Collateral Review Priority','lending',['lender','insurance'],'weighted(environmental_encumbrance, water_protection_overlap)','Prioritizes collateral that warrants deeper environmental review.'),
('permit_collateral_completion','Permit Collateral Completion','lending',['lender'],'permit_closure_confidence * source_authority_coverage / 100','Combines permit lifecycle and source confidence for collateral files.'),
('five_year_tax_reserve_ratio','Five-Year Tax Reserve Ratio','lending',['lender'],'projected_5y_tax / current_annual_tax','Gives mortgage professionals a comparable reserve-planning ratio.')]: derived(*x,'pro' if x[0] in ('collateral_operating_cost_stress','escrow_volatility_score','collateral_tax_reset_sensitivity') else 'pro_plus')

# Real estate agent (8) — property/tax facts only; no protected-class or demographic scoring.
for x in [
('listing_tax_burden_percentile','Listing Tax-Burden Percentile','broker intelligence',['agent'],'percentile(effective_tax_rate within municipality)','Gives agents a defensible tax-position talking point.'),
('buyer_monthly_carry_delta','Buyer Monthly Carry Delta','broker intelligence',['agent'],'(scenario_annual_tax - current_annual_tax) / 12','Translates tax scenarios into the monthly number buyers budget for.'),
('preoffer_public_record_risk','Pre-Offer Public-Record Review','broker intelligence',['agent'],'weighted(permit_gap, flood, environmental, title_constraint_stack)','Identifies diligence questions before an offer without making legal conclusions.'),
('buyer_tax_reset_exposure','Buyer Tax-Reset Exposure','broker intelligence',['agent'],'transaction_tax_shock_index','Turns assessment/tax relationships into buyer planning context.'),
('seller_appeal_opportunity_signal','Seller Appeal Opportunity Signal','broker intelligence',['agent'],'appeal_opportunity_index * evidence_chain_completeness / 100','Helps agents recognize when a tax conversation deserves professional review.'),
('town_fiscal_story_score','Town Fiscal Story Score','broker intelligence',['agent'],'weighted(collection_rate, tax_base_growth, inverse_levy_base_gap)','Condenses sourced, non-demographic municipal finance context.'),
('transaction_diligence_completion','Transaction Diligence Completion','broker intelligence',['agent'],'completed_public_record_checks / required_checks * 100','Gives agents a transaction-research completion meter.'),
('property_story_confidence','Property Story Confidence','broker intelligence',['agent'],'weighted(source_authority_coverage, parcel_identity_confidence, record_completeness)','Shows whether the facts supporting a property brief are complete.')]: derived(*x,'pro')

# Investor (7)
for x in [
('carry_cost_downside','Carry-Cost Downside','investment',['investor'],'weighted(tax_growth, levy_base_gap, escrow_volatility)','Screens holdings for adverse recurring-cost momentum.'),
('municipal_concentration_risk','Municipal Concentration Risk','investment',['investor'],'portfolio_value_in_municipality / portfolio_value * fiscal_stress','Exposes portfolio concentration in a single municipal fiscal context.'),
('tax_base_absorption_risk','Tax-Base Absorption Risk','investment',['investor'],'normalized(max(0, levy_growth - tax_base_growth))','Flags levies rising faster than the equalized base.'),
('revaluation_reset_exposure','Revaluation Reset Exposure','investment',['investor'],'revaluation_risk * assessment_ratio_gap','Surfaces assets exposed to a valuation/reset event.'),
('regulatory_constraint_density','Regulatory Constraint Density','investment',['investor','contractor'],'distinct_constraint_layers / monitored_layers * 100','Provides a consistent cross-property regulatory screen.'),
('capital_improvement_activity','Capital Improvement Activity','investment',['investor'],'normalized(recent_permit_count)','Uses public permit activity as reinvestment context.'),
('fiscal_trend_momentum','Fiscal Trend Momentum','investment',['investor'],'weighted(tax_base_CAGR - levy_CAGR, collection_rate_change)','Condenses multi-year municipal-finance direction for portfolios.')]: derived(*x,'pro' if x[0] in ('carry_cost_downside','capital_improvement_activity') else 'pro_plus')

# Contractor / developer (7)
for x in [
('development_constraint_density','Development Constraint Density','development',['contractor'],'distinct(site_constraint_layers) / monitored_layers * 100','Compares the public-record diligence burden across sites.'),
('permitting_velocity','Permitting Velocity','development',['contractor'],'recent_permit_count / observation_months normalized','Shows relative permit activity using reported DCA records.'),
('certificate_closure_rate','Certificate Closure Rate','development',['contractor'],'closed_certificate_records / permit_records * 100','Highlights permit-to-certificate lifecycle completion.'),
('regulatory_overlap_score','Regulatory Overlap Score','development',['contractor'],'weighted(highlands, pinelands, wetlands, water_protection, historic, open_space)','Identifies sites where mapped regulatory programs overlap.'),
('site_water_constraint_score','Site Water Constraint Score','development',['contractor'],'weighted(wetlands, category1_water, wellhead, source_water, flood)','Condenses water-related site constraints for screening.'),
('geology_complexity_score','Geology Complexity Score','development',['contractor'],'weighted(fill, acid_soil, mines, faults, landslides, aquifer_context)','Creates a first-pass geology diligence score from state mapping.'),
('predevelopment_review_priority','Predevelopment Review Priority','development',['contractor'],'weighted(development_constraint_density, regulatory_overlap, water_constraint, geology_complexity)','Ranks sites for deeper review before design spend.')]: derived(*x,'pro' if x[0] in ('development_constraint_density','permitting_velocity','certificate_closure_rate') else 'pro_plus')

# Appraiser (5)
for x in [
('comparable_depth_score','Comparable Depth Score','appraisal',['appraiser'],'normalized(verified_sale_sample_size, recency, dispersion)','Shows whether the public sales evidence base is deep enough for comparison.'),
('assessment_uniformity_reliability','Assessment Uniformity Reliability','appraisal',['appraiser'],'weighted(inverse_COD, usable_sales, inverse_volatility)','Adds reliability context to municipal assessment ratios.'),
('appraisal_record_completeness','Appraisal Record Completeness','appraisal',['appraiser'],'present(appraisal_fields) / required_fields * 100','Surfaces missing public-record inputs before valuation work.'),
('land_improvement_outlier','Land/Improvement Outlier','appraisal',['appraiser'],'percentile(abs(property_improvement_share - peer_median_share))','Flags unusual assessment composition for review.'),
('market_anchor_confidence','Market Anchor Confidence','appraisal',['appraiser'],'weighted(comparable_depth, source_coverage, inverse_sale_dispersion)','States how strongly verified evidence supports the market anchor.')]: derived(*x,'pro' if x[0] in ('comparable_depth_score','assessment_uniformity_reliability','appraisal_record_completeness') else 'pro_plus')

# Insurance / risk (5)
for x in [
('flood_context_severity','Flood Context Severity','risk',['insurance'],'weighted(NFHL, tidal_CAFE, flood_plan, flood_profile_proximity)','Combines public flood mapping into a screening priority, not an insurance determination.'),
('environmental_site_proximity','Environmental Site Proximity','risk',['insurance'],'weighted(contaminated_500m, UST_250m, deed_notice, CEA)','Prioritizes environmental site review from state public records.'),
('water_protection_overlap','Water Protection Overlap','risk',['insurance'],'weighted(wellhead_tier, source_water, sole_source_aquifer, category1_water)','Shows overlapping drinking-water/protection contexts relevant to risk review.'),
('historic_property_constraint','Historic Property Constraint','risk',['insurance'],'weighted(historic_property, historic_district, archaeological_screen, LOI)','Flags historic-resource mapping that may affect diligence.'),
('physical_due_diligence_priority','Physical Due-Diligence Priority','risk',['insurance'],'weighted(flood_context, environmental_proximity, water_overlap, geology_complexity)','Ranks properties for deeper physical/environmental review.')]: derived(*x,'pro_plus')

assert len(M) == 100, len(M)
assert sum(x['origin']=='public' for x in M) == 50
assert len({x['id'] for x in M}) == 100
doc={'schema_version':1,'version':'0.25.0','released':'2026-08-07','definition':'50 authoritative public-source markers plus 50 transparent Watchdog-derived professional signals. Derived scores are screening aids, not legal, appraisal, lending or insurance determinations.','markers':M}
(ROOT/'data'/'institutional-marker-pack.json').write_text(json.dumps(doc,indent=2)+'\n')
print(json.dumps({'total':len(M),'public':50,'derived':50},indent=2))
