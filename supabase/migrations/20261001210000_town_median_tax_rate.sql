-- Town median residential tax rate, served from the monthly town stats.
--
-- The property lookup's Trade Up estimator measured a town's tax rate by pulling up
-- to 900 class 2 parcels from the state ArcGIS parcel layer in the browser and taking
-- the median of LAST_YR_TX / NET_VALUE. property_lookups holds the same statewide
-- MOD-IV fields, and refresh_public_town_class_stats() already groups every parcel by
-- town and class once a month (pg_cron, the 4th, after the parcel sync). It now also
-- stores that median (same filters as the browser: assessed > 10,000, tax > 100), and
-- get_public_town_tax_rate() serves it, so the lookup needs no state-server pull.
--
-- Computing it on demand instead was measured at 2.4 s cold for Toms River (38,571
-- parcels), too slow for a public call. The new column is null until the next refresh
-- (or a manual `select public.refresh_public_town_class_stats();`); the lookup keeps
-- its state-server path as the fallback while it is null.

alter table public.public_town_class_stats
  add column if not exists median_tax_rate numeric,
  add column if not exists rate_peers integer;

create or replace function public.refresh_public_town_class_stats()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '10min'
as $function$
declare
  v_count integer;
begin
  create temporary table town_stats_next on commit drop as
  select t.town, t.county, t.prop_class, count(*)::int as peers,
         round(percentile_cont(0.5) within group (order by t.last_year_tax)::numeric, 0) as median_tax,
         round(percentile_cont(0.5) within group (order by t.assessed_value)::numeric, 0) as median_assessed,
         percentile_disc((select array_agg(g / 100.0 order by g) from generate_series(0, 100) g)) within group (order by t.last_year_tax) as tax_percentiles,
         (count(*) filter (where t.assessed_value > 10000 and t.last_year_tax > 100))::int as rate_peers,
         round((percentile_cont(0.5) within group (order by t.last_year_tax / nullif(t.assessed_value, 0))
           filter (where t.assessed_value > 10000 and t.last_year_tax > 100))::numeric, 6) as median_tax_rate
  from public.property_lookups t
  where t.county is not null and t.county <> '' and t.town is not null and t.prop_class is not null
    and t.last_year_tax > 0
  group by t.town, t.county, t.prop_class
  having count(*) >= 5;

  delete from public.public_town_class_stats s
  where not exists (select 1 from town_stats_next n where n.town = s.town and n.county = s.county and n.prop_class = s.prop_class);

  insert into public.public_town_class_stats as s (town, county, prop_class, peers, median_tax, median_assessed, tax_percentiles, rate_peers, median_tax_rate, refreshed_at)
  select town, county, prop_class, peers, median_tax, median_assessed, tax_percentiles, rate_peers, median_tax_rate, now() from town_stats_next
  on conflict (town, county, prop_class) do update set
    peers = excluded.peers, median_tax = excluded.median_tax, median_assessed = excluded.median_assessed,
    tax_percentiles = excluded.tax_percentiles, rate_peers = excluded.rate_peers,
    median_tax_rate = excluded.median_tax_rate, refreshed_at = excluded.refreshed_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.refresh_public_town_class_stats() from public, anon, authenticated;
grant execute on function public.refresh_public_town_class_stats() to service_role;

-- Public read: one aggregate row per town (class 2 residential). No parcel rows.
create or replace function public.get_public_town_tax_rate(p_town text, p_county text)
returns table(town text, county text, rate_peers integer, median_tax_rate numeric, refreshed_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select s.town, s.county, s.rate_peers, s.median_tax_rate, s.refreshed_at
  from public.public_town_class_stats s
  where s.town = upper(left(trim(coalesce(p_town, '')), 140))
    and s.county = upper(left(trim(coalesce(p_county, '')), 100))
    and s.prop_class = '2'
    and s.median_tax_rate is not null
  limit 1;
$function$;

revoke all on function public.get_public_town_tax_rate(text, text) from public;
grant execute on function public.get_public_town_tax_rate(text, text) to anon, authenticated, service_role;
