create or replace function public.link_my_watchdog_signup_attribution(
  p_visitor_id uuid,
  p_session_id uuid,
  p_signup_context text,
  p_auth_provider text default null
) returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_created_at timestamptz;
  v_provider text;
  v_context text := lower(trim(coalesce(p_signup_context,'')));
  v_touch public.watchdog_auth_funnel_events%rowtype;
  v_rows integer := 0;
begin
  if v_uid is null or p_visitor_id is null or p_session_id is null then
    return false;
  end if;
  if v_context !~ '^[a-z0-9_.-]{1,64}$' then
    return false;
  end if;

  select u.created_at,
         lower(coalesce(nullif(u.raw_app_meta_data->>'provider',''), nullif(trim(coalesce(p_auth_provider,'')),''), 'unknown'))
    into v_created_at, v_provider
  from auth.users u
  where u.id = v_uid;

  if v_created_at is null or v_created_at < now() - interval '2 hours' or v_created_at > now() + interval '5 minutes' then
    return false;
  end if;
  if v_provider !~ '^[a-z0-9_.-]{1,64}$' then
    v_provider := 'unknown';
  end if;

  select * into v_touch
  from public.watchdog_auth_funnel_events e
  where e.visitor_id = p_visitor_id
    and e.session_id = p_session_id
  order by e.occurred_at asc, e.id asc
  limit 1;

  insert into public.watchdog_signup_attribution (
    user_id, visitor_id, signup_session_id, signup_context, auth_provider,
    first_touch_referrer_host, first_touch_landing_path,
    first_touch_utm_source, first_touch_utm_medium, first_touch_utm_campaign,
    account_created_at
  ) values (
    v_uid, p_visitor_id, p_session_id, v_context, v_provider,
    v_touch.referrer_host, v_touch.landing_path,
    v_touch.utm_source, v_touch.utm_medium, v_touch.utm_campaign,
    v_created_at
  ) on conflict (user_id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    insert into public.watchdog_auth_funnel_events (
      visitor_id, session_id, event_name, signup_context, auth_provider,
      path, referrer_host, landing_path, utm_source, utm_medium, utm_campaign
    ) values (
      p_visitor_id, p_session_id, 'auth_success', v_context, v_provider,
      v_touch.path, v_touch.referrer_host, v_touch.landing_path,
      v_touch.utm_source, v_touch.utm_medium, v_touch.utm_campaign
    );
  end if;

  return v_rows > 0;
end;
$$;

revoke all on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) from public;
grant execute on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) to authenticated;

create or replace function public.get_watchdog_acquisition_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days,30), 366));
  v_result jsonb;
begin
  if not public.is_watchdog_developer() then
    raise exception 'developer_access_required' using errcode = '42501';
  end if;

  with all_external_signups as (
    select
      u.id as user_id,
      u.created_at,
      lower(coalesce(nullif(u.raw_app_meta_data->>'provider',''),'unknown')) as auth_provider
    from auth.users u
    where u.created_at >= now() - make_interval(days => v_days)
      and not exists (
        select 1 from public.analytics_internal_accounts i where i.user_id = u.id
      )
  ), external_signups as (
    select a.*
    from public.watchdog_signup_attribution a
    where a.account_created_at >= now() - make_interval(days => v_days)
      and not exists (
        select 1 from public.analytics_internal_accounts i where i.user_id = a.user_id
      )
  ), coverage as (
    select
      (select count(*)::bigint from all_external_signups) as total_external_signups,
      (select count(*)::bigint from external_signups) as attributed_signups
  ), provider_groups as (
    select
      (s.created_at at time zone 'America/New_York')::date as day,
      s.auth_provider,
      count(*)::bigint as signups
    from all_external_signups s
    group by 1,2
    order by 1 desc, signups desc
  ), signup_groups as (
    select
      (a.account_created_at at time zone 'America/New_York')::date as day,
      a.signup_context,
      a.auth_provider,
      coalesce(nullif(a.first_touch_utm_source,''), nullif(a.first_touch_referrer_host,''), '(direct/none)') as source,
      coalesce(nullif(a.first_touch_utm_medium,''), '(none)') as medium,
      coalesce(nullif(a.first_touch_utm_campaign,''), '(none)') as campaign,
      coalesce(nullif(a.first_touch_landing_path,''), '(unknown)') as landing_path,
      count(*)::bigint as signups,
      count(*) filter (where exists (select 1 from public.anchor_applications aa where aa.user_id = a.user_id))::bigint as anchor_accounts,
      count(*) filter (where exists (select 1 from public.watchdog_onboarding_profiles op where op.user_id = a.user_id and op.status = 'complete'))::bigint as onboarding_completed
    from external_signups a
    group by 1,2,3,4,5,6,7
    order by 1 desc, signups desc
  ), funnel_groups as (
    select
      (e.occurred_at at time zone 'America/New_York')::date as day,
      e.signup_context,
      e.event_name,
      coalesce(e.auth_provider,'(none)') as auth_provider,
      count(*)::bigint as events,
      count(distinct e.session_id)::bigint as sessions
    from public.watchdog_auth_funnel_events e
    where e.occurred_at >= now() - make_interval(days => v_days)
    group by 1,2,3,4
    order by 1 desc, events desc
  )
  select jsonb_build_object(
    'days', v_days,
    'generated_at', now(),
    'coverage', (
      select jsonb_build_object(
        'total_external_signups', c.total_external_signups,
        'attributed_signups', c.attributed_signups,
        'attribution_rate', case when c.total_external_signups = 0 then 0 else round((c.attributed_signups::numeric / c.total_external_signups::numeric) * 100, 1) end,
        'note', 'Auth-provider totals include all external accounts. Source, campaign and funnel attribution include only sessions where optional analytics was allowed.'
      ) from coverage c
    ),
    'auth_provider_totals', coalesce((select jsonb_agg(to_jsonb(p)) from provider_groups p), '[]'::jsonb),
    'signups', coalesce((select jsonb_agg(to_jsonb(s)) from signup_groups s), '[]'::jsonb),
    'auth_funnel', coalesce((select jsonb_agg(to_jsonb(f)) from funnel_groups f), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_watchdog_acquisition_analytics(integer) from public, anon;
grant execute on function public.get_watchdog_acquisition_analytics(integer) to authenticated;

comment on function public.get_watchdog_acquisition_analytics(integer) is 'Developer-only aggregate acquisition report. Auth-provider totals cover all external auth users; source/funnel attribution is consent-gated and coverage is reported explicitly.';
