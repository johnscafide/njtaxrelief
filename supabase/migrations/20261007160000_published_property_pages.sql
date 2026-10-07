-- Published property pages: /nj/<town>/<address>-<zip>.
--
-- Every NJ parcel can already be shown by api/watchdog-property-page.js. A
-- property is "published" (open to search engines and listed in
-- /sitemap-properties.xml) the first time someone searches it on Watchdog.
-- That keeps the indexed set to properties people actually look up instead
-- of all ~3.4M parcels at once.
--
-- property_zip is the property's own ZIP from the address search, never the
-- MOD-IV ZIP column (that is the owner's mailing ZIP, see
-- 20260929010000_property_page_no_mailing_zip.sql). The slug is set on first
-- publish and never changes, so shared links stay put.
--
-- Server-only: api/watchdog-property-page.js calls these with the service key.

create table if not exists public.public_property_pages (
  pams_pin text primary key,
  town_slug text not null check (town_slug ~ '^[a-z0-9-]{1,80}$'),
  page_slug text not null check (page_slug ~ '^[a-z0-9-]{1,120}$'),
  property_zip text check (property_zip ~ '^0[78][0-9]{3}$'),
  postal_city text check (length(postal_city) <= 40),
  first_searched_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now(),
  search_count integer not null default 1,
  unique (town_slug, page_slug)
);
create index if not exists public_property_pages_first_searched_idx
  on public.public_property_pages (first_searched_at desc);
alter table public.public_property_pages enable row level security;
revoke all on public.public_property_pages from anon, authenticated;

-- Publish (or re-touch) a property page. Returns the page path. The pin must
-- be a real parcel with a tax record. If another parcel already holds the
-- same town + slug (two units at one street address), the block and lot are
-- added to keep it unique.
create or replace function public.publish_public_property_page(
  p_pin text, p_town_slug text, p_page_slug text, p_zip text default null, p_city text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.public_property_pages%rowtype;
  v_parcel record;
  v_slug text;
  v_zip text := case when p_zip ~ '^0[78][0-9]{3}$' then p_zip end;
  v_city text := nullif(left(regexp_replace(coalesce(p_city, ''), '[^A-Za-z .''-]', '', 'g'), 40), '');
begin
  update public.public_property_pages
     set last_searched_at = now(), search_count = search_count + 1,
         property_zip = coalesce(property_zip, v_zip), postal_city = coalesce(postal_city, v_city)
   where pams_pin = p_pin
  returning * into v_row;
  if found then
    return '/nj/' || v_row.town_slug || '/' || v_row.page_slug;
  end if;

  select p.block, p.lot, p.qualifier into v_parcel
  from public.property_lookups p
  where p.pams_pin = left(coalesce(p_pin, ''), 80)
    and p.county is not null and p.county <> '';
  if not found then
    return null;
  end if;
  if p_town_slug !~ '^[a-z0-9-]{1,80}$' or p_page_slug !~ '^[a-z0-9-]{1,100}$' then
    return null;
  end if;

  v_slug := p_page_slug;
  if exists (select 1 from public.public_property_pages where town_slug = p_town_slug and page_slug = v_slug) then
    v_slug := left(p_page_slug || '-' || trim(both '-' from regexp_replace(lower(
      'block-' || coalesce(v_parcel.block, '') || '-lot-' || coalesce(v_parcel.lot, '') ||
      coalesce('-' || nullif(v_parcel.qualifier, ''), '')), '[^a-z0-9]+', '-', 'g')), 120);
  end if;

  insert into public.public_property_pages (pams_pin, town_slug, page_slug, property_zip, postal_city)
  values (p_pin, p_town_slug, v_slug, v_zip, v_city)
  on conflict do nothing
  returning * into v_row;
  if not found then
    select * into v_row from public.public_property_pages where pams_pin = p_pin;
    if not found then
      return null;
    end if;
  end if;
  return '/nj/' || v_row.town_slug || '/' || v_row.page_slug;
end;
$$;

-- Page lookups: by slug (the public URL) or by pin (old links, redirects).
create or replace function public.get_public_property_page_slug(p_town_slug text, p_page_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('pams_pin', pams_pin, 'path', '/nj/' || town_slug || '/' || page_slug,
    'property_zip', property_zip, 'postal_city', postal_city, 'first_searched_at', first_searched_at)
  from public.public_property_pages
  where town_slug = p_town_slug and page_slug = p_page_slug;
$$;

create or replace function public.get_public_property_page_by_pin(p_pin text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('pams_pin', pams_pin, 'path', '/nj/' || town_slug || '/' || page_slug,
    'property_zip', property_zip, 'postal_city', postal_city, 'first_searched_at', first_searched_at)
  from public.public_property_pages
  where pams_pin = left(coalesce(p_pin, ''), 80);
$$;

-- Sitemap rows, newest first. lastmod is the later of the first search and
-- the last state parcel sync for that property.
create or replace function public.list_public_property_pages(p_limit integer default 50000, p_offset integer default 0)
returns table (path text, lastmod timestamptz, first_searched_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select '/nj/' || pp.town_slug || '/' || pp.page_slug,
         greatest(pp.first_searched_at, coalesce(p.source_synced_at, pp.first_searched_at)),
         pp.first_searched_at
  from public.public_property_pages pp
  left join public.property_lookups p on p.pams_pin = pp.pams_pin
  order by pp.first_searched_at desc
  limit least(greatest(coalesce(p_limit, 50000), 1), 50000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.count_public_property_pages()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.public_property_pages;
$$;

revoke all on function public.publish_public_property_page(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_public_property_page_slug(text, text) from public, anon, authenticated;
revoke all on function public.get_public_property_page_by_pin(text) from public, anon, authenticated;
revoke all on function public.list_public_property_pages(integer, integer) from public, anon, authenticated;
revoke all on function public.count_public_property_pages() from public, anon, authenticated;
grant execute on function public.publish_public_property_page(text, text, text, text, text) to service_role;
grant execute on function public.get_public_property_page_slug(text, text) to service_role;
grant execute on function public.get_public_property_page_by_pin(text) to service_role;
grant execute on function public.list_public_property_pages(integer, integer) to service_role;
grant execute on function public.count_public_property_pages() to service_role;
