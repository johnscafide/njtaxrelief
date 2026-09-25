-- NJW-424: make professional license submission usable and allow service-owned
-- exact verification against the official NJDOBI Real Estate Commission search.

create or replace function public.submit_my_professional_license_v1(p_license_number text)
returns table(verification_status text, verified_professional boolean, submitted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_license text := upper(regexp_replace(coalesce(p_license_number,''), '[[:space:]]', '', 'g'));
  v_now timestamptz := now();
  v_profession text;
  v_source text := 'https://www.nj.gov/dobi/division_rec/licensing/online_Instructions/licSearch.html';
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select primary_profession into v_profession
  from public.watchdog_onboarding_profiles
  where user_id = v_uid
  limit 1;

  if v_profession is distinct from 'real_estate' then
    raise exception 'NJ real-estate license verification is available to real-estate professional profiles';
  end if;

  if v_license !~ '^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$' then
    raise exception 'Enter a valid NJ real-estate license number';
  end if;

  insert into public.professional_license_verifications (
    user_id, license_number, verification_status, verified_professional,
    licensee_name, license_expiration_date, verified_at, verification_due_at,
    submitted_at, reviewed_at, reviewer_id, review_note, source_url, updated_at
  ) values (
    v_uid, v_license, 'pending', false,
    null, null, null, null,
    v_now, null, null, 'Official NJDOBI lookup was unavailable; queued for review.', v_source, v_now
  )
  on conflict (user_id) do update set
    license_number = excluded.license_number,
    verification_status = 'pending',
    verified_professional = false,
    licensee_name = null,
    license_expiration_date = null,
    verified_at = null,
    verification_due_at = null,
    submitted_at = v_now,
    reviewed_at = null,
    reviewer_id = null,
    review_note = excluded.review_note,
    source_url = v_source,
    updated_at = v_now;

  return query select 'pending'::text, false, v_now;
end;
$$;

revoke all on function public.submit_my_professional_license_v1(text) from public, anon;
grant execute on function public.submit_my_professional_license_v1(text) to authenticated;

create or replace function public.verify_professional_license_official_v2(
  p_user_id uuid,
  p_license_number text,
  p_licensee_name text,
  p_source_status text
)
returns table(
  verification_status text,
  verified_professional boolean,
  verification_due_at timestamptz,
  licensee_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_license text := upper(regexp_replace(coalesce(p_license_number,''), '[[:space:]]', '', 'g'));
  v_name text := nullif(left(btrim(coalesce(p_licensee_name,'')),160),'');
  v_status text := lower(btrim(coalesce(p_source_status,'')));
  v_profession text;
  v_now timestamptz := now();
  v_due timestamptz := now() + interval '1 year';
  v_source text := 'https://www.nj.gov/dobi/division_rec/licensing/online_Instructions/licSearch.html';
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_user_id is null then raise exception 'User is required'; end if;
  if v_license !~ '^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$' then
    raise exception 'Invalid NJ real-estate license number';
  end if;
  if v_name is null then raise exception 'Official licensee name is required'; end if;
  if v_status !~ '^active([[:space:]]|$)' then
    raise exception 'Official NJDOBI license status is not active';
  end if;

  select primary_profession into v_profession
  from public.watchdog_onboarding_profiles
  where user_id = p_user_id
  limit 1;

  if v_profession is distinct from 'real_estate' then
    raise exception 'Real-estate professional profile required';
  end if;

  insert into public.professional_license_verifications (
    user_id, license_number, verification_status, verified_professional,
    licensee_name, license_expiration_date, verified_at, verification_due_at,
    submitted_at, reviewed_at, reviewer_id, review_note, source_url, updated_at
  ) values (
    p_user_id, v_license, 'verified', true,
    v_name, null, v_now, v_due,
    v_now, v_now, null,
    'Automatically matched to an active record in the official NJDOBI Real Estate Licensee Search.',
    v_source, v_now
  )
  on conflict (user_id) do update set
    license_number = excluded.license_number,
    verification_status = 'verified',
    verified_professional = true,
    licensee_name = excluded.licensee_name,
    license_expiration_date = null,
    verified_at = v_now,
    verification_due_at = v_due,
    submitted_at = v_now,
    reviewed_at = v_now,
    reviewer_id = null,
    review_note = excluded.review_note,
    source_url = v_source,
    updated_at = v_now;

  return query select 'verified'::text, true, v_due, v_name;
end;
$$;

revoke all on function public.verify_professional_license_official_v2(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.verify_professional_license_official_v2(uuid,text,text,text) to service_role;

comment on function public.verify_professional_license_official_v2(uuid,text,text,text) is
  'NJW-424 service-only exact verification from the official NJDOBI Real Estate Licensee Search. Verification never changes plan entitlements.';
