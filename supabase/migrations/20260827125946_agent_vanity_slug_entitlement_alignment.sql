create or replace function public.guard_agent_vanity_slug()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  eligible boolean;
begin
  select coalesce(p.account_role='developer',false)
      or exists (
        select 1 from public.account_entitlements e
        where e.user_id = new.id
          and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')
          and lower(coalesce(e.billing_tier,e.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams')
      )
    into eligible
  from public.profiles p
  where p.id = new.id;

  if new.vanity_slug is distinct from old.vanity_slug then
    if new.vanity_slug is not null then
      new.vanity_slug := lower(trim(new.vanity_slug));
      if not eligible then
        raise exception 'Agent vanity slugs require an Agent-or-higher entitlement';
      end if;
      new.vanity_slug_reserved_at := now();
      new.vanity_slug_release_after := null;
    else
      new.vanity_slug_reserved_at := null;
      new.vanity_slug_release_after := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_agent_vanity_slug on public.profiles;
create trigger trg_guard_agent_vanity_slug
before update of vanity_slug on public.profiles
for each row execute function public.guard_agent_vanity_slug();

create or replace function public.sync_agent_vanity_slug_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  paid_plan boolean;
  active_status boolean;
  grace_from timestamptz;
begin
  paid_plan := lower(coalesce(new.billing_tier,new.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams');
  active_status := new.subscription_status in ('active','trialing','past_due','cancel_scheduled');

  if paid_plan and active_status and coalesce(new.cancel_at_period_end,false)=false then
    update public.profiles
       set vanity_slug_release_after = null
     where id = new.user_id
       and vanity_slug is not null
       and account_role <> 'developer';
  elsif tg_op = 'UPDATE' then
    grace_from := greatest(now(), coalesce(new.current_period_end, now()));
    update public.profiles
       set vanity_slug_release_after = coalesce(vanity_slug_release_after, grace_from + interval '30 days')
     where id = new.user_id
       and vanity_slug is not null
       and account_role <> 'developer';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_agent_vanity_slug_entitlement on public.account_entitlements;
create trigger trg_sync_agent_vanity_slug_entitlement
after insert or update of plan_tier, billing_tier, subscription_status, cancel_at_period_end, current_period_end
on public.account_entitlements
for each row execute function public.sync_agent_vanity_slug_entitlement();

create or replace function public.release_expired_agent_vanity_slugs()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  released integer;
begin
  update public.profiles p
     set vanity_slug = null,
         vanity_slug_reserved_at = null,
         vanity_slug_release_after = null
   where p.vanity_slug is not null
     and p.vanity_slug_release_after is not null
     and p.vanity_slug_release_after <= now()
     and p.account_role <> 'developer'
     and not exists (
       select 1 from public.account_entitlements e
       where e.user_id=p.id
         and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')
         and lower(coalesce(e.billing_tier,e.plan_tier,'')) in ('agent','pro','pro_plus','pro+','teams')
     );
  get diagnostics released = row_count;
  return released;
end;
$$;

revoke execute on function public.release_expired_agent_vanity_slugs() from public, anon, authenticated;
grant execute on function public.release_expired_agent_vanity_slugs() to service_role;
