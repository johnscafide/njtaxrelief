#!/usr/bin/env python3
"""Create the reviewed v0.30 cross-professional Watchdog marker contract."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M = []

def add(profession, key, label, category, formula, reason, tier='pro'):
    M.append({
        'id': f'watchdog.{profession}.{key}', 'label': label, 'description': reason,
        'category': category, 'scope': 'property', 'tier': tier, 'origin': 'watchdog-derived',
        'professions': [profession], 'source_id': 'watchdog-professional-v030',
        'field': key, 'formula': formula, 'professional_reason': reason, 'unit': 'score / 100'
    })

PACKS = {
 'consumer': [
  ('home_cost_clarity','Home Cost Clarity','homeownership','coverage(annual_tax, rate, assessment, sale_context)','Shows whether the core public-cost facts needed for a homeowner decision are present.','standard'),
  ('tax_change_watch','Tax Change Watch','homeownership','weighted(tax_trajectory, levy_growth, revaluation_risk)','Prioritizes a homeowner review when tax drivers move together.','standard'),
  ('appeal_question_readiness','Appeal Question Readiness','appeals','weighted(chapter123_position, evidence_chain_completeness, deadline_readiness)','Explains when it is worth asking a qualified professional about an appeal.','standard'),
  ('buyer_tax_planning_signal','Buyer Tax Planning Signal','buying','weighted(transaction_tax_shock, buyer_monthly_carry_delta)','Translates public tax relationships into a buyer-planning conversation.','standard'),
  ('ownership_record_confidence','Ownership Record Confidence','records','parcel_identity_confidence * source_authority_coverage / 100','Shows whether the public parcel record is well matched before relying on it.','standard'),
  ('property_change_attention','Property Change Attention','monitoring','weighted(score_change, permit_activity, source_change)','Prioritizes which recorded changes deserve a homeowner look.','standard'),
  ('public_record_completeness','Public Record Completeness','records','present(public_homeowner_fields) / required_homeowner_fields * 100','Makes missing public-record facts visible without filling gaps by assumption.','standard'),
  ('sale_context_strength','Sale Context Strength','market','weighted(verified_sale_count, recency, sale_dispersion)','States the strength of available public sale context, not a valuation opinion.','pro'),
  ('home_improvement_followup','Home Improvement Follow-up','permits','weighted(recent_permit_count, permit_closure_confidence)','Helps a homeowner identify when completed work may need record follow-up.','pro'),
  ('tax_relief_pathway_fit','Tax Relief Pathway Fit','benefits','eligibility_inputs_present / required_inputs * 100','Shows whether enough information exists to discuss an available relief pathway.','standard')],
 'attorney': [
  ('record_exception_sequence','Record Exception Sequence','legal diligence','ordered(open_permits, deed_notice, title_constraints, environmental_hits)','Orders public-record exceptions into a review sequence without legal conclusions.'),
  ('appeal_evidence_gap','Appeal Evidence Gap','appeals','100 - evidence_chain_completeness','Shows which appeal-supporting public evidence remains incomplete.'),
  ('deadline_evidence_collision','Deadline Evidence Collision','appeals','filing_deadline_risk * appeal_evidence_gap / 100','Highlights matters where evidence needs and filing time collide.'),
  ('municipal_record_reliance','Municipal Record Reliance','evidence quality','weighted(source_authority_coverage, parcel_identity_confidence)','Signals how safely municipal public records can anchor first-pass analysis.'),
  ('land_use_exception_stack','Land-Use Exception Stack','legal diligence','count(wetlands, historic, open_space, tidelands, highlands, pinelands)','Identifies overlapping mapped land-use programs for counsel review.'),
  ('closing_record_aging','Closing Record Aging','closing','normalized(age(open_permit, latest_deed, source_refresh))','Surfaces records that may need current-source confirmation.'),
  ('assessment_argument_specificity','Assessment Argument Specificity','appeals','weighted(chapter123_margin, comparable_depth, land_improvement_outlier)','Distinguishes a general concern from an evidence-specific assessment question.'),
  ('environmental_exception_path','Environmental Exception Path','legal diligence','weighted(environmental_encumbrance, water_protection_overlap, historic_fill)','Prioritizes environmental record review before reliance.'),
  ('public_notice_density','Public Notice Density','legal diligence','count(deed_notice, CEA, historic, open_space, tidelands)','Counts distinct public notice types, not legal encumbrances.'),
  ('case_file_source_freshness','Case File Source Freshness','evidence quality','weighted(source_age, source_authority_coverage)','Shows whether a working file may require updated official source pulls.')],
 'title': [
  ('closing_clearance_signal','Closing Clearance Signal','title diligence','weighted(parcel_identity_confidence, permit_closure_confidence, inverse_title_constraints)','Ranks public-record clearance questions before title examination.'),
  ('parcel_match_variance','Parcel Match Variance','title diligence','100 - parcel_identity_confidence','Flags records requiring manual block/lot/address reconciliation.'),
  ('permit_certificate_gap_age','Permit Certificate Gap Age','permits','age(oldest_open_permit_or_certificate_gap)','Shows elapsed age of a public permit/certificate gap.'),
  ('title_land_constraint_mix','Title Land Constraint Mix','title diligence','count(tidelands, open_space, historic, wetlands_LOI)','Makes the types of mapped public constraints scannable.'),
  ('recording_reference_completeness','Recording Reference Completeness','records','present(deed_book, deed_page, sale_date, parcel_id) / 4 * 100','Shows whether key public recording references are available.'),
  ('exception_resolution_priority','Exception Resolution Priority','title diligence','weighted(title_constraint_stack, open_permit_age, environmental_encumbrance)','Prioritizes exception follow-up without stating marketability of title.'),
  ('address_alias_risk','Address Alias Risk','records','normalized(address_variants, qualifier_variants, parcel_match_variance)','Flags a risk of mismatched public address formats.'),
  ('closing_source_currency','Closing Source Currency','evidence quality','weighted(source_age, official_release_status)','Shows whether source confirmation may be needed before closing use.'),
  ('map_notice_overlap','Map Notice Overlap','title diligence','count(mapped_notice_layers)','Summarizes mapped notice layers that may warrant record examination.'),
  ('municipal_search_scope','Municipal Search Scope','closing','coverage(municipal_search_items, parcel_context)','Shows the breadth of public municipal-search items reviewed.')],
 'agent': [
  ('listing_tax_talking_point','Listing Tax Talking Point','broker intelligence','weighted(tax_carry_advantage, listing_tax_burden_percentile)','Provides a sourced tax-position talking point for a listing discussion.'),
  ('buyer_cost_explanation','Buyer Cost Explanation','broker intelligence','weighted(buyer_monthly_carry_delta, transaction_tax_shock)','Shows how complete a buyer tax-cost explanation can be.'),
  ('listing_public_record_readiness','Listing Public-Record Readiness','broker intelligence','weighted(property_story_confidence, transaction_diligence_completion)','Shows whether public facts are ready for a careful property narrative.'),
  ('offer_question_density','Offer Question Density','broker intelligence','count(permit, flood, environmental, title questions)','Counts pre-offer diligence questions—not defects or deal outcomes.'),
  ('seller_tax_story_stability','Seller Tax Story Stability','broker intelligence','weighted(tax_trend_position, inverse_revaluation_conversation_risk)','Signals whether the tax story is stable enough for buyer conversations.'),
  ('buyer_diligence_sequence','Buyer Diligence Sequence','broker intelligence','ordered(offer_diligence_priority, buyer_objection_radar, permit_lifecycle)','Organizes public-record questions into a buyer-friendly order.'),
  ('market_context_confidence','Market Context Confidence','broker intelligence','weighted(market_anchor_confidence, sale_context_strength)','Shows the strength of public market context behind an agent brief.'),
  ('listing_change_alert','Listing Change Alert','monitoring','weighted(permit_activity, tax_change, score_change)','Prioritizes property changes to revisit during a listing cycle.'),
  ('client_brief_completeness','Client Brief Completeness','broker intelligence','present(client_brief_fields) / required_brief_fields * 100','Shows whether the client-facing public-record brief has its essentials.'),
  ('transaction_cost_conversation','Transaction Cost Conversation','broker intelligence','weighted(closing_cost_estimate, buyer_monthly_carry_delta, tax_reset_exposure)','Creates an explainable transaction-cost discussion starter.')],
 'lender': [
  ('payment_stability_signal','Payment Stability Signal','lending','weighted(escrow_volatility, collateral_operating_cost_stress)','Summarizes public recurring-cost stability for collateral discussion.'),
  ('tax_reserve_confidence','Tax Reserve Confidence','lending','weighted(five_year_tax_reserve_ratio, source_authority_coverage)','Shows confidence in a public-tax reserve planning signal.'),
  ('collateral_record_gap','Collateral Record Gap','lending','100 - appraisal_record_completeness','Identifies missing public collateral facts before workflow handoff.'),
  ('municipal_tax_capacity_watch','Municipal Tax Capacity Watch','lending','weighted(municipal_fiscal_capacity, tax_base_absorption_risk)','Adds municipal fiscal context without credit or underwriting decisions.'),
  ('insurance_cost_attention','Insurance Cost Attention','lending','weighted(flood_context_severity, environmental_collateral_review)','Flags public risk context that may require verified insurance inputs.'),
  ('revaluation_payment_risk','Revaluation Payment Risk','lending','weighted(collateral_tax_reset_sensitivity, revaluation_reset_exposure)','Highlights when a public assessment reset scenario could affect payments.'),
  ('escrow_evidence_freshness','Escrow Evidence Freshness','lending','weighted(source_age, tax_history_depth)','Shows whether tax evidence should be refreshed for escrow planning.'),
  ('collateral_completion_watch','Collateral Completion Watch','lending','weighted(permit_collateral_completion, permit_certificate_gap_age)','Focuses attention on public permit completion context.'),
  ('lending_diligence_coverage','Lending Diligence Coverage','lending','present(lending_public_fields) / required_lending_fields * 100','Measures public-data coverage for a collateral conversation.'),
  ('tax_shock_explanation_quality','Tax Shock Explanation Quality','lending','weighted(transaction_tax_shock, source_authority_coverage)','Shows whether a tax-shock discussion has sufficient public evidence.')],
 'appraiser': [
  ('sale_sample_recency','Sale Sample Recency','appraisal','normalized(days_since_median_verified_sale)','Shows how current the verified sale sample is.'),
  ('sale_dispersion_watch','Sale Dispersion Watch','appraisal','normalized(p75_sale_price - p25_sale_price)','Flags wide public sale dispersion requiring deeper comparable review.'),
  ('assessment_composition_context','Assessment Composition Context','appraisal','weighted(land_improvement_outlier, improvement_ratio)','Shows how unusual assessed land/improvement composition may be.'),
  ('ratio_stability_context','Ratio Stability Context','appraisal','weighted(assessment_uniformity_reliability, chapter123_margin_stability)','Adds stability context to public assessment ratios.'),
  ('public_input_gap','Public Input Gap','appraisal','100 - appraisal_record_completeness','Makes missing public appraisal inputs explicit.'),
  ('market_anchor_refresh','Market Anchor Refresh','appraisal','weighted(market_anchor_confidence, sale_sample_recency)','Signals whether the public market anchor needs refreshed evidence.'),
  ('parcel_physical_context','Parcel Physical Context','appraisal','weighted(lot_area, square_feet, year_built, property_class)','Shows availability of basic public physical context, not condition.'),
  ('comparable_screen_priority','Comparable Screen Priority','appraisal','weighted(comparable_depth_score, sale_dispersion_watch, public_input_gap)','Ranks where a comparable screen deserves deeper work.'),
  ('assessment_evidence_alignment','Assessment Evidence Alignment','appraisal','weighted(assessment_defensibility, comparable_evidence_reliability)','Shows agreement between public assessment and sale-evidence context.'),
  ('valuation_record_freshness','Valuation Record Freshness','appraisal','weighted(source_age, verified_sale_recency, parcel_identity_confidence)','Shows whether valuation-related public inputs are current enough to screen.')],
 'contractor': [
  ('site_preflight_completeness','Site Preflight Completeness','development','present(site_constraint_fields) / required_site_fields * 100','Shows whether public site-screening inputs are complete before design spend.'),
  ('permit_sequence_clarity','Permit Sequence Clarity','permits','weighted(permitting_velocity, certificate_closure_rate)','Makes public permit lifecycle context easier to scan.'),
  ('water_review_priority','Water Review Priority','development','weighted(site_water_constraint, flood_context, wellhead_overlap)','Prioritizes water-related public mapping review.'),
  ('ground_condition_attention','Ground Condition Attention','development','weighted(geology_complexity, historic_fill, acid_soil)','Flags public geology/soil context for further investigation.'),
  ('jurisdiction_overlap_watch','Jurisdiction Overlap Watch','development','regulatory_overlap_score','Shows the density of mapped regulatory programs affecting a site screen.'),
  ('construction_record_gap','Construction Record Gap','permits','100 - permit_closure_confidence','Identifies public permit/certificate completeness gaps.'),
  ('site_constraint_change_watch','Monitoring','development','weighted(source_change, mapped_constraint_layers)','Alerts when a mapped source or constraint context changes.'),
  ('preconstruction_question_set','Preconstruction Question Set','development','count(water, geology, wetlands, historic, permit questions)','Counts public diligence questions before work begins.'),
  ('development_timeline_uncertainty','Development Timeline Uncertainty','development','weighted(open_permit_age, regulatory_overlap, source_freshness)','Signals sources of public-record timeline uncertainty.'),
  ('project_screening_confidence','Project Screening Confidence','development','weighted(site_preflight_completeness, source_authority_coverage)','Shows confidence in a first-pass public-record screen.')],
 'investor': [
  ('hold_cost_stability','Hold Cost Stability','investment','weighted(inverse_carry_cost_downside, fiscal_trend_momentum)','Summarizes recurring public-cost stability for a holding-period screen.'),
  ('municipal_exposure_diversification','Municipal Exposure Diversification','investment','100 - municipal_concentration_risk','Shows concentration sensitivity when municipal fiscal context matters.'),
  ('tax_base_gap_watch','Tax Base Gap Watch','investment','tax_base_absorption_risk','Highlights levy growth outpacing the equalized tax base.'),
  ('capital_reinvestment_signal','Capital Reinvestment Signal','investment','weighted(capital_improvement_activity, permitting_velocity)','Uses public permit activity as reinvestment context, not property condition.'),
  ('asset_constraint_screen','Asset Constraint Screen','investment','weighted(regulatory_constraint_density, environmental_site_proximity)','Summarizes public mapped constraint context across an asset.'),
  ('revaluation_hold_sensitivity','Revaluation Hold Sensitivity','investment','revaluation_reset_exposure','Shows a public assessment-reset consideration for holding-cost scenarios.'),
  ('portfolio_evidence_coverage','Portfolio Evidence Coverage','investment','present(portfolio_public_fields) / required_portfolio_fields * 100','Measures coverage of selected public portfolio fields.'),
  ('municipal_fiscal_direction','Municipal Fiscal Direction','investment','weighted(fiscal_trend_momentum, municipal_fiscal_capacity)','Condenses public municipal fiscal direction for cross-market screening.'),
  ('exit_tax_story','Exit Tax Story','investment','weighted(tax_trend_position, listing_tax_burden_percentile)','Supports an explainable tax conversation at disposition.'),
  ('investment_diligence_priority','Investment Diligence Priority','investment','weighted(carry_cost_downside, asset_constraint_screen, revaluation_hold_sensitivity)','Ranks assets for deeper professional diligence.')],
 'municipal': [
  ('tax_base_change_signal','Tax Base Change Signal','municipal finance','weighted(tax_base_growth, equalized_value_cagr)','Shows public taxable-base direction across published periods.'),
  ('levy_alignment_score','Levy Alignment Score','municipal finance','100 - normalized(abs(levy_growth - tax_base_growth))','Shows how closely levy growth tracks the published base.'),
  ('collection_resilience_context','Collection Resilience Context','municipal finance','weighted(collection_rate, fiscal_resilience_score)','Adds context to published collection performance.'),
  ('exemption_pressure_watch','Exemption Pressure Watch','municipal finance','weighted(exempt_share, pilot_value_share, abated_share)','Summarizes exempt/PILOT/abatement pressure on the public tax base.'),
  ('debt_service_attention','Debt Service Attention','municipal finance','weighted(debt_service_share, net_debt_pct)','Prioritizes public debt-service context for review.'),
  ('budget_data_freshness','Budget Data Freshness','municipal finance','age(latest_budget_release)','Shows whether a published budget series may need a refresh.'),
  ('ratable_growth_quality','Ratable Growth Quality','municipal finance','weighted(ratable_growth, inverse_levy_base_gap)','Provides an explainable public ratable-growth context.'),
  ('appeal_activity_context','Appeals','municipal finance','weighted(appeal_volume, win_rate_decided, assessed_appealed)','Summarizes published county appeal activity without predicting outcomes.'),
  ('municipal_source_coverage','Municipal Source Coverage','evidence quality','present(municipal_source_fields) / required_municipal_fields * 100','Shows how much of a municipal snapshot has published support.'),
  ('fiscal_monitor_priority','Fiscal Monitor Priority','municipal finance','weighted(levy_alignment, exemption_pressure, debt_service_attention)','Ranks municipal records for closer operational monitoring.')],
 'insurance': [
  ('mapped_hazard_overlap','Mapped Hazard Overlap','risk','count(flood, wetlands, contaminated, geology, water_protection)','Counts distinct public mapping contexts; it is not an insurance eligibility decision.'),
  ('flood_evidence_freshness','Flood Evidence Freshness','risk','weighted(source_age, flood_map_version)','Shows whether public flood-map context should be refreshed.'),
  ('environmental_review_scope','Environmental Review Scope','risk','weighted(environmental_site_proximity, environmental_encumbrance)','Summarizes public environmental review context.'),
  ('water_protection_context','Water Protection Context','risk','water_protection_overlap','Makes drinking-water and protection mapping context scannable.'),
  ('geology_hazard_context','Geology Hazard Context','risk','weighted(geology_complexity, landslide, mine, fault)','Summarizes public geology hazard mapping for review.'),
  ('historic_constraint_context','Historic Constraint Context','risk','historic_property_constraint','Flags public historic-resource mapping context.'),
  ('physical_record_coverage','Physical Record Coverage','risk','present(physical_risk_fields) / required_risk_fields * 100','Shows completeness of public physical-risk inputs.'),
  ('site_review_escalation','Site Review Escalation','risk','weighted(physical_due_diligence_priority, mapped_hazard_overlap)','Prioritizes deeper verified site review.'),
  ('public_risk_source_currency','Public Risk Source Currency','risk','weighted(source_age, source_authority_coverage)','Shows whether public risk-source pulls may require refresh.'),
  ('risk_context_consistency','Risk Context Consistency','risk','weighted(flood_context, water_overlap, geology_context, environmental_context)','Shows whether mapped public risk contexts agree enough for first-pass review.')]
}

for profession, markers in PACKS.items():
    for item in markers: add(profession, *item)

assert len(M) == 100, len(M)
assert len({m['id'] for m in M}) == 100
doc = {'schema_version': 1, 'version': '0.30.0', 'released': '2026-08-07',
       'definition': '100 transparent Watchdog-derived professional decision signals: ten each for homeowner/buyer, attorney, title, real-estate, lender, appraiser, contractor/developer, investor, municipal and insurance/risk work. These are screening aids; they are not legal, title, appraisal, lending, investment, insurance, tax or transaction determinations.',
       'markers': M}
(ROOT / 'data' / 'professional-marker-pack-v030.json').write_text(json.dumps(doc, indent=2) + '\n')
print(json.dumps({'total': len(M), 'by_profession': {k: len(v) for k,v in PACKS.items()}}, indent=2))
