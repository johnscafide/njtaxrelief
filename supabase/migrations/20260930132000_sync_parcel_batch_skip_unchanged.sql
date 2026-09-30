-- Statewide parcel sync: write nothing for parcels that have not changed.
--
-- On 2026-09-30 the "Statewide parcel sync" workflow took the production
-- database down. A workflow condition started a full statewide pass on every
-- 6-hourly schedule (fixed in .github/workflows/parcel-composite-sync.yml),
-- and sync_parcel_batch() rewrote every one of the ~3.48M parcels on every
-- pass: its ON CONFLICT DO UPDATE had no guard and always set
-- source_synced_at = now(), so each row got a new tuple and new index entries
-- (~3.5-4 GB of WAL per pass) even when the state data had not changed.
--
-- This redefines sync_parcel_batch(jsonb) with the same signature, security
-- definer, search_path, grants and column mapping as
-- 20260928231000_parcel_mailing_zip_privacy.sql (so it still neither accepts
-- nor writes the owner's mailing ZIP), plus one rule:
--
--   An existing parcel is rewritten only when the update would change at
--   least one synced column, or when its source_synced_at is missing or older
--   than 20 days.
--
-- The age condition exists because the public property page shows
-- source_synced_at as "Updated <month year>" (api/watchdog-property-page.js),
-- so the monthly full pass (3rd of the month) must still refresh it once a
-- month. Any other pass inside the month writes nothing for unchanged parcels.
--
-- "Would change" compares the stored row with the values the update would
-- write (the same coalesce() expressions as the SET list), not with the raw
-- incoming values: where the state sends a blank the update keeps the stored
-- value, and comparing with the blank would rewrite that parcel on every pass.
--
-- The rule is checked twice:
-- 1. In the "pending" CTE, before the insert. ON CONFLICT DO UPDATE locks the
--    conflicting row even when its WHERE clause is false (a WAL record and a
--    dirty page per parcel), so unchanged parcels are filtered out first and
--    are never touched.
-- 2. In the WHERE of ON CONFLICT DO UPDATE, against the latest row version,
--    in case the row changed between the snapshot read and the upsert.
--
-- Return value: the number of parcels actually inserted or rewritten.
-- Skipped (unchanged and recently synced) parcels are NOT counted, so the
-- loader's rows_written now means rows the database really wrote.
--
-- Safe to re-run: one create or replace function plus idempotent revoke and
-- grant. No table rewrite, no index build, no bulk UPDATE (a one-shot UPDATE
-- of ~3M rows caused the 2026-09-28 outage; see 20260928231000).

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
      pams_pin text, address text, town text, county text,
      block text, lot text, qualifier text, prop_class text,
      year_built integer, acres numeric, dwelling_units integer, building_desc text,
      land_value bigint, improvement_value bigint, assessed_value bigint, last_year_tax numeric,
      last_sale_price bigint, last_sale_year integer, last_sale_date date, sales_code text
    )
    where r.pams_pin ~ '^\d{4}_'
    order by r.pams_pin
  ), incoming as (
    select
      pams_pin, coalesce(nullif(address, ''), 'BLOCK ' || coalesce(block, '') || ' LOT ' || coalesce(lot, '')) as address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code
    from src
  ), pending as (
    -- New parcels, stale parcels, and parcels whose synced values would change.
    select i.*
    from incoming i
    left join public.property_lookups p on p.pams_pin = i.pams_pin
    where p.pams_pin is null
       or p.source_synced_at is null
       or p.source_synced_at < now() - interval '20 days'
       or (
            p.address, p.town, p.county, p.block, p.lot, p.qualifier, p.prop_class,
            p.year_built, p.acres, p.dwelling_units, p.building_desc,
            p.land_value, p.improvement_value, p.assessed_value, p.last_year_tax,
            p.last_sale_price, p.last_sale_year, p.last_sale_date, p.sales_code
          ) is distinct from (
            coalesce(nullif(i.address, ''), p.address), coalesce(i.town, p.town), coalesce(i.county, p.county),
            coalesce(i.block, p.block), coalesce(i.lot, p.lot), i.qualifier, coalesce(i.prop_class, p.prop_class),
            coalesce(i.year_built, p.year_built), coalesce(i.acres, p.acres), coalesce(i.dwelling_units, p.dwelling_units),
            coalesce(i.building_desc, p.building_desc),
            coalesce(i.land_value, p.land_value), coalesce(i.improvement_value, p.improvement_value),
            coalesce(i.assessed_value, p.assessed_value), coalesce(i.last_year_tax, p.last_year_tax),
            i.last_sale_price, i.last_sale_year, i.last_sale_date, i.sales_code
          )
  ), upserted as (
    insert into public.property_lookups as p (
      pams_pin, address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      lookup_count, source_synced_at
    )
    select
      pams_pin, address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      0, now()
    from pending
    on conflict (pams_pin) do update set
      address = coalesce(nullif(excluded.address, ''), p.address),
      town = coalesce(excluded.town, p.town),
      county = coalesce(excluded.county, p.county),
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
    where p.source_synced_at is null
       or p.source_synced_at < now() - interval '20 days'
       or (
            p.address, p.town, p.county, p.block, p.lot, p.qualifier, p.prop_class,
            p.year_built, p.acres, p.dwelling_units, p.building_desc,
            p.land_value, p.improvement_value, p.assessed_value, p.last_year_tax,
            p.last_sale_price, p.last_sale_year, p.last_sale_date, p.sales_code
          ) is distinct from (
            coalesce(nullif(excluded.address, ''), p.address), coalesce(excluded.town, p.town), coalesce(excluded.county, p.county),
            coalesce(excluded.block, p.block), coalesce(excluded.lot, p.lot), excluded.qualifier, coalesce(excluded.prop_class, p.prop_class),
            coalesce(excluded.year_built, p.year_built), coalesce(excluded.acres, p.acres), coalesce(excluded.dwelling_units, p.dwelling_units),
            coalesce(excluded.building_desc, p.building_desc),
            coalesce(excluded.land_value, p.land_value), coalesce(excluded.improvement_value, p.improvement_value),
            coalesce(excluded.assessed_value, p.assessed_value), coalesce(excluded.last_year_tax, p.last_year_tax),
            excluded.last_sale_price, excluded.last_sale_year, excluded.last_sale_date, excluded.sales_code
          )
    returning 1
  )
  -- Parcels inserted or rewritten; skipped parcels are not counted.
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;

revoke all on function public.sync_parcel_batch(jsonb) from public, anon, authenticated;
grant execute on function public.sync_parcel_batch(jsonb) to service_role;
