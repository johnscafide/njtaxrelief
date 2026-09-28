-- Property pages, part 2: nearby recent sales, the homeowner's approved photo,
-- and PDF report requests.
--
-- 1. property_report_requests: who asked for a PDF property report. The
--    requester gives name, phone, mailing address and email and agrees to be
--    contacted about the property; these are the requester's own details
--    (never the property owner's). Server-only table, written by
--    api/watchdog-property-report.js with the service key.
-- 2. get_public_property_page() adds:
--    - recent_sales: up to 6 sales of $10,000+ of the same property class in
--      the same town in the last 3 years (the state list runs about a year
--      behind), same street first, then nearest block number, then newest;
--    - sales_summary: count, median price and date range of those sales;
--    The MOD-IV SALES_CODE letters (A, I, Z, ...) are not the SR-1A numbered
--    non-usable codes, and their meaning is unconfirmed, so they are not used
--    to label or filter sales. sale_flagged_non_market is always false.
--    - photo_path: the homeowner's approved, still-licensed contribution photo
--      (property_photos, moderation_status = 'approved'); the page function
--      signs a URL for it.

create table if not exists public.property_report_requests (
  id uuid primary key default gen_random_uuid(),
  pams_pin text not null,
  property_address text,
  full_name text not null check (length(full_name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 10 and 15),
  mailing_address text not null check (length(mailing_address) between 8 and 300),
  contact_consent boolean not null check (contact_consent),
  consent_text text not null,
  client_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists property_report_requests_created_idx on public.property_report_requests (created_at desc);
create index if not exists property_report_requests_client_idx on public.property_report_requests (client_hash, created_at desc);
alter table public.property_report_requests enable row level security;
revoke all on public.property_report_requests from anon, authenticated;

-- Recent sales, precomputed. Filtering a large town live took ~0.6 s per page
-- on this database, so the last 3 years of $10,000+ sales are copied into a
-- small table, rebuilt monthly the day after the parcel sync.
create table if not exists public.public_recent_sales (
  pams_pin text primary key,
  town text not null,
  county text not null,
  prop_class text not null default '',
  address text,
  street text,
  block_num numeric,
  price bigint not null,
  sale_date date not null,
  year_built integer,
  assessed_value bigint
);
create index if not exists public_recent_sales_town_idx on public.public_recent_sales (town, county, prop_class, sale_date desc);
alter table public.public_recent_sales enable row level security;
revoke all on public.public_recent_sales from anon, authenticated;

create or replace function public.refresh_public_recent_sales()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '10min'
as $$
declare
  v_count integer;
begin
  delete from public.public_recent_sales;
  insert into public.public_recent_sales (pams_pin, town, county, prop_class, address, street, block_num, price, sale_date, year_built, assessed_value)
  select l.pams_pin, l.town, l.county, coalesce(l.prop_class, ''), l.address,
         regexp_replace(upper(coalesce(l.address, '')), '^\S+\s+', ''),
         nullif(substring(coalesce(l.block, '') from '^[0-9]+'), '')::numeric,
         l.last_sale_price, l.last_sale_date, l.year_built, l.assessed_value
  from public.property_lookups l
  where l.county is not null and l.county <> '' and l.town is not null
    and l.last_sale_date >= (current_date - interval '3 years')
    and l.last_sale_price >= 10000;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.refresh_public_recent_sales() from public, anon, authenticated;
grant execute on function public.refresh_public_recent_sales() to service_role;

select cron.schedule('watchdog-recent-sales', '39 6 4 * *', 'select public.refresh_public_recent_sales();');

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
  v_sales jsonb;
  v_sales_summary jsonb;
  v_photo text;
  v_street text;
  v_blocknum numeric;
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

  -- Recent sales nearby: same town and class (public_recent_sales).
  v_street := regexp_replace(upper(coalesce(v_row.address, '')), '^\S+\s+', '');
  v_blocknum := nullif(substring(coalesce(v_row.block, '') from '^[0-9]+'), '')::numeric;
  with s as (
    select r.pams_pin, r.address, r.town, r.price as last_sale_price, r.sale_date as last_sale_date, r.year_built, r.assessed_value,
           r.street = v_street as same_street,
           abs(coalesce(r.block_num, 1e9) - coalesce(v_blocknum, 0)) as block_gap
    from public.public_recent_sales r
    where r.town = v_row.town and r.county = v_row.county and r.prop_class = coalesce(v_row.prop_class, '')
      and r.pams_pin <> v_row.pams_pin
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('pams_pin', x.pams_pin, 'address', x.address, 'town', x.town,
                'price', x.last_sale_price, 'date', x.last_sale_date, 'year_built', x.year_built,
                'assessed_value', x.assessed_value, 'same_street', x.same_street) order by x.same_street desc, x.block_gap, x.last_sale_date desc)
              from (select * from s order by same_street desc, block_gap, last_sale_date desc limit 6) x), '[]'::jsonb),
    (select jsonb_build_object('count', count(*),
              'median', round(percentile_cont(0.5) within group (order by last_sale_price)::numeric, 0),
              'first_date', min(last_sale_date), 'last_date', max(last_sale_date))
     from s)
  into v_sales, v_sales_summary;

  select ph.storage_path into v_photo
  from public.property_photos ph
  where ph.pams_pin = v_row.pams_pin and ph.visibility = 'contribution' and ph.moderation_status = 'approved'
    and ph.contribution_revoked_at is null
  order by ph.is_primary desc, ph.updated_at desc
  limit 1;

  return jsonb_build_object(
    'pams_pin', v_row.pams_pin, 'address', v_row.address, 'town', v_row.town, 'county', v_row.county, 'zip', v_row.zip,
    'block', v_row.block, 'lot', v_row.lot, 'qualifier', v_row.qualifier, 'prop_class', v_row.prop_class,
    'year_built', v_row.year_built, 'acres', v_row.acres, 'dwelling_units', v_row.dwelling_units, 'building_desc', v_row.building_desc,
    'land_value', v_row.land_value, 'improvement_value', v_row.improvement_value, 'assessed_value', v_row.assessed_value,
    'last_year_tax', v_row.last_year_tax,
    'last_sale_price', nullif(v_row.last_sale_price, 0), 'last_sale_date', v_row.last_sale_date, 'last_sale_year', v_row.last_sale_year,
    'sale_flagged_non_market', false,
    'source_synced_at', v_row.source_synced_at,
    'score', v_score, 'town_compare', v_town, 'neighbors', v_neighbors,
    'recent_sales', v_sales, 'sales_summary', v_sales_summary, 'photo_path', v_photo);
end;
$$;

revoke all on function public.get_public_property_page(text) from public, anon, authenticated;
grant execute on function public.get_public_property_page(text) to service_role;

select public.refresh_public_recent_sales();
