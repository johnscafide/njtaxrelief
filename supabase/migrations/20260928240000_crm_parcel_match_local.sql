-- CRM address matching against Watchdog's statewide parcel copy.
--
-- integration-crm-resolution-worker looked CRM addresses up in the NJOGIS parcel
-- service filtered on ZIP5. ZIP5 on that layer is the owner's mailing ZIP, not the
-- property's (Cherry Hill parcels carry 19801, 19056, 08108 ...), so rentals, second
-- homes and trust/LLC-owned properties never matched, and busy ZIPs were cut off at
-- 100 results. Most misses (718 of 821 on 2026-09-28) had no ZIP at all, because
-- BoldTrail often keeps the whole address in the street field
-- ("91 Farnwood Rd Mount Laurel NJ 08054") and leaves city, state and ZIP empty.
--
-- The worker now asks integration_find_crm_parcels(), which matches against
-- public.property_lookups (every NJ parcel, filled by the statewide parcel sync):
-- 1. watchdog_split_address() pulls city, state and ZIP out of one-line street fields.
-- 2. watchdog_norm_street() normalizes both sides the same way. Only parcels with
--    the same house number are compared (a text_pattern_ops index range), so a
--    lookup reads a few thousand rows, not 3.5 million.
-- 3. The parcel's town has to fit the contact: the towns a ZIP serves
--    (nj_zip_districts), the city name, or, when the contact gives neither, the
--    address has to be the only one in New Jersey.
-- Results stay candidates that a person reviews. Nothing here verifies a link.

-- Street normalization. Same rules as normalizeStreet() in the worker, plus ROUTE/RTE -> RT
-- and AV -> AVE, which is how MOD-IV writes them.
create or replace function public.watchdog_norm_street(p text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(array_to_string(array(
    select case t
      when 'STREET' then 'ST' when 'AVENUE' then 'AVE' when 'AV' then 'AVE' when 'ROAD' then 'RD'
      when 'DRIVE' then 'DR' when 'LANE' then 'LN' when 'COURT' then 'CT' when 'BOULEVARD' then 'BLVD'
      when 'CIRCLE' then 'CIR' when 'PARKWAY' then 'PKWY' when 'HIGHWAY' then 'HWY' when 'TERRACE' then 'TER'
      when 'PLACE' then 'PL' when 'TRAIL' then 'TRL' when 'TURNPIKE' then 'TPKE' when 'ROUTE' then 'RT'
      when 'RTE' then 'RT' when 'NORTH' then 'N' when 'SOUTH' then 'S' when 'EAST' then 'E' when 'WEST' then 'W'
      else t end
    from unnest(regexp_split_to_array(btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(upper(coalesce(p, '')), '&', ' AND ', 'g'),
              '[.,'']', ' ', 'g'),
            '#', ' UNIT ', 'g'),
          '\m(APARTMENT|APT|UNIT|STE|SUITE)\M', ' UNIT ', 'g'),
        '[^A-Z0-9-]+', ' ', 'g')), ' +')) with ordinality as x(t, i)
    order by i
  ), ' '), '\mUNIT UNIT\M', 'UNIT', 'g'), '')
$$;

-- Municipality / city name key: "CHERRY HILL TWNSHP" and "Cherry Hill" both become "CHERRY HILL".
create or replace function public.watchdog_town_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(upper(coalesce(p, '')), '[^A-Z]+', ' ', 'g'),
      '\m(CITY OF|TOWNSHIP OF|BOROUGH OF|TOWN OF|VILLAGE OF|TOWNSHIP|TWNSHP|TWP|BOROUGH|BORO|CITY|TOWN|VILLAGE)\M', ' ', 'g'),
      '\mMT\M', 'MOUNT', 'g'), '\mN\M', 'NORTH', 'g'), '\mS\M', 'SOUTH', 'g'),
      '\mE\M', 'EAST', 'g'), '\mW\M', 'WEST', 'g'),
    ' +', ' ', 'g')), '')
$$;

-- Split a CRM address into street, city, state and ZIP. Separate fields win; a
-- one-line street field ("12 Main St, Rahway, NJ 07065" or "91 Farnwood Rd Mount
-- Laurel NJ 08054") fills whatever is empty. Letter case is kept.
create or replace function public.watchdog_split_address(p_street text, p_city text, p_region text, p_zip text)
returns table (street text, city text, region text, zip text)
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  s text := btrim(regexp_replace(coalesce(p_street, ''), '\s+', ' ', 'g'));
  c text := btrim(coalesce(p_city, ''));
  r text := upper(btrim(coalesce(p_region, '')));
  z text := coalesce(substring(coalesce(p_zip, '') from '(\d{5})'), '');
  m text;
  parts text[];
  toks text[];
  n integer;
  cut integer := 0;
  tok text;
  one_line boolean := false;
begin
  if r in ('NEW JERSEY', 'N J', 'N.J.', 'N.J') then r := 'NJ'; end if;

  s := regexp_replace(s, '[,\s]+(USA|U\.?S\.?A\.?|US|UNITED STATES)\.?$', '', 'i');

  m := substring(s from '(?:^|[,\s])(\d{5})(?:-\d{4})?$');
  if m is not null then
    if z = '' then z := m; end if;
    s := regexp_replace(s, '[,\s]*\d{5}(-\d{4})?$', '');
    one_line := true;
  end if;

  if s ~* '[,\s](NJ|N\.J\.?|NEW JERSEY)$' then
    if r = '' then r := 'NJ'; end if;
    s := regexp_replace(s, '[,\s]+(NJ|N\.J\.?|NEW JERSEY)$', '', 'i');
    one_line := true;
  elsif s ~ ',\s*[A-Za-z]{2}$' then
    if r = '' then r := upper(substring(s from ',\s*([A-Za-z]{2})$')); end if;
    s := regexp_replace(s, ',\s*[A-Za-z]{2}$', '');
    one_line := true;
  end if;
  s := btrim(s, ' ,');

  parts := regexp_split_to_array(s, '\s*,\s*');
  if coalesce(array_length(parts, 1), 0) >= 2 then
    -- "12 Main St, Apt 2, Rahway": unit parts stay with the street, the last part is the city.
    s := parts[1];
    for i in 2 .. array_length(parts, 1) loop
      if parts[i] ~* '^(APT|APARTMENT|UNIT|STE|SUITE|#)' then
        s := s || ' ' || parts[i];
      elsif c = '' and i = array_length(parts, 1) then
        c := parts[i];
      end if;
    end loop;
  elsif c = '' and one_line then
    -- "91 Farnwood Rd Mount Laurel": the city starts after the last street suffix (and unit).
    toks := regexp_split_to_array(s, ' ');
    n := coalesce(array_length(toks, 1), 0);
    for i in 2 .. n - 1 loop
      tok := upper(regexp_replace(toks[i], '\.$', ''));
      if tok in ('ST', 'STREET', 'AVE', 'AVENUE', 'AV', 'RD', 'ROAD', 'DR', 'DRIVE', 'LN', 'LANE', 'CT', 'COURT',
                 'BLVD', 'BOULEVARD', 'CIR', 'CIRCLE', 'PKWY', 'PARKWAY', 'HWY', 'HIGHWAY', 'TER', 'TERRACE',
                 'PL', 'PLACE', 'TRL', 'TRAIL', 'TPKE', 'TURNPIKE', 'WAY', 'PIKE', 'ALY', 'SQ', 'LOOP', 'RUN',
                 'PATH', 'ROW', 'XING', 'PLZ', 'PLAZA', 'EXT') then
        cut := i;
      elsif tok in ('APT', 'APARTMENT', 'UNIT', 'STE', 'SUITE') and i < n - 1 then
        cut := i + 1;
      elsif toks[i] ~ '^#' and cut = i - 1 then
        cut := i;
      end if;
    end loop;
    if cut > 0 and cut < n then
      c := array_to_string(toks[cut + 1 : n], ' ');
      s := array_to_string(toks[1 : cut], ' ');
    end if;
  end if;

  street := nullif(btrim(s, ' ,'), '');
  city := nullif(btrim(c, ' ,'), '');
  region := nullif(r, '');
  zip := nullif(z, '');
  return next;
end;
$$;

-- House-number range scans on the parcel address ("12 " .. "12!"). An expression
-- index on watchdog_norm_street() was too slow to build over 3.5 million rows.
create index if not exists property_lookups_address_pattern_idx
  on public.property_lookups (address text_pattern_ops);

-- Which municipalities (Treasury district codes, the first four characters of a
-- PAMS PIN) each NJ ZIP serves. Parcel records carry the owner's mailing ZIP and
-- owner-occupied homes carry their own, so the towns a ZIP really covers hold a
-- real share of its parcels; out-of-town owners show up as small shares and are
-- left out.
create table if not exists public.nj_zip_districts (
  zip text not null,
  district_code text not null,
  parcels integer not null,
  zip_share numeric(6, 4) not null,
  refreshed_at timestamptz not null default now(),
  primary key (zip, district_code)
);
alter table public.nj_zip_districts enable row level security;
revoke all on table public.nj_zip_districts from public, anon, authenticated;

create or replace function public.refresh_nj_zip_districts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  create temporary table nj_zip_district_counts on commit drop as
    select left(p.zip, 5) as zip, left(p.pams_pin, 4) as district_code, count(*)::integer as parcels
      from public.property_lookups p
     where p.zip ~ '^0[78]\d{3}' and p.pams_pin ~ '^\d{4}_'
     group by 1, 2;

  delete from public.nj_zip_districts;
  insert into public.nj_zip_districts (zip, district_code, parcels, zip_share)
  select d.zip, d.district_code, d.parcels, round(d.parcels::numeric / t.total, 4)
    from nj_zip_district_counts d
    join (select zip, sum(parcels) as total from nj_zip_district_counts group by zip) t using (zip)
   where d.parcels >= 10
     and d.parcels::numeric / t.total >= 0.02;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.refresh_nj_zip_districts() from public, anon, authenticated;
grant execute on function public.refresh_nj_zip_districts() to service_role;

-- Rebuild the day after the monthly statewide parcel sync (3rd of the month).
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'watchdog-nj-zip-districts' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('watchdog-nj-zip-districts', '13 6 4 * *', 'select public.refresh_nj_zip_districts();');
end $$;

-- Candidate parcels for one CRM address. Service role only (the resolution worker).
create or replace function public.integration_find_crm_parcels(
  p_street text,
  p_city text default null,
  p_region text default null,
  p_zip text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  a record;
  v_norm text;
  v_house text;
  v_key text;
  v_city_key text;
  v_all jsonb;
  v_pick jsonb := '[]'::jsonb;
  v_policy text;
  v_match text := 'exact';
  v_statewide integer;
  v_zip_known boolean := false;
  v_out jsonb;
begin
  select * into a from public.watchdog_split_address(p_street, p_city, p_region, p_zip);
  v_norm := public.watchdog_norm_street(a.street);
  v_city_key := public.watchdog_town_key(a.city);
  v_out := jsonb_build_object('street', a.street, 'city', a.city, 'region', a.region, 'zip', a.zip, 'norm', v_norm);

  if a.region is not null and a.region <> 'NJ' then
    return v_out || jsonb_build_object('status', 'non_nj', 'parcels', '[]'::jsonb);
  end if;
  if v_norm is null or v_norm !~ '^[0-9]' then
    return v_out || jsonb_build_object('status', 'no_match', 'reason', 'no_house_number', 'parcels', '[]'::jsonb);
  end if;
  v_house := split_part(v_norm, ' ', 1);
  -- The street's most distinctive word ("FARNWOOD" in "91 FARNWOOD RD") must appear in the
  -- parcel address before the full normalization runs; suffixes and directions can be spelled out.
  select t into v_key
    from unnest(string_to_array(regexp_replace(v_norm, ' UNIT .*$', ''), ' ')) with ordinality as u(t, i)
   where i > 1 and t not in ('ST', 'AVE', 'RD', 'DR', 'LN', 'CT', 'BLVD', 'CIR', 'PKWY', 'HWY', 'TER', 'PL',
                             'TRL', 'TPKE', 'RT', 'N', 'S', 'E', 'W', 'UNIT', 'AND')
   order by length(t) desc, i
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('pams_pin', p.pams_pin, 'address', p.address, 'town', p.town,
           'county', p.county, 'district', left(p.pams_pin, 4)) order by p.pams_pin), '[]'::jsonb)
    into v_all
    from public.property_lookups p
   where p.address in (
     select q.address from (
       -- Index-only: addresses with this house number that contain the key word.
       select distinct r.address from public.property_lookups r
        where r.address ~>=~ (v_house || ' ') and r.address ~<~ (v_house || '!')
          and (v_key is null or strpos(upper(r.address), v_key) > 0)
     ) q
     where public.watchdog_norm_street(q.address) = v_norm);

  -- "12 Main St Unit 4" when the parcel record has no unit.
  if jsonb_array_length(v_all) = 0 and v_norm ~ ' UNIT ' then
    select coalesce(jsonb_agg(jsonb_build_object('pams_pin', p.pams_pin, 'address', p.address, 'town', p.town,
             'county', p.county, 'district', left(p.pams_pin, 4)) order by p.pams_pin), '[]'::jsonb)
      into v_all
      from public.property_lookups p
     where p.address in (
       select q.address from (
         select distinct r.address from public.property_lookups r
          where r.address ~>=~ (v_house || ' ') and r.address ~<~ (v_house || '!')
            and (v_key is null or strpos(upper(r.address), v_key) > 0)
       ) q
       where public.watchdog_norm_street(q.address) = regexp_replace(v_norm, ' UNIT .*$', ''));
    v_match := 'unit_base';
  end if;

  v_statewide := jsonb_array_length(v_all);
  if v_statewide = 0 then
    return v_out || jsonb_build_object('status', 'no_match', 'reason', 'address_not_in_nj_parcels',
      'parcels', '[]'::jsonb, 'statewide_count', 0);
  end if;

  if a.zip is not null then
    v_zip_known := exists (select 1 from public.nj_zip_districts d where d.zip = a.zip);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_pick
      from jsonb_array_elements(v_all) x
     where exists (select 1 from public.nj_zip_districts d where d.zip = a.zip and d.district_code = x->>'district');
    if jsonb_array_length(v_pick) > 0 then v_policy := 'zip_district'; end if;
  end if;

  if v_policy is null and v_city_key is not null then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_pick
      from jsonb_array_elements(v_all) x
     where public.watchdog_town_key(x->>'town') = v_city_key;
    if jsonb_array_length(v_pick) > 0 then v_policy := 'city_town'; end if;
  end if;

  -- Only one parcel in New Jersey has this address, and no known ZIP points elsewhere.
  if v_policy is null and v_statewide = 1 and not v_zip_known then
    v_pick := v_all;
    v_policy := 'statewide_unique';
  end if;

  if v_policy is null then
    return v_out || jsonb_build_object('status', 'no_match',
      'reason', case when v_zip_known then 'address_outside_zip'
                     when v_statewide > 1 then 'address_in_several_towns'
                     else 'no_town_evidence' end,
      'parcels', '[]'::jsonb, 'statewide_count', v_statewide);
  end if;
  return v_out || jsonb_build_object('status', 'candidates', 'policy', v_policy, 'address_match', v_match,
    'parcels', v_pick, 'statewide_count', v_statewide);
end;
$$;
revoke all on function public.integration_find_crm_parcels(text, text, text, text) from public, anon, authenticated;
grant execute on function public.integration_find_crm_parcels(text, text, text, text) to service_role;
