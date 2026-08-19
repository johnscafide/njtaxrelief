create table if not exists public.sr1a_subject_evidence (
  district_code text not null check (district_code ~ '^[0-9]{4}$'),
  county_code text not null check (county_code ~ '^[0-9]{2}$' and county_code = left(district_code, 2)),
  block_key text not null check (block_key <> ''),
  lot_key text not null check (lot_key <> ''),
  qualifier_key text not null default '',
  living_space integer check (living_space is null or living_space > 0),
  sale_year smallint check (sale_year is null or sale_year between 1950 and 2100),
  sale_month smallint check (sale_month is null or sale_month between 1 and 12),
  year_built smallint check (year_built is null or year_built between 1700 and 2100),
  assessed_value bigint check (assessed_value is null or assessed_value >= 0),
  sale_price bigint check (sale_price is null or sale_price >= 1000),
  sale_ratio numeric(10,6) check (sale_ratio is null or sale_ratio >= 0),
  sale_ppsf numeric(12,2) check (sale_ppsf is null or sale_ppsf >= 0),
  generation_id uuid not null,
  imported_at timestamptz not null default now(),
  primary key (district_code, block_key, lot_key, qualifier_key)
);

create index if not exists sr1a_subject_evidence_county_idx
  on public.sr1a_subject_evidence(county_code);
create index if not exists sr1a_subject_evidence_living_space_idx
  on public.sr1a_subject_evidence(district_code, block_key, lot_key)
  where living_space is not null;

alter table public.sr1a_subject_evidence enable row level security;
revoke all on public.sr1a_subject_evidence from public, anon, authenticated;
grant select, insert, update, delete on public.sr1a_subject_evidence to service_role;

create table if not exists public.sr1a_subject_index_runs (
  county_code text primary key check (county_code ~ '^[0-9]{2}$'),
  source_url text not null,
  source_etag text,
  status text not null check (status in ('loading','ready','failed')),
  source_record_count integer,
  indexed_parcel_count integer,
  rows_with_living_space integer,
  generation_id uuid,
  refreshed_at timestamptz,
  duration_ms integer,
  error_text text,
  updated_at timestamptz not null default now()
);

alter table public.sr1a_subject_index_runs enable row level security;
revoke all on public.sr1a_subject_index_runs from public, anon, authenticated;
grant select, insert, update, delete on public.sr1a_subject_index_runs to service_role;

create or replace function public.lookup_sr1a_subject_evidence(p_subjects jsonb)
returns table (
  request_key text,
  district_code text,
  block_key text,
  lot_key text,
  qualifier_key text,
  living_space integer,
  sale_year smallint,
  sale_month smallint,
  year_built smallint,
  assessed_value bigint,
  sale_price bigint,
  sale_ratio numeric,
  sale_ppsf numeric,
  match_quality text
)
language sql
security invoker
stable
set search_path = public
as $$
  with input as (
    select
      ordinality::int as ord,
      left(coalesce(nullif(item->>'key',''), ordinality::text), 120) as request_key,
      item->>'district' as district_code,
      item->>'block' as block_key,
      item->>'lot' as lot_key,
      coalesce(item->>'qualifier','') as qualifier_key
    from jsonb_array_elements(coalesce(p_subjects, '[]'::jsonb)) with ordinality as src(item, ordinality)
    where item ? 'district' and item ? 'block' and item ? 'lot'
  ),
  match_stats as (
    select
      i.ord,
      i.request_key,
      i.qualifier_key as requested_qualifier,
      e.*,
      count(*) over (partition by i.ord) as candidate_count,
      case when e.qualifier_key = i.qualifier_key then 0 else 1 end as priority
    from input i
    join public.sr1a_subject_evidence e
      on e.district_code = i.district_code
     and e.block_key = i.block_key
     and e.lot_key = i.lot_key
  ),
  eligible as (
    select *,
      row_number() over (
        partition by ord
        order by priority, sale_year desc nulls last, sale_month desc nulls last, qualifier_key
      ) as rn
    from match_stats
    where priority = 0 or candidate_count = 1
  )
  select
    request_key,
    district_code,
    block_key,
    lot_key,
    qualifier_key,
    living_space,
    sale_year,
    sale_month,
    year_built,
    assessed_value,
    sale_price,
    sale_ratio,
    sale_ppsf,
    case when qualifier_key = requested_qualifier then 'exact' else 'unique_parcel_fallback' end as match_quality
  from eligible
  where rn = 1
  order by ord;
$$;

revoke all on function public.lookup_sr1a_subject_evidence(jsonb) from public, anon, authenticated;
grant execute on function public.lookup_sr1a_subject_evidence(jsonb) to service_role;

comment on table public.sr1a_subject_evidence is 'Service-only compact latest-sale SR-1A subject evidence index. Contains no grantor/grantee names or party addresses.';
comment on function public.lookup_sr1a_subject_evidence(jsonb) is 'Service-role lookup for compact SR-1A subject evidence by normalized district/block/lot/qualifier. Ambiguous qualifier matches fail closed.';