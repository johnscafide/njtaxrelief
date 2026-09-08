create table if not exists public.watchdog_user_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  account_created_at timestamptz not null,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  first_signup_context text not null default 'unknown',
  first_auth_provider text not null default 'unknown',
  origin_recorded_at timestamptz,
  origin_source text not null default 'historical_backfill',
  contact_permission text not null default 'transactional_only',
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  updated_at timestamptz not null default now(),
  constraint watchdog_user_lifecycle_context_check check (first_signup_context ~ '^[a-z0-9_.-]{1,64}$'),
  constraint watchdog_user_lifecycle_provider_check check (first_auth_provider ~ '^[a-z0-9_.-]{1,64}$'),
  constraint watchdog_user_lifecycle_origin_source_check check (origin_source in ('auth_metadata','authenticated_rpc','attribution_backfill','product_backfill','historical_backfill')),
  constraint watchdog_user_lifecycle_contact_permission_check check (contact_permission in ('transactional_only','marketing_opt_in','unsubscribed','suppressed'))
);

create index if not exists watchdog_user_lifecycle_created_idx
  on public.watchdog_user_lifecycle (account_created_at desc);
create index if not exists watchdog_user_lifecycle_unverified_idx
  on public.watchdog_user_lifecycle (account_created_at desc)
  where email_confirmed_at is null;
create index if not exists watchdog_user_lifecycle_context_idx
  on public.watchdog_user_lifecycle (first_signup_context, account_created_at desc);

alter table public.watchdog_user_lifecycle enable row level security;
revoke all on table public.watchdog_user_lifecycle from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.sync_watchdog_user_lifecycle_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_context text := lower(trim(coalesce(new.raw_user_meta_data->>'watchdog_signup_context','')));
  v_provider text := lower(trim(coalesce(new.raw_app_meta_data->>'provider','unknown')));
begin
  if v_context !~ '^[a-z0-9_.-]{1,64}$' then
    v_context := 'unknown';
  end if;
  if v_provider !~ '^[a-z0-9_.-]{1,64}$' then
    v_provider := 'unknown';
  end if;

  insert into public.watchdog_user_lifecycle (
    user_id,
    email,
    account_created_at,
    email_confirmed_at,
    last_sign_in_at,
    first_signup_context,
    first_auth_provider,
    origin_recorded_at,
    origin_source,
    updated_at
  ) values (
    new.id,
    nullif(lower(trim(coalesce(new.email,''))),''),
    new.created_at,
    new.email_confirmed_at,
    new.last_sign_in_at,
    v_context,
    v_provider,
    case when v_context <> 'unknown' then now() else null end,
    case when v_context <> 'unknown' then 'auth_metadata' else 'historical_backfill' end,
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    last_sign_in_at = excluded.last_sign_in_at,
    first_auth_provider = case
      when public.watchdog_user_lifecycle.first_auth_provider = 'unknown' and excluded.first_auth_provider <> 'unknown'
        then excluded.first_auth_provider
      else public.watchdog_user_lifecycle.first_auth_provider
    end,
    first_signup_context = case
      when public.watchdog_user_lifecycle.first_signup_context = 'unknown' and excluded.first_signup_context <> 'unknown'
        then excluded.first_signup_context
      else public.watchdog_user_lifecycle.first_signup_context
    end,
    origin_recorded_at = case
      when public.watchdog_user_lifecycle.first_signup_context = 'unknown' and excluded.first_signup_context <> 'unknown'
        then now()
      else public.watchdog_user_lifecycle.origin_recorded_at
    end,
    origin_source = case
      when public.watchdog_user_lifecycle.first_signup_context = 'unknown' and excluded.first_signup_context <> 'unknown'
        then 'auth_metadata'
      else public.watchdog_user_lifecycle.origin_source
    end,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_watchdog_user_lifecycle_from_auth() from public, anon, authenticated;

drop trigger if exists watchdog_user_lifecycle_auth_sync on auth.users;
create trigger watchdog_user_lifecycle_auth_sync
after insert or update of email, email_confirmed_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data
on auth.users
for each row execute function private.sync_watchdog_user_lifecycle_from_auth();

insert into public.watchdog_user_lifecycle (
  user_id,
  email,
  account_created_at,
  email_confirmed_at,
  last_sign_in_at,
  first_signup_context,
  first_auth_provider,
  origin_recorded_at,
  origin_source,
  contact_permission,
  updated_at
)
select
  u.id,
  nullif(lower(trim(coalesce(u.email,''))),''),
  u.created_at,
  u.email_confirmed_at,
  u.last_sign_in_at,
  coalesce(
    nullif((select a.signup_context from public.watchdog_signup_attribution a where a.user_id = u.id limit 1),''),
    case when exists (select 1 from public.anchor_applications aa where aa.user_id = u.id) then 'anchor_application' end,
    'unknown'
  ),
  case
    when lower(coalesce(u.raw_app_meta_data->>'provider','')) ~ '^[a-z0-9_.-]{1,64}$'
      then lower(u.raw_app_meta_data->>'provider')
    else 'unknown'
  end,
  case
    when exists (select 1 from public.watchdog_signup_attribution a where a.user_id = u.id)
      or exists (select 1 from public.anchor_applications aa where aa.user_id = u.id)
      then now()
    else null
  end,
  case
    when exists (select 1 from public.watchdog_signup_attribution a where a.user_id = u.id) then 'attribution_backfill'
    when exists (select 1 from public.anchor_applications aa where aa.user_id = u.id) then 'product_backfill'
    else 'historical_backfill'
  end,
  case
    when exists (select 1 from public.profiles p where p.id = u.id and p.marketing_optin is true) then 'marketing_opt_in'
    else 'transactional_only'
  end,
  now()
from auth.users u
on conflict (user_id) do update set
  email = excluded.email,
  email_confirmed_at = excluded.email_confirmed_at,
  last_sign_in_at = excluded.last_sign_in_at,
  first_auth_provider = case
    when public.watchdog_user_lifecycle.first_auth_provider = 'unknown' then excluded.first_auth_provider
    else public.watchdog_user_lifecycle.first_auth_provider
  end,
  first_signup_context = case
    when public.watchdog_user_lifecycle.first_signup_context = 'unknown' then excluded.first_signup_context
    else public.watchdog_user_lifecycle.first_signup_context
  end,
  origin_recorded_at = coalesce(public.watchdog_user_lifecycle.origin_recorded_at, excluded.origin_recorded_at),
  origin_source = case
    when public.watchdog_user_lifecycle.first_signup_context = 'unknown' and excluded.first_signup_context <> 'unknown'
      then excluded.origin_source
    else public.watchdog_user_lifecycle.origin_source
  end,
  contact_permission = case
    when public.watchdog_user_lifecycle.contact_permission in ('unsubscribed','suppressed') then public.watchdog_user_lifecycle.contact_permission
    else excluded.contact_permission
  end,
  updated_at = now();

create or replace function public.record_my_watchdog_signup_origin(p_signup_context text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_context text := lower(trim(coalesce(p_signup_context,'')));
  v_user auth.users%rowtype;
  v_changed boolean := false;
begin
  if v_uid is null or v_context !~ '^[a-z0-9_.-]{1,64}$' then
    return false;
  end if;

  select * into v_user from auth.users where id = v_uid;
  if v_user.id is null or v_user.created_at < now() - interval '24 hours' then
    return false;
  end if;

  insert into public.watchdog_user_lifecycle (
    user_id,
    email,
    account_created_at,
    email_confirmed_at,
    last_sign_in_at,
    first_signup_context,
    first_auth_provider,
    origin_recorded_at,
    origin_source,
    updated_at
  ) values (
    v_user.id,
    nullif(lower(trim(coalesce(v_user.email,''))),''),
    v_user.created_at,
    v_user.email_confirmed_at,
    v_user.last_sign_in_at,
    v_context,
    case
      when lower(coalesce(v_user.raw_app_meta_data->>'provider','')) ~ '^[a-z0-9_.-]{1,64}$'
        then lower(v_user.raw_app_meta_data->>'provider')
      else 'unknown'
    end,
    now(),
    'authenticated_rpc',
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    email_confirmed_at = excluded.email_confirmed_at,
    last_sign_in_at = excluded.last_sign_in_at,
    first_signup_context = case
      when public.watchdog_user_lifecycle.first_signup_context = 'unknown' then excluded.first_signup_context
      else public.watchdog_user_lifecycle.first_signup_context
    end,
    origin_recorded_at = case
      when public.watchdog_user_lifecycle.first_signup_context = 'unknown' then now()
      else public.watchdog_user_lifecycle.origin_recorded_at
    end,
    origin_source = case
      when public.watchdog_user_lifecycle.first_signup_context = 'unknown' then 'authenticated_rpc'
      else public.watchdog_user_lifecycle.origin_source
    end,
    updated_at = now();

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.record_my_watchdog_signup_origin(text) from public, anon;
grant execute on function public.record_my_watchdog_signup_origin(text) to authenticated;

create or replace function public.get_watchdog_user_lifecycle(p_segment text default 'all', p_limit integer default 200)
returns table (
  email text,
  verification_state text,
  first_signup_context text,
  first_auth_provider text,
  account_created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  auth_session_count bigint,
  watchdog_session_count bigint,
  last_watchdog_seen_at timestamptz,
  anchor_application_count bigint,
  saved_property_count bigint,
  onboarding_complete boolean,
  contact_permission text
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_segment text := lower(trim(coalesce(p_segment,'all')));
  v_limit integer := greatest(1, least(coalesce(p_limit,200), 1000));
begin
  if not public.is_watchdog_developer() then
    raise exception 'developer_access_required' using errcode = '42501';
  end if;
  if v_segment not in ('all','unverified','verified_one_session','inactive_7d','anchor_only') then
    raise exception 'invalid_segment' using errcode = '22023';
  end if;

  return query
  with external_lifecycle as (
    select l.*
    from public.watchdog_user_lifecycle l
    where l.email is not null
      and not exists (
        select 1 from public.analytics_internal_accounts i where i.user_id = l.user_id
      )
  ), enriched as (
    select
      l.*,
      (select count(*)::bigint from auth.sessions s where s.user_id = l.user_id) as auth_sessions,
      (select count(distinct wp.session_id)::bigint from public.watchdog_live_presence wp where wp.user_id = l.user_id) as watchdog_sessions,
      (select max(wp.last_seen) from public.watchdog_live_presence wp where wp.user_id = l.user_id) as watchdog_last_seen,
      (select count(*)::bigint from public.anchor_applications aa where aa.user_id = l.user_id) as anchor_count,
      (select count(*)::bigint from public.saved_properties sp where sp.user_id = l.user_id) as saved_count,
      exists (
        select 1 from public.watchdog_onboarding_profiles op
        where op.user_id = l.user_id and op.status = 'complete'
      ) as onboarding_done
    from external_lifecycle l
  )
  select
    e.email,
    case when e.email_confirmed_at is null then 'unverified' else 'verified' end,
    e.first_signup_context,
    e.first_auth_provider,
    e.account_created_at,
    e.email_confirmed_at,
    e.last_sign_in_at,
    e.auth_sessions,
    e.watchdog_sessions,
    e.watchdog_last_seen,
    e.anchor_count,
    e.saved_count,
    e.onboarding_done,
    e.contact_permission
  from enriched e
  where
    v_segment = 'all'
    or (v_segment = 'unverified' and e.email_confirmed_at is null)
    or (v_segment = 'verified_one_session' and e.email_confirmed_at is not null and e.auth_sessions <= 1)
    or (v_segment = 'inactive_7d' and e.email_confirmed_at is not null and coalesce(e.watchdog_last_seen,e.last_sign_in_at,e.email_confirmed_at) < now() - interval '7 days')
    or (v_segment = 'anchor_only' and e.email_confirmed_at is not null and e.anchor_count > 0 and e.saved_count = 0 and not e.onboarding_done)
  order by e.account_created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_watchdog_user_lifecycle(text,integer) from public, anon;
grant execute on function public.get_watchdog_user_lifecycle(text,integer) to authenticated;

create or replace function public.get_watchdog_user_lifecycle_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_watchdog_developer() then
    raise exception 'developer_access_required' using errcode = '42501';
  end if;

  with external_lifecycle as (
    select l.*
    from public.watchdog_user_lifecycle l
    where l.email is not null
      and not exists (
        select 1 from public.analytics_internal_accounts i where i.user_id = l.user_id
      )
  ), enriched as (
    select
      l.*,
      (select count(*)::bigint from auth.sessions s where s.user_id = l.user_id) as auth_sessions,
      (select count(*)::bigint from public.anchor_applications aa where aa.user_id = l.user_id) as anchor_count,
      (select count(*)::bigint from public.saved_properties sp where sp.user_id = l.user_id) as saved_count,
      exists (
        select 1 from public.watchdog_onboarding_profiles op
        where op.user_id = l.user_id and op.status = 'complete'
      ) as onboarding_done
    from external_lifecycle l
  )
  select jsonb_build_object(
    'total_email_accounts', count(*)::bigint,
    'verified', count(*) filter (where email_confirmed_at is not null)::bigint,
    'unverified', count(*) filter (where email_confirmed_at is null)::bigint,
    'verified_one_session', count(*) filter (where email_confirmed_at is not null and auth_sessions <= 1)::bigint,
    'anchor_only', count(*) filter (where email_confirmed_at is not null and anchor_count > 0 and saved_count = 0 and not onboarding_done)::bigint,
    'known_signup_origin', count(*) filter (where first_signup_context <> 'unknown')::bigint,
    'unknown_signup_origin', count(*) filter (where first_signup_context = 'unknown')::bigint,
    'marketing_opt_in', count(*) filter (where contact_permission = 'marketing_opt_in')::bigint,
    'generated_at', now()
  ) into v_result
  from enriched;

  return v_result;
end;
$$;

revoke all on function public.get_watchdog_user_lifecycle_summary() from public, anon;
grant execute on function public.get_watchdog_user_lifecycle_summary() to authenticated;

comment on table public.watchdog_user_lifecycle is 'Restricted first-party account lifecycle ledger. Contains email PII for account recovery and developer-governed lifecycle operations; direct browser reads are prohibited.';
comment on function public.record_my_watchdog_signup_origin(text) is 'Records only a bounded first-party signup surface for the current newly created account. It does not record referrer, UTM, IP, or cross-site analytics data.';
comment on function public.get_watchdog_user_lifecycle(text,integer) is 'Developer-only lifecycle roster including email PII. Use for governed recovery/re-engagement workflows; never expose to normal browser roles.';
