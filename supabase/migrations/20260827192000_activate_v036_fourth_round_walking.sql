-- NJW-143 / v0.36 source activation.
-- Production was first certified through authenticated provider release canary
-- request 3795. This migration persists the exact governed state.

create or replace function public.dispatch_provider_release_canary(p_scenario text)
returns bigint
language plpgsql
set search_path to 'public','extensions'
as $function$
declare
  v_raw text := encode(gen_random_bytes(48), 'hex');
  v_email text := 'watchdog-provider-canary-' || substr(v_raw,1,10) || '@example.com';
  v_request_id bigint;
begin
  if p_scenario not in (
    'zoning_v31','designation_stack_v15','csrr_v1','csrr_controls_v2',
    'csrr_semantics_v3','geology_intersections_v1','model_bounds_v1',
    'uniformity_history_v1','uniformity_history_v2','uniformity_history_v3',
    'modiv_longitudinal_v1','modiv_longitudinal_partial_scan_v1',
    'modiv_longitudinal_missing_year_v1','community_assets_access_v1',
    'zoning_contact_status_v1','pilot_observed_v1','v036_sources_v1'
  ) then
    raise exception 'Unsupported release canary scenario';
  end if;

  insert into public.watchdog_test_bootstrap_tokens
    (token_hash, desired_email, redirect_to, expires_at, metadata)
  values
    (encode(digest(v_raw,'sha256'),'hex'), v_email,
     'https://njpropertytaxrelief.com/property/dashboard', now()+interval '10 minutes',
     jsonb_build_object('purpose','provider_release_canary','scenario',p_scenario,'no_real_spend',true));

  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/provider-release-canary',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('token',v_raw,'scenario',p_scenario),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

insert into public.dca_source_registry
  (source_id,source_status,source_url,source_vintage,geography_scope,join_strategy,
   refresh_cadence,authoritative,last_checked_at,notes)
values
  ('nj-dca-fourth-round-affordable','live',
   'https://www.nj.gov/dca/dlps/4th_Round_Numbers.shtml',
   'DCA Fourth Round 2025–2035 calculations; validated snapshot generated 2026-08-26',
   'municipality',
   'PAMS/Treasury municipality code -> validated 564-row DCA Fourth Round Appendix A municipality record',
   'source change / monitored',true,now(),
   'Certified 2026-08-27 through authenticated production canary v036_sources_v1. All 9 cataloged fields returned exact expected values for Absecon with authoritative_reference provenance and provider version nj-dca-fourth-round-2025-2035-v1. DCA describes these calculations as non-binding guidance; Watchdog does not treat them as a legal determination of municipal obligation.')
on conflict (source_id) do update set
  source_status=excluded.source_status,
  source_url=excluded.source_url,
  source_vintage=excluded.source_vintage,
  geography_scope=excluded.geography_scope,
  join_strategy=excluded.join_strategy,
  refresh_cadence=excluded.refresh_cadence,
  authoritative=excluded.authoritative,
  last_checked_at=excluded.last_checked_at,
  notes=excluded.notes;

with rows(marker_id,source_field,note) as (
  values
    ('njplus.nj-dca-fourth-round-affordable.present_need','Present Need','Exact Absecon canary value 39.'),
    ('njplus.nj-dca-fourth-round-affordable.prospective_need','Prospective Need','Exact Absecon canary value 22.'),
    ('njplus.nj-dca-fourth-round-affordable.prospective_need_capped','Prospective Need Obligation with 1,000/20% Cap','Exact Absecon capped canary value 22.'),
    ('njplus.nj-dca-fourth-round-affordable.qualified_urban_aid','Qualified Urban Aid Municipality','Exact Absecon canary value No.'),
    ('njplus.nj-dca-fourth-round-affordable.nonresidential_value_factor_pct','Equalized Nonresidential Valuation Factor','Exact Absecon canary value 0.97 percentage points.'),
    ('njplus.nj-dca-fourth-round-affordable.land_capacity_factor_pct','Land Capacity Factor','Exact Absecon canary value 1.11 percentage points.'),
    ('njplus.nj-dca-fourth-round-affordable.income_capacity_factor_pct','Income Capacity Factor','Exact Absecon canary value 1.44 percentage points.'),
    ('njplus.nj-dca-fourth-round-affordable.average_allocation_factor_pct','Average Allocation Factor','Exact Absecon canary value 1.17 percentage points.'),
    ('njplus.nj-dca-fourth-round-affordable.cap_1000_20pct','Cap','Exact Absecon canary value 723.')
)
insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,
   provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select
  marker_id,array['municipality']::text[],'workbench-hydrate','live',
  array['nj-dca-fourth-round-affordable','NJ DCA Fourth Round (2025–2035) Methodology Appendix A']::text[],
  now(),
  'Authenticated production canary v036_sources_v1 passed. '||note||' DCA non-binding guidance only; not a legal determination.',
  'authoritative_reference',array[source_field]::text[],'nj-dca-fourth-round-2025-2035-v1',
  21600,'refresh_on_demand',true
from rows
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,
  source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,
  provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,
   provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
  ('njplus.nj-dca-neighborhood-trends.walking_to_work_share',
   array['municipality']::text[],'workbench-hydrate','live',
   array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database']::text[],now(),
   'Authenticated production canary v036_sources_v1 passed exact Absecon value 1.4275 percentage points. Published mobility statistic only; not a generalized walkability score or commute-mode mix.',
   'authoritative_reference',array['% Walking to Work · 2020-24 Estimate']::text[],
   'nj-dca-neighborhood-trends-walk-2020-24-v1',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,
  source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,
  provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
