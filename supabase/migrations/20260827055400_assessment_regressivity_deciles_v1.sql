create table if not exists public.assessment_regressivity_metrics (
  district_code text primary key,
  sample_count integer not null,
  sale_year_min smallint not null,
  sale_year_max smallint not null,
  lower_value_median_ratio numeric not null,
  upper_value_median_ratio numeric not null,
  lower_vs_upper_gap_pct numeric not null,
  pattern text not null,
  deciles jsonb not null,
  methodology_version text not null default 'regressivity-decile-v1',
  source_imported_at timestamptz,
  refreshed_at timestamptz not null default now(),
  constraint assessment_regressivity_pattern_chk check (pattern in ('lower_value_higher','modest_lower_value_higher','roughly_even','higher_value_higher'))
);

alter table public.assessment_regressivity_metrics enable row level security;
revoke all on public.assessment_regressivity_metrics from anon, authenticated;

create or replace function public.refresh_assessment_regressivity_metrics()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  truncate table public.assessment_regressivity_metrics;
  with eligible as (
    select district_code,
           sale_year,
           sale_price::numeric as sale_price,
           sale_ratio::numeric as sale_ratio,
           imported_at
    from public.sr1a_subject_evidence
    where sale_price >= 50000
      and assessed_value > 0
      and sale_ratio between 0.10 and 2.00
      and sale_year >= 2024
  ), ranked as (
    select *, ntile(10) over (partition by district_code order by sale_price) as decile
    from eligible
  ), dec as (
    select district_code,
           decile,
           count(*)::integer as n,
           percentile_cont(0.5) within group (order by sale_ratio)::numeric as med_ratio,
           percentile_cont(0.5) within group (order by sale_price)::numeric as med_price,
           min(sale_year)::smallint as year_min,
           max(sale_year)::smallint as year_max,
           max(imported_at) as source_imported_at
    from ranked
    group by district_code, decile
  ), agg as (
    select district_code,
           sum(n)::integer as sample_count,
           min(year_min)::smallint as sale_year_min,
           max(year_max)::smallint as sale_year_max,
           avg(med_ratio) filter (where decile <= 3)::numeric as low_ratio,
           avg(med_ratio) filter (where decile >= 8)::numeric as high_ratio,
           max(source_imported_at) as source_imported_at,
           count(*) as decile_count,
           jsonb_agg(jsonb_build_object('decile',decile,'n',n,'median_sale_price',round(med_price,0),'median_assessment_ratio',round(med_ratio,4)) order by decile) as deciles
    from dec
    group by district_code
  )
  insert into public.assessment_regressivity_metrics (
    district_code,sample_count,sale_year_min,sale_year_max,lower_value_median_ratio,upper_value_median_ratio,lower_vs_upper_gap_pct,pattern,deciles,source_imported_at,refreshed_at
  )
  select district_code,
         sample_count,
         sale_year_min,
         sale_year_max,
         round(low_ratio,4),
         round(high_ratio,4),
         round(((low_ratio / nullif(high_ratio,0)) - 1) * 100,2),
         case
           when ((low_ratio / nullif(high_ratio,0)) - 1) * 100 >= 10 then 'lower_value_higher'
           when ((low_ratio / nullif(high_ratio,0)) - 1) * 100 >= 5 then 'modest_lower_value_higher'
           when ((low_ratio / nullif(high_ratio,0)) - 1) * 100 > -5 then 'roughly_even'
           else 'higher_value_higher'
         end,
         deciles,
         source_imported_at,
         now()
  from agg
  where sample_count >= 50 and decile_count = 10 and high_ratio > 0;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_assessment_regressivity_metrics() from public, anon, authenticated;
grant execute on function public.refresh_assessment_regressivity_metrics() to service_role;

comment on table public.assessment_regressivity_metrics is 'Service-only aggregate municipality-level assessment-to-sale ratio analysis by sale-price decile. Public access is mediated by bounded Watchdog API controls; contains no owner/contact data and does not accuse or infer assessor intent.';
comment on column public.assessment_regressivity_metrics.lower_vs_upper_gap_pct is 'Positive means lower-price deciles have higher median assessment-to-sale ratios than upper-price deciles; descriptive pattern only, not a legal conclusion.';

select public.refresh_assessment_regressivity_metrics();
