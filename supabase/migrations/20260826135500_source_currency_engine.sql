-- Governed source-currency engine v1.
-- Measures whether existing live provider registrations are still inside their own declared
-- verification/freshness SLA. This is provider-provenance currency, not a claim that an
-- underlying government fact changed or is legally current.

create table if not exists public.data_center_source_currency_metrics (
  group_key text primary key,
  currency_score numeric not null,
  compliant_count integer not null,
  total_count integer not null,
  oldest_verified_at timestamptz,
  newest_verified_at timestamptz,
  refreshed_at timestamptz not null default now()
);

alter table public.data_center_source_currency_metrics enable row level security;
revoke all on table public.data_center_source_currency_metrics from anon, authenticated;
grant select, insert, update, delete on table public.data_center_source_currency_metrics to service_role;

create or replace function public.refresh_data_center_source_currency_metrics()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_rows integer;
begin
  delete from public.data_center_source_currency_metrics;

  with eligible as (
    select marker_id, provider_kind, last_verified_at, freshness_seconds,
      (last_verified_at is not null and freshness_seconds is not null and
       last_verified_at + make_interval(secs => freshness_seconds::int) >= now()) as is_current
    from public.data_center_provider_coverage
    where value_status='live' and freshness_seconds is not null
  ), groups(group_key) as (
    values ('core_authoritative'),('tax_escrow'),('valuation'),('municipal_budget'),('flood'),('physical_risk')
  )
  insert into public.data_center_source_currency_metrics
    (group_key,currency_score,compliant_count,total_count,oldest_verified_at,newest_verified_at,refreshed_at)
  select g.group_key,
    coalesce(round(100.0 * count(*) filter(where e.is_current) / nullif(count(*),0),1),0),
    count(*) filter(where e.is_current)::int,
    count(*)::int,
    min(e.last_verified_at), max(e.last_verified_at), now()
  from groups g
  left join eligible e on case g.group_key
    when 'core_authoritative' then e.provider_kind in ('authoritative_source','authoritative_reference','authoritative_spatial_reference')
    when 'tax_escrow' then e.marker_id = any(array['property.annual_tax','tax.rate_2025','budget.pressure_score','budget.levy_base_gap','njplus.nj-dca-modiv-longitudinal.assessment_history_depth']::text[])
    when 'valuation' then e.marker_id = any(array['property.assessed_value','property.last_sale_price','sales.sample_size','sales.ratio']::text[])
    when 'municipal_budget' then e.marker_id like 'budget.%'
    when 'flood' then e.marker_id = any(array['preflight.fema_flood_zone','preflight.tidal_cafe_hit','preflight.wetlands_2012_hit','preflight.epa_priority_wetland_hit']::text[])
    when 'physical_risk' then e.provider_kind='authoritative_spatial_reference' and (e.marker_id like 'preflight.%' or e.marker_id like 'geology.%')
    else false end
  group by g.group_key;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke all on function public.refresh_data_center_source_currency_metrics() from public, anon, authenticated;
grant execute on function public.refresh_data_center_source_currency_metrics() to service_role;

create or replace function public.get_data_center_source_currency_metric(p_group_key text)
returns public.data_center_source_currency_metrics
language sql
stable
security invoker
set search_path = public
as $$ select * from public.data_center_source_currency_metrics where group_key=p_group_key; $$;
revoke all on function public.get_data_center_source_currency_metric(text) from public, anon, authenticated;
grant execute on function public.get_data_center_source_currency_metric(text) to service_role;

select public.refresh_data_center_source_currency_metrics();

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
values
('watchdog.attorney.case_file_source_freshness','watchdog-source-currency-v1','percent of authoritative provider registrations within declared freshness SLA',array['currency.core_authoritative']::text[],'medium','live','V1 provider-provenance freshness across authoritative Watchdog source registrations. It does not assert that the underlying legal/public fact has changed or remains legally current.','source_alias',jsonb_build_object('dep','currency.core_authoritative'),now()),
('watchdog.lender.escrow_evidence_freshness','watchdog-source-currency-v1','percent of tax/assessment provider registrations within declared freshness SLA',array['currency.tax_escrow']::text[],'medium','live','V1 tax/assessment provider-provenance currency for escrow discussion; not an escrow or underwriting determination.','source_alias',jsonb_build_object('dep','currency.tax_escrow'),now()),
('watchdog.appraiser.valuation_record_freshness','watchdog-source-currency-v1','percent of valuation-evidence provider registrations within declared freshness SLA',array['currency.valuation']::text[],'medium','live','V1 public valuation-record provider currency; not MLS comparable recency and not an appraisal conclusion.','source_alias',jsonb_build_object('dep','currency.valuation'),now()),
('watchdog.municipal.budget_data_freshness','watchdog-source-currency-v1','percent of budget provider registrations within declared freshness SLA',array['currency.municipal_budget']::text[],'medium','live','V1 municipal-budget provider verification currency using each registered field SLA.','source_alias',jsonb_build_object('dep','currency.municipal_budget'),now()),
('watchdog.insurance.flood_evidence_freshness','watchdog-source-currency-v1','percent of governed flood/wetland provider registrations within declared freshness SLA',array['currency.flood']::text[],'medium','live','V1 mapped flood/wetland provider-provenance currency; not a flood determination or insurance eligibility decision.','source_alias',jsonb_build_object('dep','currency.flood'),now()),
('watchdog.insurance.public_risk_source_currency','watchdog-source-currency-v1','percent of governed physical-risk spatial provider registrations within declared freshness SLA',array['currency.physical_risk']::text[],'medium','live','V1 public physical-risk source verification currency; lower values mean Watchdog should refresh registered sources before stronger reliance.','source_alias',jsonb_build_object('dep','currency.physical_risk'),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('watchdog.attorney.case_file_source_freshness',array['property']::text[],'watchdog-source-currency-v1','live',array['data_center_provider_coverage']::text[],now(),'Provider-SLA currency; not legal source-release currency.','derived_governed',array['currency.core_authoritative']::text[],'watchdog-source-currency-v1',3600,'refresh_on_demand',true),
('watchdog.lender.escrow_evidence_freshness',array['property']::text[],'watchdog-source-currency-v1','live',array['data_center_provider_coverage']::text[],now(),'Tax/assessment provider-SLA currency; not underwriting.','derived_governed',array['currency.tax_escrow']::text[],'watchdog-source-currency-v1',3600,'refresh_on_demand',true),
('watchdog.appraiser.valuation_record_freshness',array['property']::text[],'watchdog-source-currency-v1','live',array['data_center_provider_coverage']::text[],now(),'Public valuation provider-SLA currency; not MLS comp recency.','derived_governed',array['currency.valuation']::text[],'watchdog-source-currency-v1',3600,'refresh_on_demand',true),
('watchdog.municipal.budget_data_freshness',array['municipality']::text[],'watchdog-source-currency-v1','live',array['data_center_provider_coverage']::text[],now(),'Budget provider-SLA currency.','derived_governed',array['currency.municipal_budget']::text[],'watchdog-source-currency-v1',3600,'refresh_on_demand',true),
('watchdog.insurance.flood_evidence_freshness',array['property']::text[],'watchdog-source-currency-v1','live',array['data_center_provider_coverage']::text[],now(),'Flood/wetland provider-SLA currency; not a flood determination.','derived_governed',array['currency.flood']::text[],'watchdog-source-currency-v1',3600,'refresh_on_demand',true),
('watchdog.insurance.public_risk_source_currency',array['property']::text[],'watchdog-source-currency-v1','live',array['data_center_provider_coverage']::text[],now(),'Physical-risk spatial provider-SLA currency.','derived_governed',array['currency.physical_risk']::text[],'watchdog-source-currency-v1',3600,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;