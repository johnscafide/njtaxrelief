-- NJW-63: server-owned NJ real-estate professional verification.
-- Verification is deliberately separate from billing/plan entitlement and never unlocks owner/contact data.

create table if not exists public.professional_license_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  license_number text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','expired')),
  verified_professional boolean not null default false,
  licensee_name text,
  license_expiration_date date,
  verified_at timestamptz,
  verification_due_at timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null,
  review_note text,
  source_url text not null default 'https://www.njconsumeraffairs.gov/Pages/verification.aspx',
  updated_at timestamptz not null default now(),
  constraint professional_license_number_format check (license_number ~ '^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$'),
  constraint professional_verified_state_consistent check (
    (verified_professional = false) or
    (verification_status = 'verified' and verified_at is not null and verification_due_at is not null)
  )
);

alter table public.professional_license_verifications enable row level security;

drop policy if exists professional_license_verifications_select_own on public.professional_license_verifications;
create policy professional_license_verifications_select_own
on public.professional_license_verifications
for select
to authenticated
using (auth.uid() = user_id or public.is_watchdog_developer());

revoke all on public.professional_license_verifications from anon;
revoke insert, update, delete on public.professional_license_verifications from authenticated;
grant select on public.professional_license_verifications to authenticated;

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
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select primary_profession into v_profession
  from public.watchdog_onboarding_profiles
  where user_id = v_uid and status = 'complete' and completed_at is not null;

  if v_profession is distinct from 'real_estate' then
    raise exception 'NJ real-estate license verification is available to real-estate professional profiles';
  end if;

  if v_license !~ '^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$' then
    raise exception 'Enter a valid NJ real-estate license number';
  end if;

  insert into public.professional_license_verifications (
    user_id, license_number, verification_status, verified_professional,
    licensee_name, license_expiration_date, verified_at, verification_due_at,
    submitted_at, reviewed_at, reviewer_id, review_note, updated_at
  ) values (
    v_uid, v_license, 'pending', false,
    null, null, null, null,
    v_now, null, null, null, v_now
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
    review_note = null,
    updated_at = v_now;

  return query select 'pending'::text, false, v_now;
end;
$$;

revoke all on function public.submit_my_professional_license_v1(text) from public, anon;
grant execute on function public.submit_my_professional_license_v1(text) to authenticated;

create or replace function public.review_professional_license_v1(
  p_user_id uuid,
  p_status text,
  p_licensee_name text default null,
  p_license_expiration_date date default null,
  p_note text default null
)
returns table(verification_status text, verified_professional boolean, verification_due_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_now timestamptz := now();
  v_due timestamptz;
  v_verified boolean;
begin
  if v_uid is null or not public.is_watchdog_developer() then
    raise exception 'Developer access required';
  end if;
  if v_status not in ('verified','rejected') then
    raise exception 'Review status must be verified or rejected';
  end if;
  if not exists (select 1 from public.professional_license_verifications where user_id = p_user_id) then
    raise exception 'No submitted license verification exists for this user';
  end if;

  v_verified := v_status = 'verified';
  if v_verified then
    if nullif(btrim(coalesce(p_licensee_name,'')),'') is null then
      raise exception 'Verified licensee name is required';
    end if;
    -- Watchdog re-verifies annually even when the underlying NJ license has a longer cycle.
    v_due := v_now + interval '1 year';
    if p_license_expiration_date is not null then
      v_due := least(v_due, (p_license_expiration_date::timestamp + interval '1 day') at time zone 'America/New_York');
    end if;
  end if;

  update public.professional_license_verifications set
    verification_status = v_status,
    verified_professional = v_verified,
    licensee_name = case when v_verified then left(btrim(p_licensee_name),160) else null end,
    license_expiration_date = case when v_verified then p_license_expiration_date else null end,
    verified_at = case when v_verified then v_now else null end,
    verification_due_at = case when v_verified then v_due else null end,
    reviewed_at = v_now,
    reviewer_id = v_uid,
    review_note = nullif(left(btrim(coalesce(p_note,'')),500),''),
    updated_at = v_now
  where user_id = p_user_id;

  return query select v_status, v_verified, v_due;
end;
$$;

revoke all on function public.review_professional_license_v1(uuid,text,text,date,text) from public, anon, authenticated;
grant execute on function public.review_professional_license_v1(uuid,text,text,date,text) to authenticated;

create or replace function public.is_verified_professional()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select v.verified_professional
      and v.verification_status = 'verified'
      and v.verification_due_at > now()
    from public.professional_license_verifications v
    where v.user_id = auth.uid()
  ), false);
$$;

revoke all on function public.is_verified_professional() from public, anon;
grant execute on function public.is_verified_professional() to authenticated;

create or replace function public.my_professional_license_verification_v1()
returns table(
  license_number text,
  verification_status text,
  verified_professional boolean,
  licensee_name text,
  license_expiration_date date,
  verified_at timestamptz,
  verification_due_at timestamptz,
  submitted_at timestamptz,
  source_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.license_number,
    case when v.verification_status = 'verified' and v.verification_due_at <= now() then 'expired' else v.verification_status end,
    v.verified_professional and v.verification_status = 'verified' and v.verification_due_at > now(),
    v.licensee_name,
    v.license_expiration_date,
    v.verified_at,
    v.verification_due_at,
    v.submitted_at,
    v.source_url
  from public.professional_license_verifications v
  where v.user_id = auth.uid();
$$;

revoke all on function public.my_professional_license_verification_v1() from public, anon;
grant execute on function public.my_professional_license_verification_v1() to authenticated;

-- Keep the stored flag truthful after annual or license-expiration re-verification deadlines.
create or replace function public.expire_professional_license_verifications_v1()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.professional_license_verifications
  set verification_status='expired', verified_professional=false, updated_at=now()
  where verified_professional=true
    and verification_status='verified'
    and verification_due_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_professional_license_verifications_v1() from public, anon, authenticated;

-- pg_cron is already part of Watchdog production infrastructure. This job is DB-only: no mail/send/spend side effect.
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='watchdog-expire-professional-license-verifications';
    perform cron.schedule(
      'watchdog-expire-professional-license-verifications',
      '17 8 * * *',
      'select public.expire_professional_license_verifications_v1();'
    );
  end if;
end $$;
