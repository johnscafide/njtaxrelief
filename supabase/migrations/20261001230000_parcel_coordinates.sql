-- Parcel center points in property_lookups, and three public lookups that use them.
--
-- The property lookup popup asks the state ArcGIS parcel layer for nearby
-- sales, neighborhood medians and the neighbors map on every lookup, because
-- property_lookups had lat/lon columns but almost no values (about 0.01% of
-- rows, written by the occasional cache upsert).
--
-- 1. sync_parcel_batch() also takes lat/lon. The statewide parcel sync now
--    requests each parcel's shape in WGS84 and sends its area centroid
--    (property/scripts/sync_parcel_composite.py, centroid()). Same signature,
--    security definer, search_path, grants and skip-unchanged rule as
--    20260930132000_sync_parcel_batch_skip_unchanged.sql, with lat/lon added
--    to the compared columns: the first pass after this migration rewrites
--    each parcel once to add its point (the same work as the monthly
--    refresh), and later passes skip it again because an unchanged shape
--    gives the same rounded point. A blank or out-of-state point keeps the
--    stored one.
--
-- 2. Two small GiST indexes on point(lon, lat): residential (class 2) parcels
--    with a point, the only rows the three lookups read, and the subset with a
--    recorded sale over $50,000 since 2019, so a wide nearby-sales search in a
--    dense area reads only recent sales from disk (the database runs on the
--    smallest compute size). The 2019 floor sits below the six-year window the
--    lookup asks for; rebuild with a later floor in a few years to keep it small.
--
-- 3. get_public_nearby_sales, get_public_neighborhood_stats and
--    get_public_neighbor_parcels: the same filters as the browser's ArcGIS
--    queries in property/js/lookup.js, nearest first and bounded, returning
--    only public-record parcel facts (no owner data, which this table never
--    holds, and no lookup counts or history). Each answer says whether the
--    area has any class 2 parcel with a point ("covered"); the browser falls
--    back to the state layer when it does not, so nothing goes blank before
--    the sync has filled an area.
--
-- Deploy: build the index first without blocking writes, from the SQL editor
-- (CONCURRENTLY cannot run inside a migration transaction):
--
--   create index concurrently if not exists property_lookups_class2_point_idx
--     on public.property_lookups using gist (point(lon, lat))
--     where prop_class = '2' and lat is not null and lon is not null;
--   create index concurrently if not exists property_lookups_class2_sale_point_idx
--     on public.property_lookups using gist (point(lon, lat))
--     where prop_class = '2' and lat is not null and lon is not null
--       and last_sale_price > 50000 and last_sale_year >= 2019;
--
-- then apply this migration; its create index if not exists is then a no-op.
-- No table rewrite and no bulk UPDATE here: the points arrive through the
-- rate-limited, brake-guarded parcel sync. Safe to re-run.

set local lock_timeout = '5s';
set local statement_timeout = '30min';

create index if not exists property_lookups_class2_point_idx
  on public.property_lookups using gist (point(lon, lat))
  where prop_class = '2' and lat is not null and lon is not null;

create index if not exists property_lookups_class2_sale_point_idx
  on public.property_lookups using gist (point(lon, lat))
  where prop_class = '2' and lat is not null and lon is not null
    and last_sale_price > 50000 and last_sale_year >= 2019;

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
      last_sale_price bigint, last_sale_year integer, last_sale_date date, sales_code text,
      lat double precision, lon double precision
    )
    where r.pams_pin ~ '^\d{4}_'
    order by r.pams_pin
  ), incoming as (
    select
      pams_pin, coalesce(nullif(address, ''), 'BLOCK ' || coalesce(block, '') || ' LOT ' || coalesce(lot, '')) as address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      -- A point is kept only when both halves are inside New Jersey.
      case when lat between 38.8 and 41.4 and lon between -75.7 and -73.8 then lat end as lat,
      case when lat between 38.8 and 41.4 and lon between -75.7 and -73.8 then lon end as lon
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
            p.last_sale_price, p.last_sale_year, p.last_sale_date, p.sales_code,
            p.lat, p.lon
          ) is distinct from (
            coalesce(nullif(i.address, ''), p.address), coalesce(i.town, p.town), coalesce(i.county, p.county),
            coalesce(i.block, p.block), coalesce(i.lot, p.lot), i.qualifier, coalesce(i.prop_class, p.prop_class),
            coalesce(i.year_built, p.year_built), coalesce(i.acres, p.acres), coalesce(i.dwelling_units, p.dwelling_units),
            coalesce(i.building_desc, p.building_desc),
            coalesce(i.land_value, p.land_value), coalesce(i.improvement_value, p.improvement_value),
            coalesce(i.assessed_value, p.assessed_value), coalesce(i.last_year_tax, p.last_year_tax),
            i.last_sale_price, i.last_sale_year, i.last_sale_date, i.sales_code,
            coalesce(i.lat, p.lat), coalesce(i.lon, p.lon)
          )
  ), upserted as (
    insert into public.property_lookups as p (
      pams_pin, address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      lat, lon,
      lookup_count, source_synced_at
    )
    select
      pams_pin, address, town, county, block, lot, qualifier, prop_class,
      year_built, acres, dwelling_units, building_desc,
      land_value, improvement_value, assessed_value, last_year_tax,
      last_sale_price, last_sale_year, last_sale_date, sales_code,
      lat, lon,
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
      lat = coalesce(excluded.lat, p.lat),
      lon = coalesce(excluded.lon, p.lon),
      source_synced_at = now()
    where p.source_synced_at is null
       or p.source_synced_at < now() - interval '20 days'
       or (
            p.address, p.town, p.county, p.block, p.lot, p.qualifier, p.prop_class,
            p.year_built, p.acres, p.dwelling_units, p.building_desc,
            p.land_value, p.improvement_value, p.assessed_value, p.last_year_tax,
            p.last_sale_price, p.last_sale_year, p.last_sale_date, p.sales_code,
            p.lat, p.lon
          ) is distinct from (
            coalesce(nullif(excluded.address, ''), p.address), coalesce(excluded.town, p.town), coalesce(excluded.county, p.county),
            coalesce(excluded.block, p.block), coalesce(excluded.lot, p.lot), excluded.qualifier, coalesce(excluded.prop_class, p.prop_class),
            coalesce(excluded.year_built, p.year_built), coalesce(excluded.acres, p.acres), coalesce(excluded.dwelling_units, p.dwelling_units),
            coalesce(excluded.building_desc, p.building_desc),
            coalesce(excluded.land_value, p.land_value), coalesce(excluded.improvement_value, p.improvement_value),
            coalesce(excluded.assessed_value, p.assessed_value), coalesce(excluded.last_year_tax, p.last_year_tax),
            excluded.last_sale_price, excluded.last_sale_year, excluded.last_sale_date, excluded.sales_code,
            coalesce(excluded.lat, p.lat), coalesce(excluded.lon, p.lon)
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

-- Recorded residential sales near a point, newest first. Mirrors lookup.js
-- nearbySalesRaw(): class 2, price over $50,000, deed in the last six years,
-- optionally one town. Nearest 400 inside a square of +/- p_meters.
create or replace function public.get_public_nearby_sales(p_lat double precision, p_lon double precision, p_meters integer default 800, p_town text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_m integer := least(greatest(coalesce(p_meters, 800), 100), 3000);
  v_town text := nullif(left(btrim(coalesce(p_town, '')), 140), '');
  v_kx double precision;
  v_box box;
  v_covered boolean;
  v_sales jsonb;
begin
  if p_lat is null or p_lon is null or not (p_lat between 38.8 and 41.4) or not (p_lon between -75.7 and -73.8) then
    return null;
  end if;
  v_kx := 111320.0 * cos(radians(p_lat));
  v_box := box(point(p_lon - v_m / v_kx, p_lat - v_m / 111320.0), point(p_lon + v_m / v_kx, p_lat + v_m / 111320.0));

  select exists (
    select 1 from public.property_lookups p
    where p.prop_class = '2' and p.lat is not null and p.lon is not null and point(p.lon, p.lat) <@ v_box
  ) into v_covered;
  if not v_covered then
    return jsonb_build_object('covered', false, 'meters', v_m, 'sales', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'address', s.address, 'town', s.town, 'price', s.last_sale_price, 'year', s.last_sale_year,
           'assessed', s.assessed_value, 'built', s.year_built, 'acres', s.acres,
           'dist', round(sqrt(power((s.lon - p_lon) * v_kx, 2) + power((s.lat - p_lat) * 111320.0, 2)))::integer)
         order by s.last_sale_year desc, s.last_sale_price desc), '[]'::jsonb)
    into v_sales
  from (
    select p.address, p.town, p.last_sale_price, p.last_sale_year, p.assessed_value, p.year_built, p.acres, p.lat, p.lon
    from public.property_lookups p
    where p.prop_class = '2' and p.lat is not null and p.lon is not null and point(p.lon, p.lat) <@ v_box
      and p.last_sale_price > 50000
      and p.last_sale_year >= 2019  -- matches property_lookups_class2_sale_point_idx
      and p.last_sale_year >= extract(year from current_date)::integer - 6
      and (v_town is null or p.town = v_town)
    order by point(p.lon, p.lat) <-> point(p_lon, p_lat)
    limit 400
  ) s;

  return jsonb_build_object('covered', true, 'meters', v_m, 'sales', v_sales);
end;
$$;

-- Medians for the residential parcels nearest a point. Mirrors lookup.js
-- neighborhoodStatsRaw(): class 2 with an assessment over $10,000, at most
-- 400 parcels (nearest first) inside a square of +/- p_meters.
create or replace function public.get_public_neighborhood_stats(p_lat double precision, p_lon double precision, p_meters integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_m integer := least(greatest(coalesce(p_meters, 500), 100), 1000);
  v_kx double precision;
  v_box box;
  v_out jsonb;
begin
  if p_lat is null or p_lon is null or not (p_lat between 38.8 and 41.4) or not (p_lon between -75.7 and -73.8) then
    return null;
  end if;
  v_kx := 111320.0 * cos(radians(p_lat));
  v_box := box(point(p_lon - v_m / v_kx, p_lat - v_m / 111320.0), point(p_lon + v_m / v_kx, p_lat + v_m / 111320.0));

  select jsonb_build_object(
           'covered', exists (
             select 1 from public.property_lookups c
             where c.prop_class = '2' and c.lat is not null and c.lon is not null and point(c.lon, c.lat) <@ v_box),
           'meters', v_m,
           'n', count(*),
           'med_assessed', percentile_cont(0.5) within group (order by h.assessed_value),
           'med_tax', percentile_cont(0.5) within group (order by h.last_year_tax) filter (where h.last_year_tax > 100),
           'med_year', percentile_cont(0.5) within group (order by h.year_built) filter (where h.year_built > 1700),
           'med_acres', percentile_cont(0.5) within group (order by h.acres) filter (where h.acres > 0))
    into v_out
  from (
    select p.assessed_value, p.last_year_tax, p.year_built, p.acres
    from public.property_lookups p
    where p.prop_class = '2' and p.lat is not null and p.lon is not null and point(p.lon, p.lat) <@ v_box
      and p.assessed_value > 10000
    order by point(p.lon, p.lat) <-> point(p_lon, p_lat)
    limit 400
  ) h;

  return v_out;
end;
$$;

-- The residential parcels nearest a point, for the opt-in neighborhood map.
-- Mirrors lookup.js hoodParcels(): class 2 with an assessment over $10,000 and
-- a street address, within 500 m, nearest 24, inside a square of +/- p_meters.
create or replace function public.get_public_neighbor_parcels(p_lat double precision, p_lon double precision, p_meters integer default 420)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_m integer := least(greatest(coalesce(p_meters, 420), 100), 500);
  v_kx double precision;
  v_box box;
  v_covered boolean;
  v_rows jsonb;
begin
  if p_lat is null or p_lon is null or not (p_lat between 38.8 and 41.4) or not (p_lon between -75.7 and -73.8) then
    return null;
  end if;
  v_kx := 111320.0 * cos(radians(p_lat));
  v_box := box(point(p_lon - v_m / v_kx, p_lat - v_m / 111320.0), point(p_lon + v_m / v_kx, p_lat + v_m / 111320.0));

  select exists (
    select 1 from public.property_lookups p
    where p.prop_class = '2' and p.lat is not null and p.lon is not null and point(p.lon, p.lat) <@ v_box
  ) into v_covered;
  if not v_covered then
    return jsonb_build_object('covered', false, 'meters', v_m, 'parcels', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pin', n.pams_pin, 'address', n.address, 'town', n.town, 'county', n.county,
           'block', n.block, 'lot', n.lot, 'assessed', n.assessed_value, 'tax', n.last_year_tax,
           'built', n.year_built, 'acres', n.acres, 'sale', n.last_sale_price, 'sale_year', n.last_sale_year,
           'lat', n.lat, 'lon', n.lon, 'dist', n.dist)
         order by n.dist), '[]'::jsonb)
    into v_rows
  from (
    select d.*
    from (
      select p.pams_pin, p.address, p.town, p.county, p.block, p.lot, p.assessed_value, p.last_year_tax,
             p.year_built, p.acres, p.last_sale_price, p.last_sale_year, p.lat, p.lon,
             round(sqrt(power((p.lon - p_lon) * v_kx, 2) + power((p.lat - p_lat) * 111320.0, 2)))::integer as dist
      from public.property_lookups p
      where p.prop_class = '2' and p.lat is not null and p.lon is not null and point(p.lon, p.lat) <@ v_box
        and p.assessed_value > 10000
        and coalesce(p.address, '') <> '' and p.address !~ '^BLOCK .* LOT '
      order by point(p.lon, p.lat) <-> point(p_lon, p_lat)
      limit 200
    ) d
    where d.dist <= 500
    order by d.dist
    limit 24
  ) n;

  return jsonb_build_object('covered', true, 'meters', v_m, 'parcels', v_rows);
end;
$$;

revoke all on function public.get_public_nearby_sales(double precision, double precision, integer, text) from public;
revoke all on function public.get_public_neighborhood_stats(double precision, double precision, integer) from public;
revoke all on function public.get_public_neighbor_parcels(double precision, double precision, integer) from public;
grant execute on function public.get_public_nearby_sales(double precision, double precision, integer, text) to anon, authenticated, service_role;
grant execute on function public.get_public_neighborhood_stats(double precision, double precision, integer) to anon, authenticated, service_role;
grant execute on function public.get_public_neighbor_parcels(double precision, double precision, integer) to anon, authenticated, service_role;
