-- Privacy fix: remove owner mailing ZIPs from property_lookups.
--
-- In the NJ Parcels and MOD-IV Composite, ZIP5 / ZIP_CODE belong to the
-- OWNER'S MAILING ADDRESS (with ST_ADDRESS and CITY_STATE), not the property.
-- The statewide loader (20260928200000) copied ZIP5 into property_lookups.zip
-- for every synced row, and search_parcels() returned it publicly. Watchdog
-- never stores owner mailing data (see property-mailing-zip-contract.mjs).
--
-- 1. search_parcels() no longer returns or matches on zip.
-- 2. sync_parcel_batch() no longer accepts or writes zip.
-- 3. Stored ZIPs on synced rows are cleared by the throttled job in
--    20260928233000_slow_mailing_zip_purge.sql. (A one-shot UPDATE of ~3M
--    rows here caused a production outage on 2026-09-28; do not reintroduce it.)
--
-- Property ZIPs for the public pages will come from address evidence or a
-- ZIP-boundary lookup, never from the parcel mailing fields.

create or replace function public.search_parcels(p_query text, p_limit integer default 8)
returns table (
  pams_pin text, address text, town text, county text, zip text,
  prop_class text, assessed_value bigint, last_year_tax numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q text := public.parcel_search_norm(left(coalesce(p_query, ''), 120));
  v_tokens text[];
  v_house text;
  v_word text;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  -- Drop a trailing state / ZIP ("..., NJ 07029").
  v_q := trim(regexp_replace(v_q, '( NJ| NEW JERSEY)?( \d{5}(\d{4})?)?$', ''));
  v_tokens := regexp_split_to_array(v_q, ' ');
  if coalesce(array_length(v_tokens, 1), 0) < 2 then
    return;
  end if;
  v_house := v_tokens[1];
  v_word := v_tokens[2];
  if v_house !~ '^\d+[A-Z]?(-\d+[A-Z]?)?$' or length(v_word) < 1 then
    return;
  end if;

  return query
  with cand as (
    select p.pams_pin, p.address, p.town, p.county, null::text as zip, p.prop_class, p.assessed_value, p.last_year_tax,
           public.parcel_search_norm(p.address) as norm
    from public.property_lookups p
    where p.county is not null and p.county <> ''
      and p.address like (v_house || ' ' || v_word || '%')
    limit 400
  ), scored as (
    select c.*,
      (case when c.norm = v_q then 100
            when v_q like c.norm || ' %' then 90          -- full street typed, then town words
            when c.norm like v_q || '%' then 70            -- still typing the street
            else 0 end)
      + (select count(*)::int * 5 from unnest(v_tokens[3:]) t
           where length(t) >= 3 and (upper(coalesce(c.town, '')) like '%' || t || '%' or upper(coalesce(c.county, '')) = t)) as score
    from cand c
  )
  select s.pams_pin, s.address, s.town, s.county, s.zip, s.prop_class, s.assessed_value, s.last_year_tax
  from scored s
  where s.score > 0
  order by s.score desc, length(s.address), s.address, s.town
  limit v_limit;
end;
$$;


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
  ), upserted as (
    insert into public.property_lookups as p (
      pams_pin, address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      lookup_count, source_synced_at
    )
    select
      pams_pin, coalesce(nullif(address, ''), 'BLOCK ' || coalesce(block, '') || ' LOT ' || coalesce(lot, '')), town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      0, now()
    from src
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
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;
