-- Watchdog onboarding contact email v2
-- Contact email is self-reported profile/contact data. It does not replace the auth identity
-- and it does not imply marketing consent.

alter table public.watchdog_onboarding_profiles
  add column if not exists contact_email text,
  add column if not exists contact_email_confirmed_at timestamptz;

alter table public.watchdog_onboarding_profiles
  drop constraint if exists watchdog_onboarding_profiles_contact_email_check;

alter table public.watchdog_onboarding_profiles
  add constraint watchdog_onboarding_profiles_contact_email_check
  check (
    contact_email is null or (
      char_length(contact_email) between 3 and 254
      and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

comment on column public.watchdog_onboarding_profiles.contact_email is
  'User-confirmed Watchdog contact/profile email. Separate from auth identity and separate from marketing consent.';
comment on column public.watchdog_onboarding_profiles.contact_email_confirmed_at is
  'When the member confirmed the contact email during Watchdog onboarding.';

create or replace function public.complete_my_watchdog_onboarding_v2(payload jsonb)
returns table (completed boolean, persona text, primary_profession text, completed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_completed boolean;
  v_persona text;
  v_profession text;
  v_completed_at timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Invalid onboarding payload'; end if;

  v_email := lower(btrim(coalesce(payload->>'contact_email','')));
  if char_length(v_email) < 3
     or char_length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select r.completed, r.persona, r.primary_profession, r.completed_at
    into v_completed, v_persona, v_profession, v_completed_at
  from public.complete_my_watchdog_onboarding(payload) r
  limit 1;

  update public.watchdog_onboarding_profiles
  set contact_email = v_email,
      contact_email_confirmed_at = now(),
      responses = jsonb_set(
        coalesce(responses,'{}'::jsonb),
        '{contact_email}',
        to_jsonb(v_email),
        true
      ),
      updated_at = now()
  where user_id = v_uid;

  return query select v_completed, v_persona, v_profession, v_completed_at;
end;
$$;

revoke all on function public.complete_my_watchdog_onboarding_v2(jsonb) from public, anon;
grant execute on function public.complete_my_watchdog_onboarding_v2(jsonb) to authenticated;
