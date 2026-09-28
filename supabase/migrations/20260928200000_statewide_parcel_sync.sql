-- Statewide parcel sync (step 1 of the statewide property data load).
--
-- property_lookups held ~11k parcels (mostly Camden and Gloucester) because
-- rows were only cached when someone looked a property up. Town comparisons
-- read this table, so most of the state had too few peers. A scheduled
-- loader (property/scripts/sync_parcel_composite.py via
-- .github/workflows/parcel-composite-sync.yml) now copies the NJ Office of
-- GIS Parcels and MOD-IV Composite into it.
--
-- Privacy: owner names and owner mailing addresses are never requested or
-- stored. property_lookups stays server-only (RLS on, no client policies).

alter table public.property_lookups
  add column if not exists last_sale_date date,
  add column if not exists sales_code text,
  add column if not exists source_synced_at timestamptz;

comment on column public.property_lookups.last_sale_date is 'Recorded deed date (MOD-IV DEED_DATE, YYMMDD) as a date.';
comment on column public.property_lookups.sales_code is 'MOD-IV non-usable sales code. Blank means the sale was not flagged as a non-market transfer.';
comment on column public.property_lookups.source_synced_at is 'When the statewide parcel sync last refreshed this row.';

-- Town and county comparison groups (property class within a town / county).
create index if not exists property_lookups_town_class_idx on public.property_lookups (town, prop_class);
create index if not exists property_lookups_county_class_idx on public.property_lookups (county, prop_class);

-- One row per loader run, for progress, resume and evidence.
create table if not exists public.parcel_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  scope text not null default 'statewide',
  status text not null default 'running' check (status in ('running','complete','failed','stopped')),
  source_count integer,
  last_objectid bigint not null default 0,
  pages integer not null default 0,
  rows_received integer not null default 0,
  rows_written integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.parcel_sync_runs enable row level security;
revoke all on public.parcel_sync_runs from anon, authenticated;

-- Batch writer used by the loader. Refreshes public-record fields only:
-- never touches lookup_count, first_seen, history or effective_rate, and new
-- rows start at lookup_count 0 so popularity signals stay honest.
create or replace function public.sync_parcel_batch(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'batch too large';
  end if;

  with src as (
    select distinct on (r.pams_pin) r.*
    from jsonb_to_recordset(p_rows) as r(
      pams_pin text, address text, town text, county text, zip text,
      block text, lot text, qualifier text, prop_class text,
      year_built integer, acres numeric, dwelling_units integer, building_desc text,
      land_value bigint, improvement_value bigint, assessed_value bigint, last_year_tax numeric,
      last_sale_price bigint, last_sale_year integer, last_sale_date date, sales_code text
    )
    where r.pams_pin ~ '^\d{4}_'
    order by r.pams_pin
  ), upserted as (
    insert into public.property_lookups as p (
      pams_pin, address, town, county, zip, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      lookup_count, source_synced_at
    )
    select
      pams_pin, coalesce(nullif(address, ''), 'BLOCK ' || coalesce(block, '') || ' LOT ' || coalesce(lot, '')), town, county, zip, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      0, now()
    from src
    on conflict (pams_pin) do update set
      address = coalesce(nullif(excluded.address, ''), p.address),
      town = coalesce(excluded.town, p.town),
      county = coalesce(excluded.county, p.county),
      zip = coalesce(excluded.zip, p.zip),
      block = coalesce(excluded.block, p.block),
      lot = coalesce(excluded.lot, p.lot),
      qualifier = excluded.qualifier,
      prop_class = coalesce(excluded.prop_class, p.prop_class),
      year_built = coalesce(excluded.year_built, p.year_built),
      acres = coalesce(excluded.acres, p.acres),
      dwelling_units = coalesce(excluded.dwelling_units, p.dwelling_units),
      building_desc = coalesce(excluded.building_desc, p.building_desc),
      land_value = coalesce(excluded.land_value, p.land_value),
      improvement_value = coalesce(excluded.improvement_value, p.improvement_value),
      assessed_value = coalesce(excluded.assessed_value, p.assessed_value),
      last_year_tax = coalesce(excluded.last_year_tax, p.last_year_tax),
      last_sale_price = excluded.last_sale_price,
      last_sale_year = excluded.last_sale_year,
      last_sale_date = excluded.last_sale_date,
      sales_code = excluded.sales_code,
      source_synced_at = now()
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;

revoke all on function public.sync_parcel_batch(jsonb) from public, anon, authenticated;
grant execute on function public.sync_parcel_batch(jsonb) to service_role;
