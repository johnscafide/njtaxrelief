-- Instant statewide address search over property_lookups (3.48M NJ parcels).
--
-- The address box used Google Places, then the NJ geocoder and NJ parcel
-- service for every suggestion: three outside calls per pause in typing.
-- search_parcels() answers from Watchdog's own copy of the state parcel list
-- in one indexed query and returns the public-record fields the suggestion
-- list shows. Owner data is never stored, so it cannot be returned.
--
-- Matching: the house number plus the start of the street name narrows the
-- search through a prefix index; street suffixes (AVENUE/AVE, STREET/ST, ...)
-- and town words then rank the candidates. Map-only parcels (no tax record)
-- are excluded.

create or replace function public.parcel_search_norm(p text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      ' ' || regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9 ]+', ' ', 'g') || ' ',
      ' AVENUE ', ' AVE ', 'g'), ' STREET ', ' ST ', 'g'), ' DRIVE ', ' DR ', 'g'), ' ROAD ', ' RD ', 'g'),
      ' LANE ', ' LN ', 'g'), ' COURT ', ' CT ', 'g'), ' PLACE ', ' PL ', 'g'), ' BOULEVARD ', ' BLVD ', 'g'),
      ' TERRACE ', ' TER ', 'g'), ' CIRCLE ', ' CIR ', 'g'), ' PARKWAY ', ' PKWY ', 'g'), ' HIGHWAY ', ' HWY ', 'g'),
      '\s+', ' ', 'g'));
$$;

create index if not exists property_lookups_address_prefix_idx
  on public.property_lookups (address text_pattern_ops)
  where county is not null and county <> '';

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
    select p.pams_pin, p.address, p.town, p.county, p.zip, p.prop_class, p.assessed_value, p.last_year_tax,
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
           where length(t) >= 3 and (upper(coalesce(c.town, '')) like '%' || t || '%' or upper(coalesce(c.county, '')) = t or coalesce(c.zip, '') = t)) as score
    from cand c
  )
  select s.pams_pin, s.address, s.town, s.county, s.zip, s.prop_class, s.assessed_value, s.last_year_tax
  from scored s
  where s.score > 0
  order by s.score desc, length(s.address), s.address, s.town
  limit v_limit;
end;
$$;

revoke all on function public.search_parcels(text, integer) from public;
grant execute on function public.search_parcels(text, integer) to anon, authenticated, service_role;
grant execute on function public.parcel_search_norm(text) to anon, authenticated, service_role;
