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
    or (
      v_segment = 'unverified'
      and e.email_confirmed_at is null
      and e.account_created_at < now() - interval '24 hours'
    )
    or (
      v_segment = 'verified_one_session'
      and e.email_confirmed_at is not null
      and e.auth_sessions <= 1
      and coalesce(e.watchdog_last_seen,e.last_sign_in_at,e.email_confirmed_at) < now() - interval '24 hours'
    )
    or (
      v_segment = 'inactive_7d'
      and e.email_confirmed_at is not null
      and coalesce(e.watchdog_last_seen,e.last_sign_in_at,e.email_confirmed_at) < now() - interval '7 days'
    )
    or (
      v_segment = 'anchor_only'
      and e.email_confirmed_at is not null
      and e.anchor_count > 0
      and e.saved_count = 0
      and not e.onboarding_done
      and e.account_created_at < now() - interval '24 hours'
    )
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
      (select max(wp.last_seen) from public.watchdog_live_presence wp where wp.user_id = l.user_id) as watchdog_last_seen,
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
    'unverified_24h', count(*) filter (
      where email_confirmed_at is null and account_created_at < now() - interval '24 hours'
    )::bigint,
    'verified_one_session_24h', count(*) filter (
      where email_confirmed_at is not null
        and auth_sessions <= 1
        and coalesce(watchdog_last_seen,last_sign_in_at,email_confirmed_at) < now() - interval '24 hours'
    )::bigint,
    'inactive_7d', count(*) filter (
      where email_confirmed_at is not null
        and coalesce(watchdog_last_seen,last_sign_in_at,email_confirmed_at) < now() - interval '7 days'
    )::bigint,
    'anchor_only_24h', count(*) filter (
      where email_confirmed_at is not null
        and anchor_count > 0
        and saved_count = 0
        and not onboarding_done
        and account_created_at < now() - interval '24 hours'
    )::bigint,
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

comment on function public.get_watchdog_user_lifecycle(text,integer) is 'Developer-only lifecycle roster. Re-engagement segments require a 24-hour cooling period before classifying unverified or one-session accounts.';
