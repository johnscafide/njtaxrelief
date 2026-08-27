alter table public.agent_funnel_events
  drop constraint if exists agent_funnel_events_event_name_check;

alter table public.agent_funnel_events
  add constraint agent_funnel_events_event_name_check
  check (event_name = any (array[
    'signal_viewed'::text,
    'evidence_opened'::text,
    'property_opened'::text,
    'watched'::text,
    'conversation_started'::text,
    'reply'::text,
    'valuation_request'::text,
    'appointment'::text,
    'listing'::text,
    'dismissed'::text,
    'portal_view'::text,
    'portal_lead_captured'::text
  ]));

create or replace function public.record_agent_portal_view(p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' then
    return false;
  end if;

  select p.id
    into v_user_id
  from public.profiles p
  where p.vanity_slug = v_slug
    and (
      p.account_role = 'developer'
      or exists (
        select 1
        from public.account_entitlements e
        where e.user_id = p.id
          and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')
          and lower(coalesce(e.billing_tier,e.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams')
      )
    )
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  insert into public.agent_funnel_events(user_id, opportunity_key, event_name, metadata)
  values (
    v_user_id,
    'portal:' || v_slug,
    'portal_view',
    jsonb_build_object('source','portal','slug',v_slug)
  );

  return true;
end;
$$;

revoke all on function public.record_agent_portal_view(text) from public;
revoke all on function public.record_agent_portal_view(text) from anon;
revoke all on function public.record_agent_portal_view(text) from authenticated;
grant execute on function public.record_agent_portal_view(text) to service_role;
