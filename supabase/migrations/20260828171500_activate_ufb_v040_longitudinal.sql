-- NJW-143 / NJW-144: certify the bounded NJ DCA User Friendly Budget v0.40 longitudinal batch.
-- Production canary ufb_longitudinal_v040 request 4155: HTTP 200, assertion_ok=true, mismatches=[].
-- These 130 markers expose exact annual Summary-sheet histories only. No Watchdog score, weighting,
-- interpolation, legal conclusion, or fiscal-quality judgment is created here.

insert into public.dca_source_registry
  (source_id,source_status,source_url,source_vintage,geography_scope,join_strategy,refresh_cadence,authoritative,last_checked_at,notes)
values
  ('nj-dca-user-friendly-budget-longitudinal','live','https://nj.gov/dca/dlgs/programs/mc_budget_docs/UFB%20Database%20-%20FINAL.xlsm',
   '2015-2025 User Friendly Budget annual Summary sheets; source release nj-dca-ufb-2015-2025-v1; SHA-256 79a59be4c4ab2669d60ebb8072aab5a5775df7025e66cb95a887e1c39ed8ccaa',
   'municipality','4-digit municipality code -> governed 564-municipality annual Summary histories','annual / source change monitored',true,now(),
   'Official NJ DCA compilation of municipal User Friendly Budget submissions. DCA states the data are self-reported by municipalities and have not been independently audited or verified. v0.40 includes only fields whose source group and heading remain semantically stable across all 2015-2025 annual Summary sheets after calendar-year token normalization. Missing annual cells remain missing and are never synthesized.')
on conflict (source_id) do update set
  source_status=excluded.source_status,source_url=excluded.source_url,source_vintage=excluded.source_vintage,
  geography_scope=excluded.geography_scope,join_strategy=excluded.join_strategy,refresh_cadence=excluded.refresh_cadence,
  authoritative=excluded.authoritative,last_checked_at=excluded.last_checked_at,notes=excluded.notes;

with
revenue_names(field_id) as (
  select unnest(array[
    'surplus','local_revenue','state_aid','uniform_construction_code_fees','shared_services_agreements',
    'additional_revenue_offset_by_appropriations','public_private_revenue','other_special_items',
    'receipts_from_delinquent_taxes','local_tax_for_municipal_purposes','minimum_library_tax',
    'open_space_levy_tax','addition_to_local_district_school_tax','deficit_general_budget','total'
  ]::text[])
),
appropriation_names(field_id) as (
  select unnest(array[
    'general_government','land_use_administration','uniform_construction_code','insurance','public_safety','public_works',
    'health_human_services','parks_recreation','education_library','unclassified','utilities_bulk_purchases',
    'landfill_solid_waste_disposal','contingency','statutory_expenditures','judgements','shared_services',
    'court_public_defender','capital','debt','deferred_charges','debt_type_1_school_district',
    'reserve_for_uncollected_taxes','surplus_general_budget','total'
  ]::text[])
),
marker_ids(marker_id) as (
  select unnest(array[
    'njplus.nj-dca-ufb-longitudinal.rut_tax_collection_pct_history',
    'njplus.nj-dca-ufb-longitudinal.prior_year_total_tax_revenue_collections_history',
    'njplus.nj-dca-ufb-longitudinal.prior_year_total_tax_levy_history',
    'njplus.nj-dca-ufb-longitudinal.prior_year_tax_collection_pct_history',
    'njplus.nj-dca-ufb-longitudinal.prior_year_delinquent_taxes_history',
    'njplus.nj-dca-ufb-longitudinal.total_full_time_employees_history',
    'njplus.nj-dca-ufb-longitudinal.total_part_time_employees_history',
    'njplus.nj-dca-ufb-longitudinal.total_personnel_cost_history',
    'njplus.nj-dca-ufb-longitudinal.total_base_pay_history',
    'njplus.nj-dca-ufb-longitudinal.total_overtime_other_compensation_history',
    'njplus.nj-dca-ufb-longitudinal.total_pension_estimate_history',
    'njplus.nj-dca-ufb-longitudinal.total_health_benefits_net_cost_share_history',
    'njplus.nj-dca-ufb-longitudinal.total_employment_taxes_other_benefits_history'
  ]::text[])
  union all select 'njplus.nj-dca-ufb-longitudinal.prior_year_realized_revenue_' || field_id || '_history' from revenue_names
  union all select 'njplus.nj-dca-ufb-longitudinal.current_year_anticipated_revenue_' || field_id || '_history' from revenue_names
  union all select 'njplus.nj-dca-ufb-longitudinal.current_year_general_budget_revenue_' || field_id || '_history' from revenue_names
  union all select 'njplus.nj-dca-ufb-longitudinal.prior_year_modified_appropriation_' || field_id || '_history' from appropriation_names
  union all select 'njplus.nj-dca-ufb-longitudinal.current_year_appropriation_' || field_id || '_history' from appropriation_names
  union all select 'njplus.nj-dca-ufb-longitudinal.current_year_general_budget_appropriation_' || field_id || '_history' from appropriation_names
)
insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select
  marker_id,
  array['municipality']::text[],
  'workbench-hydrate',
  'live',
  array['nj-dca-user-friendly-budget-longitudinal','nj-dca-ufb-2015-2025-v1']::text[],
  now(),
  'Authenticated production canary ufb_longitudinal_v040 request 4155 certified exact 2015-2025 annual Summary history/provenance semantics. Missing annual cells are omitted, never synthesized. NJ DCA states UFB submissions are self-reported and unaudited.',
  'authoritative_reference',
  array['NJ DCA UFB annual Summary sheets 2015-2025; exact per-marker source_field is emitted by the governed v0.40 provider manifest']::text[],
  null,
  21600,
  'refresh_on_demand',
  true
from marker_ids
on conflict (marker_id) do update set
  scopes=excluded.scopes,
  provider_key=excluded.provider_key,
  value_status=excluded.value_status,
  source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,
  notes=excluded.notes,
  provider_kind=excluded.provider_kind,
  source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;

do $check$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.data_center_provider_coverage
  where marker_id like 'njplus.nj-dca-ufb-longitudinal.%'
    and value_status='live'
    and provider_key='workbench-hydrate'
    and provider_kind='authoritative_reference';
  if v_count <> 130 then
    raise exception 'UFB v0.40 longitudinal activation expected 130 live coverage rows, found %', v_count;
  end if;
end
$check$;
