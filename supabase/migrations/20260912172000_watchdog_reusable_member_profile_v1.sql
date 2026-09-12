-- NJW-335: reusable member profile data shared by Account and ANCHOR/PAS-1.
-- This surface intentionally excludes SSNs, income, disability, tax amounts,
-- recovery keys, encrypted application payloads and tax-year filing status.

alter table public.profiles
  add column if not exists legal_first_name text,
  add column if not exists legal_middle_name text,
  add column if not exists legal_last_name text,
  add column if not exists mailing_address text,
  add column if not exists mailing_city text,
  add column if not exists mailing_state text,
  add column if not exists mailing_zip text,
  add column if not exists municipality_code text,
  add column if not exists reusable_profile_source text,
  add column if not exists reusable_profile_source_application_id uuid,
  add column if not exists reusable_profile_source_tax_year smallint,
  add column if not exists reusable_profile_synced_at timestamptz;

comment on column public.profiles.legal_first_name is 'User-confirmed reusable legal first name. Never derived from SSN/tax data.';
comment on column public.profiles.mailing_address is 'User-confirmed reusable mailing/home address. Separate from governed parcel facts.';
comment on column public.profiles.municipality_code is 'User-confirmed NJ municipality code for reusable relief workflows.';
comment on column public.profiles.reusable_profile_source_application_id is 'Provenance only. References the owned source application id when user explicitly promotes safe fields.';

create or replace function public.set_my_reusable_profile_v1(
  p_application_id uuid default null,
  p_first_name text default null,
  p_middle_name text default null,
  p_last_name text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null,
  p_municipality_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_tax_year smallint;
  v_source text := 'account_profile';
  v_first text := nullif(btrim(coalesce(p_first_name,'')), '');
  v_middle text := nullif(btrim(coalesce(p_middle_name,'')), '');
  v_last text := nullif(btrim(coalesce(p_last_name,'')), '');
  v_address text := nullif(btrim(coalesce(p_address,'')), '');
  v_city text := nullif(btrim(coalesce(p_city,'')), '');
  v_state text := upper(nullif(btrim(coalesce(p_state,'')), ''));
  v_zip text := nullif(btrim(coalesce(p_zip,'')), '');
  v_municipality text := nullif(regexp_replace(coalesce(p_municipality_code,''),'[^0-9]','','g'), '');
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  if p_application_id is not null then
    select tax_year into v_tax_year
      from public.anchor_applications
      where id = p_application_id and user_id = v_uid;
    if not found then raise exception 'application_not_found'; end if;
    v_source := 'anchor_application';
  end if;

  if v_first is not null and char_length(v_first) > 80 then raise exception 'first_name_too_long'; end if;
  if v_middle is not null and char_length(v_middle) > 80 then raise exception 'middle_name_too_long'; end if;
  if v_last is not null and char_length(v_last) > 100 then raise exception 'last_name_too_long'; end if;
  if v_address is not null and char_length(v_address) > 180 then raise exception 'address_too_long'; end if;
  if v_city is not null and char_length(v_city) > 100 then raise exception 'city_too_long'; end if;
  if v_state is not null and v_state !~ '^[A-Z]{2}$' then raise exception 'invalid_state'; end if;
  if v_zip is not null and v_zip !~ '^[0-9]{5}(-[0-9]{4})?$' then raise exception 'invalid_zip'; end if;
  if v_municipality is not null and v_municipality !~ '^[0-9]{4}$' then raise exception 'invalid_municipality_code'; end if;

  insert into public.profiles (
    id, legal_first_name, legal_middle_name, legal_last_name,
    mailing_address, mailing_city, mailing_state, mailing_zip, municipality_code,
    reusable_profile_source, reusable_profile_source_application_id,
    reusable_profile_source_tax_year, reusable_profile_synced_at
  ) values (
    v_uid, v_first, v_middle, v_last,
    v_address, v_city, v_state, v_zip, v_municipality,
    v_source, p_application_id, v_tax_year, v_now
  )
  on conflict (id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    mailing_address = excluded.mailing_address,
    mailing_city = excluded.mailing_city,
    mailing_state = excluded.mailing_state,
    mailing_zip = excluded.mailing_zip,
    municipality_code = excluded.municipality_code,
    reusable_profile_source = excluded.reusable_profile_source,
    reusable_profile_source_application_id = excluded.reusable_profile_source_application_id,
    reusable_profile_source_tax_year = excluded.reusable_profile_source_tax_year,
    reusable_profile_synced_at = excluded.reusable_profile_synced_at;

  return jsonb_build_object(
    'ok', true,
    'source', v_source,
    'source_application_id', p_application_id,
    'source_tax_year', v_tax_year,
    'synced_at', v_now
  );
end;
$function$;

revoke all on function public.set_my_reusable_profile_v1(uuid,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.set_my_reusable_profile_v1(uuid,text,text,text,text,text,text,text,text) to authenticated;
