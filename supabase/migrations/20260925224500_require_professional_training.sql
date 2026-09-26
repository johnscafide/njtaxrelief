-- Require current Watchdog professional accounts to complete Agent Training v1.
-- Existing completions remain valid; incomplete professional accounts are gated on their next protected visit.

comment on table public.watchdog_agent_training_progress is
  'Versioned Watchdog professional training progress. Current professional accounts must complete the current training before entering protected product workspaces.';

create or replace function public.sync_watchdog_agent_trial_training()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tier text;
begin
  v_tier := case
    when coalesce(new.billing_tier,new.plan_tier) = 'agent' then 'agent'
    when coalesce(new.billing_tier,new.plan_tier) = 'pro' then 'pro'
    when coalesce(new.billing_tier,new.plan_tier) in ('pro_plus','pro+') then 'pro_plus'
    when coalesce(new.billing_tier,new.plan_tier) = 'teams' then 'teams'
    else null
  end;

  if new.subscription_status in ('active','trialing','past_due') and v_tier is not null then
    insert into public.watchdog_agent_training_progress (
      user_id, training_version, status, plan_tier_at_start, required_at, updated_at
    ) values (
      new.user_id, 1, 'pending', v_tier, now(), now()
    )
    on conflict (user_id) do update set
      training_version = case
        when public.watchdog_agent_training_progress.training_version < 1 then 1
        else public.watchdog_agent_training_progress.training_version
      end,
      status = case
        when public.watchdog_agent_training_progress.training_version < 1 then 'pending'
        else public.watchdog_agent_training_progress.status
      end,
      plan_tier_at_start = coalesce(public.watchdog_agent_training_progress.plan_tier_at_start, excluded.plan_tier_at_start),
      required_at = case
        when public.watchdog_agent_training_progress.training_version < 1 then now()
        else public.watchdog_agent_training_progress.required_at
      end,
      updated_at = now();
  end if;

  return new;
end;
$$;

insert into public.watchdog_agent_training_progress (
  user_id, training_version, status, plan_tier_at_start, required_at, updated_at
)
select
  e.user_id,
  1,
  'pending',
  case
    when coalesce(e.billing_tier,e.plan_tier) = 'agent' then 'agent'
    when coalesce(e.billing_tier,e.plan_tier) = 'pro' then 'pro'
    when coalesce(e.billing_tier,e.plan_tier) in ('pro_plus','pro+') then 'pro_plus'
    when coalesce(e.billing_tier,e.plan_tier) = 'teams' then 'teams'
  end,
  now(),
  now()
from public.account_entitlements e
where e.subscription_status in ('active','trialing','past_due')
  and coalesce(e.billing_tier,e.plan_tier) in ('agent','pro','pro_plus','pro+','teams')
on conflict (user_id) do nothing;

create or replace function public.get_my_agent_training_state()
returns table (
  required boolean,
  completed boolean,
  training_version smallint,
  status text,
  plan_tier text,
  subscription_status text,
  current_module text,
  completed_modules text[],
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    coalesce(
      e.subscription_status in ('active','trialing','past_due')
      and coalesce(e.billing_tier,e.plan_tier) in ('agent','pro','pro_plus','pro+','teams'),
      false
    ) as required,
    coalesce(t.status = 'complete' and t.training_version = 1 and t.completed_at is not null, false) as completed,
    coalesce(t.training_version, 1::smallint),
    coalesce(t.status, 'pending'),
    case
      when coalesce(e.billing_tier,e.plan_tier) = 'agent' then 'agent'
      when coalesce(e.billing_tier,e.plan_tier) = 'pro' then 'pro'
      when coalesce(e.billing_tier,e.plan_tier) in ('pro_plus','pro+') then 'pro_plus'
      when coalesce(e.billing_tier,e.plan_tier) = 'teams' then 'teams'
      else 'standard'
    end,
    coalesce(e.subscription_status,'none'),
    t.current_module,
    coalesce(t.completed_modules,'{}'::text[]),
    t.started_at,
    t.completed_at
  from (select v_uid as uid) me
  left join public.account_entitlements e on e.user_id = me.uid
  left join public.watchdog_agent_training_progress t on t.user_id = me.uid;
end;
$$;

revoke all on function public.get_my_agent_training_state() from public, anon;
grant execute on function public.get_my_agent_training_state() to authenticated;
