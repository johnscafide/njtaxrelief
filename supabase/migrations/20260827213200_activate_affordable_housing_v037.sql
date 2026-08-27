-- NJW-143: certify the bounded NJ DCA Affordable Housing Municipal Status Report v0.37 batch.
-- Promotion is based on production canary scenario affordable_housing_v037 (request 3832),
-- which passed exact source-value and provenance assertions before this migration was applied.

insert into public.dca_source_registry
  (source_id,source_status,source_url,source_vintage,geography_scope,join_strategy,refresh_cadence,authoritative,last_checked_at,notes)
values
  ('nj-dca-affordable-housing','live','https://www.nj.gov/dca/dlps/hss/MuniStatusReporting.shtml',
   'February 2026 reporting period; source data current through 2026-03-06; published workbook file dated 2026-07-01',
   'municipality','Exact 4-digit DCA municipality code -> governed project-row aggregation plus municipal AHTF record','annual',true,now(),
   'The official workbook reports selected municipality-entered AHMS data and states it is not comprehensive and is presented as-is without DCA accuracy certification. v0.37 adds 31 exact/governed fields. HUD-subsidized units, LMI cost burden and affordable_units_pipeline remain unavailable because this workbook does not publish those exact concepts.')
on conflict (source_id) do update set
  source_status=excluded.source_status,source_url=excluded.source_url,source_vintage=excluded.source_vintage,
  geography_scope=excluded.geography_scope,join_strategy=excluded.join_strategy,refresh_cadence=excluded.refresh_cadence,
  authoritative=excluded.authoritative,last_checked_at=excluded.last_checked_at,notes=excluded.notes;

with promoted(marker_id,provider_kind,source_field,calculation_key) as (
  values
  ('njplus.nj-dca-affordable-housing.reported_affordable_project_count','derived_governed','Project ID','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_single_family','derived_governed','Single-Family','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_two_family','derived_governed','Two-Family','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_townhouse','derived_governed','Townhouse','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_apartment','derived_governed','Apartment','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_condo','derived_governed','Condo','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_manufactured_home','derived_governed','Manufactured Home','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_mobile_home','derived_governed','Mobile Home','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_type_unknown','derived_governed','Unit Type Unknown','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_very_low_income','derived_governed','Very Low Income (Affordable at 30% or Less of Area Median Income)','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_affordability_level_unknown','derived_governed','Affordability Level Unknown','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_special_needs','derived_governed','Special Needs/Dis-abled','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_family','derived_governed','Family','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.affordable_units_age_restricted','derived_governed','Age-Restricted (Senior)','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.projects_with_building_permit','derived_governed','Date Building Permit Issued','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.projects_with_certificate_of_occupancy','derived_governed','Certificate of Occupancy Granted','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.earliest_affordability_control_start_date','derived_governed','Beginning Date of Earliest Affordability Controls','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.earliest_affordability_control_expiration_date','derived_governed','Expiration Date of Earliest Affordability Controls','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.minimum_affordability_restriction_term_years','derived_governed','Affordability Restriction Term (in Years) - Earliest Controls','dca-affordable-housing-v037-municipal-aggregate'),
  ('njplus.nj-dca-affordable-housing.ahtf_can_retain_nonresidential_development_fee','authoritative_reference','Can Retain Non-Residential Development Fee?',null),
  ('njplus.nj-dca-affordable-housing.ahtf_confirmed','authoritative_reference','Has Confirmed Affordable Housing Trust Fund?',null),
  ('njplus.nj-dca-affordable-housing.ahtf_no_data_submitted','authoritative_reference','No AHTF Data Submitted',null),
  ('njplus.nj-dca-affordable-housing.ahtf_total_income_since_inception','authoritative_reference','Total Income Since Inception',null),
  ('njplus.nj-dca-affordable-housing.ahtf_total_expenditures_since_inception','authoritative_reference','Total Expenditures Since Inception',null),
  ('njplus.nj-dca-affordable-housing.ahtf_residential_development_fees','authoritative_reference','Residential Development Fees',null),
  ('njplus.nj-dca-affordable-housing.ahtf_nonresidential_development_fees','authoritative_reference','Nonresidential Development Fees',null),
  ('njplus.nj-dca-affordable-housing.ahtf_interest_earned','authoritative_reference','Interest Earned',null),
  ('njplus.nj-dca-affordable-housing.ahtf_municipal_contributions','authoritative_reference','Municipal Contributions',null),
  ('njplus.nj-dca-affordable-housing.ahtf_homeownership_assistance','authoritative_reference','Homeownership Assistance',null),
  ('njplus.nj-dca-affordable-housing.ahtf_rental_assistance','authoritative_reference','Rental Assistance',null),
  ('njplus.nj-dca-affordable-housing.ahtf_new_construction_expenditures','authoritative_reference','New Construction',null)
)
insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select
  marker_id,array['municipality']::text[],'workbench-hydrate','live',
  array['nj-dca-affordable-housing','dca-affordable-housing-v037-feb-2026']::text[],now(),
  'Certified by authenticated production canary affordable_housing_v037 request 3832. Exact DCA workbook source semantics; no legal/compliance inference.',
  provider_kind,array[source_field]::text[],calculation_key,21600,'refresh_on_demand',true
from promoted
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
