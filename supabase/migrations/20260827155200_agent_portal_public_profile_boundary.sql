create or replace function public.get_public_agent_portal_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', p.vanity_slug,
    'display_name', nullif(trim(coalesce(p.display_name, p.full_name, '')), ''),
    'photo_url', nullif(trim(coalesce(p.pro_agent->>'headshot_url', p.photo_url, p.avatar_url, '')), ''),
    'brokerage_name', nullif(trim(coalesce(p.pro_agent->>'brokerage_name', '')), ''),
    'license_number', nullif(trim(coalesce(p.pro_agent->>'license_number', '')), ''),
    'business_phone', nullif(trim(coalesce(p.pro_agent->>'business_phone', '')), ''),
    'business_email', nullif(trim(coalesce(p.pro_agent->>'business_email', '')), ''),
    'brokerage_logo_url', nullif(trim(coalesce(p.pro_agent->>'brokerage_logo_url', '')), ''),
    'brokerage_disclosure', nullif(trim(coalesce(p.pro_agent->>'brokerage_disclosure', '')), '')
  )
  from public.profiles p
  where p.vanity_slug = lower(trim(p_slug))
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
$$;

comment on function public.get_public_agent_portal_profile(text) is
  'Service-only resolver for NJW-61 public agent portals. Returns only approved agent marketing fields and only while the server-owned Agent+ entitlement is active.';

revoke all on function public.get_public_agent_portal_profile(text) from public, anon, authenticated;
grant execute on function public.get_public_agent_portal_profile(text) to service_role;
