-- Public property pages (/nj/<town>/<address>/<pams_pin>).
--
-- One server-rendered page per NJ property so search engines and shared links
-- can reach what the address popup shows. api/watchdog-property-page.js calls
-- this with the service key; it is not granted to anon or authenticated, so
-- property_lookups stays server-only.
--
-- Returns public-record fields only. Owner names and mailing addresses are
-- never stored, so they cannot be returned. Map-only parcels (no tax record)
-- return null and the page answers 404.

-- Town comparison groups, precomputed. Aggregating a large town live
-- (Woodbridge class 2 is ~26k homes) took 250 ms+ per page view, so the
-- medians and tax-bill percentiles are refreshed monthly (the day after the
-- statewide parcel sync) and each page reads one row.
create table if not exists public.public_town_class_stats (
  town text not null,
  county text not null,
  prop_class text not null,
  peers integer not null,
  median_tax numeric,
  median_assessed numeric,
  tax_percentiles numeric[] not null,
  refreshed_at timestamptz not null default now(),
  primary key (town, county, prop_class)
);
alter table public.public_town_class_stats enable row level security;
revoke all on public.public_town_class_stats from anon, authenticated;

create or replace function public.refresh_public_town_class_stats()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '10min'
as $$
declare
  v_count integer;
begin
  create temporary table town_stats_next on commit drop as
  select t.town, t.county, t.prop_class, count(*)::int as peers,
         round(percentile_cont(0.5) within group (order by t.last_year_tax)::numeric, 0) as median_tax,
         round(percentile_cont(0.5) within group (order by t.assessed_value)::numeric, 0) as median_assessed,
         percentile_disc((select array_agg(g / 100.0 order by g) from generate_series(0, 100) g)) within group (order by t.last_year_tax) as tax_percentiles
  from public.property_lookups t
  where t.county is not null and t.county <> '' and t.town is not null and t.prop_class is not null
    and t.last_year_tax > 0
  group by t.town, t.county, t.prop_class
  having count(*) >= 5;

  delete from public.public_town_class_stats s
  where not exists (select 1 from town_stats_next n where n.town = s.town and n.county = s.county and n.prop_class = s.prop_class);

  insert into public.public_town_class_stats as s (town, county, prop_class, peers, median_tax, median_assessed, tax_percentiles, refreshed_at)
  select town, county, prop_class, peers, median_tax, median_assessed, tax_percentiles, now() from town_stats_next
  on conflict (town, county, prop_class) do update set
    peers = excluded.peers, median_tax = excluded.median_tax, median_assessed = excluded.median_assessed,
    tax_percentiles = excluded.tax_percentiles, refreshed_at = excluded.refreshed_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_public_town_class_stats() from public, anon, authenticated;
grant execute on function public.refresh_public_town_class_stats() to service_role;

select cron.schedule('watchdog-town-class-stats', '29 6 4 * *', 'select public.refresh_public_town_class_stats();');

-- Same-block neighbor lookup. Without it the planner combined the town and
-- county indexes (200k+ county entries) and a page took up to ~450 ms.
create index if not exists property_lookups_town_block_idx
  on public.property_lookups (town, block) where county is not null and county <> '';

create or replace function public.get_public_property_page(p_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.property_lookups%rowtype;
  v_score jsonb;
  v_town jsonb;
  v_neighbors jsonb;
begin
  select * into v_row
  from public.property_lookups p
  where p.pams_pin = left(coalesce(p_pin, ''), 80)
    and p.county is not null and p.county <> '';
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'score', c.score, 'evidence_coverage', c.evidence_coverage, 'confidence', c.confidence,
    'verdict', c.verdict, 'model_version', c.model_version, 'computed_at', c.computed_at,
    'components', c.inputs -> 'components', 'precomputed', coalesce((c.inputs ->> 'precomputed')::boolean, false))
  into v_score
  from public.public_watchdog_score_cache_v1 c
  where c.pams_pin = v_row.pams_pin and c.model_version = 'ROBUST-v1';

  -- Same town, same county, same property class (precomputed monthly).
  -- share_paying_less: how many of the 100 percentile cut points sit below
  -- this bill, i.e. roughly the percent of peers with a smaller bill.
  if v_row.last_year_tax is not null and v_row.last_year_tax > 0 then
    select jsonb_build_object(
      'peers', s.peers, 'median_tax', s.median_tax, 'median_assessed', s.median_assessed,
      'share_paying_less', (select count(*) from unnest(s.tax_percentiles[2:101]) q where q < v_row.last_year_tax),
      'refreshed_at', s.refreshed_at)
    into v_town
    from public.public_town_class_stats s
    where s.town = v_row.town and s.county = v_row.county and s.prop_class = v_row.prop_class;
  end if;

  -- Other properties on the same tax block (uses property_lookups_town_block_idx).
  select coalesce(jsonb_agg(jsonb_build_object('pams_pin', n.pams_pin, 'address', n.address, 'town', n.town,
           'assessed_value', n.assessed_value, 'last_year_tax', n.last_year_tax) order by n.pams_pin), '[]'::jsonb)
  into v_neighbors
  from (
    select pams_pin, address, town, assessed_value, last_year_tax
    from public.property_lookups
    where town = v_row.town and county = v_row.county and county <> '' and block = v_row.block
      and pams_pin <> v_row.pams_pin
    order by pams_pin
    limit 8
  ) n;

  return jsonb_build_object(
    'pams_pin', v_row.pams_pin, 'address', v_row.address, 'town', v_row.town, 'county', v_row.county, 'zip', v_row.zip,
    'block', v_row.block, 'lot', v_row.lot, 'qualifier', v_row.qualifier, 'prop_class', v_row.prop_class,
    'year_built', v_row.year_built, 'acres', v_row.acres, 'dwelling_units', v_row.dwelling_units, 'building_desc', v_row.building_desc,
    'land_value', v_row.land_value, 'improvement_value', v_row.improvement_value, 'assessed_value', v_row.assessed_value,
    'last_year_tax', v_row.last_year_tax,
    'last_sale_price', nullif(v_row.last_sale_price, 0), 'last_sale_date', v_row.last_sale_date, 'last_sale_year', v_row.last_sale_year,
    'sale_flagged_non_market', coalesce(nullif(trim(v_row.sales_code), ''), null) is not null,
    'source_synced_at', v_row.source_synced_at,
    'score', v_score, 'town_compare', v_town, 'neighbors', v_neighbors);
end;
$$;

revoke all on function public.get_public_property_page(text) from public, anon, authenticated;
grant execute on function public.get_public_property_page(text) to service_role;

select public.refresh_public_town_class_stats();
