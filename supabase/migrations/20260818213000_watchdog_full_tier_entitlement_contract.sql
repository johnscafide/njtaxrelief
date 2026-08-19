-- Align the server entitlement ladder with the customer-facing Watchdog tiers.
-- This migration is intentionally compatible with legacy Paddle rows while
-- making Agent / Pro / Pro+ / Teams distinct authorization levels.

alter table public.account_entitlements
  drop constraint if exists account_entitlements_plan_tier_check;

alter table public.account_entitlements
  add constraint account_entitlements_plan_tier_check
  check (plan_tier = any (array['standard'::text,'agent'::text,'pro'::text,'pro_plus'::text,'teams'::text]));

-- billing_tier has been the precise commercial tier while older plan_tier
-- values were coarse. Once the plan constraint is widened, reconcile the
-- canonical plan tier without changing subscription/provider state.
update public.account_entitlements
set plan_tier = billing_tier,
    updated_at = now()
where billing_tier in ('agent','pro','pro_plus','teams')
  and plan_tier is distinct from billing_tier;

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
                when 'standard' then 0
                else 999
              end
        )
      )
  );
$function$;

revoke all on function public.has_watchdog_plan(text) from public, anon;
grant execute on function public.has_watchdog_plan(text) to authenticated, service_role;
