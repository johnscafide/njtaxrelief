-- Standard is the free Watchdog tier and must not require a paid subscription.
-- Paid tiers continue to require an active-like subscription unless the caller
-- is a developer. Unknown requested tiers continue to fail closed.

create or replace function public.has_watchdog_plan(required_plan text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    left join public.account_entitlements e on e.user_id = p.id
    where p.id = auth.uid()
      and (
        p.account_role = 'developer'
        or lower(coalesce(required_plan,'standard')) = 'standard'
        or (
          e.subscription_status in ('active','trialing','past_due')
          and case lower(coalesce(e.billing_tier,e.plan_tier,'standard'))
                when 'teams' then 4
                when 'pro_plus' then 3
                when 'pro+' then 3
                when 'pro' then 2
                when 'agent' then 1
                else 0
              end >=
              case lower(coalesce(required_plan,'standard'))
                when 'teams' then 4
                when 'pro_plus' then 3
                when 'pro+' then 3
                when 'pro' then 2
                when 'agent' then 1
                else 999
              end
        )
      )
  );
$function$;

revoke all on function public.has_watchdog_plan(text) from public, anon;
grant execute on function public.has_watchdog_plan(text) to authenticated, service_role;
