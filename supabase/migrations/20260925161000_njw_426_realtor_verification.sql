-- NJW-426: REALTOR® verification is a server-owned trust signal.
-- Users may submit membership details but cannot self-verify.

create table if not exists public.professional_realtor_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nar_member_id text not null,
  local_association text,
  proof_url text,
  user_note text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','expired')),
  verified_realtor boolean not null default false,
  member_name text,
  verified_at timestamptz,
  verification_due_at timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null,
  review_note text,
  updated_at timestamptz not null default now(),
  constraint professional_realtor_verifications_member_id_chk
    check (nar_member_id ~ '^[A-Za-z0-9-]{4,32}$'),
  constraint professional_realtor_verifications_proof_url_chk
    check (proof_url is null or proof_url ~ '^https://'),
  constraint professional_realtor_verifications_verified_chk
    check (verified_realtor = (verification_status = 'verified'))
);

alter table public.professional_realtor_verifications enable row level security;

revoke all on table public.professional_realtor_verifications from public, anon;
grant select on table public.professional_realtor_verifications to authenticated, service_role;
grant insert, update, delete on table public.professional_realtor_verifications to service_role;

drop policy if exists "realtor verification owner read" on public.professional_realtor_verifications;
create policy "realtor verification owner read"
on public.professional_realtor_verifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.submit_my_realtor_verification_v1(
  p_nar_member_id text,
  p_local_association text default null,
  p_proof_url text default null,
  p_user_note text default null
)
returns table(
  verification_status text,
  verified_realtor boolean,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id text := upper(regexp_replace(coalesce(p_nar_member_id,''), '[[:space:]]', '', 'g'));
  v_assoc text := nullif(left(btrim(coalesce(p_local_association,'')),160),'');
  v_proof text := nullif(left(btrim(coalesce(p_proof_url,'')),700),'');
  v_note text := nullif(left(btrim(coalesce(p_user_note,'')),1000),'');
  v_now timestamptz := now();
  v_profession text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select primary_profession into v_profession
  from public.watchdog_onboarding_profiles
  where user_id = v_uid
  limit 1;

  if v_profession is distinct from 'real_estate' then
    raise exception 'REALTOR verification is available to real-estate professional profiles';
  end if;

  if v_member_id !~ '^[A-Z0-9-]{4,32}$' then
    raise exception 'Enter a valid NAR Member ID';
  end if;

  if v_proof is not null and v_proof !~ '^https://' then
    raise exception 'Proof URL must use HTTPS';
  end if;

  insert into public.professional_realtor_verifications (
    user_id, nar_member_id, local_association, proof_url, user_note,
    verification_status, verified_realtor, member_name, verified_at,
    verification_due_at, submitted_at, reviewed_at, reviewer_id,
    review_note, updated_at
  ) values (
    v_uid, v_member_id, v_assoc, v_proof, v_note,
    'pending', false, null, null,
    null, v_now, null, null,
    null, v_now
  )
  on conflict (user_id) do update set
    nar_member_id = excluded.nar_member_id,
    local_association = excluded.local_association,
    proof_url = excluded.proof_url,
    user_note = excluded.user_note,
    verification_status = 'pending',
    verified_realtor = false,
    member_name = null,
    verified_at = null,
    verification_due_at = null,
    submitted_at = v_now,
    reviewed_at = null,
    reviewer_id = null,
    review_note = null,
    updated_at = v_now;

  return query select 'pending'::text, false, v_now;
end;
$$;

revoke all on function public.submit_my_realtor_verification_v1(text,text,text,text) from public, anon;
grant execute on function public.submit_my_realtor_verification_v1(text,text,text,text) to authenticated;

create or replace function public.my_realtor_verification_v1()
returns table(
  nar_member_id text,
  local_association text,
  proof_url text,
  user_note text,
  verification_status text,
  verified_realtor boolean,
  member_name text,
  verified_at timestamptz,
  verification_due_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    r.nar_member_id,
    r.local_association,
    r.proof_url,
    r.user_note,
    r.verification_status,
    r.verified_realtor,
    r.member_name,
    r.verified_at,
    r.verification_due_at,
    r.submitted_at,
    r.reviewed_at,
    r.review_note
  from public.professional_realtor_verifications r
  where r.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.my_realtor_verification_v1() from public, anon;
grant execute on function public.my_realtor_verification_v1() to authenticated, service_role;

create or replace function public.is_verified_realtor()
returns boolean
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select r.verified_realtor
    from public.professional_realtor_verifications r
    where r.user_id = (select auth.uid())
      and r.verification_status = 'verified'
      and (r.verification_due_at is null or r.verification_due_at > now())
    limit 1
  ), false);
$$;

revoke all on function public.is_verified_realtor() from public, anon;
grant execute on function public.is_verified_realtor() to authenticated, service_role;

create or replace function public.review_realtor_verification_v1(
  p_user_id uuid,
  p_status text,
  p_member_name text default null,
  p_local_association text default null,
  p_review_note text default null,
  p_verification_due_at timestamptz default null
)
returns table(
  verification_status text,
  verified_realtor boolean,
  verified_at timestamptz,
  verification_due_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_now timestamptz := now();
  v_verified boolean;
  v_due timestamptz;
begin
  if v_status not in ('verified','rejected','expired') then
    raise exception 'Invalid REALTOR verification review status';
  end if;

  v_verified := (v_status = 'verified');
  v_due := case when v_verified then coalesce(p_verification_due_at, v_now + interval '1 year') else null end;

  update public.professional_realtor_verifications
  set verification_status = v_status,
      verified_realtor = v_verified,
      member_name = nullif(left(btrim(coalesce(p_member_name,'')),160),''),
      local_association = coalesce(nullif(left(btrim(coalesce(p_local_association,'')),160),''), local_association),
      verified_at = case when v_verified then v_now else null end,
      verification_due_at = v_due,
      reviewed_at = v_now,
      review_note = nullif(left(btrim(coalesce(p_review_note,'')),1000),''),
      updated_at = v_now
  where user_id = p_user_id;

  if not found then raise exception 'REALTOR verification submission not found'; end if;

  return query select v_status, v_verified, case when v_verified then v_now else null end, v_due;
end;
$$;

revoke all on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) to service_role;

comment on table public.professional_realtor_verifications is
  'NAR REALTOR® membership verification. User-submitted membership details remain unverified until reviewed by Watchdog/NAR-backed process.';
comment on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) is
  'Service-role-only REALTOR verification review. This trust signal does not alter subscription entitlements.';


-- NJW-426 compatibility: NJDOBI currently returns statuses such as
-- "ACTIVELY LICENSED". Keep the service-owned NJ license verifier aligned
-- with the official wording.
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
  if p_user_id is null then raise exception 'User is required'; end if;
  if v_license !~ '^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$' then
    raise exception 'Invalid NJ real-estate license number';
  end if;
  if v_name is null then raise exception 'Official licensee name is required'; end if;
  if v_status !~ '^(active([[:space:]]|$)|actively[[:space:]]+licensed([[:space:]]|$))' then
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
