-- Trial training onboarding for Watchdog professional trials.
-- Required only while a professional entitlement is in Stripe trialing state.
-- Progress is server-governed; authenticated users may read their own state but
-- cannot directly mark the training complete.

create table if not exists public.watchdog_agent_training_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training_version smallint not null default 1 check (training_version between 1 and 100),
  status text not null default 'pending' check (status in ('pending','in_progress','complete')),
  plan_tier_at_start text check (plan_tier_at_start is null or plan_tier_at_start in ('agent','pro','pro_plus','teams')),
  current_module text,
  completed_modules text[] not null default '{}',
  required_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(completed_modules) <= 20)
);

comment on table public.watchdog_agent_training_progress is
  'Versioned Watchdog professional training progress. Trialing accounts must complete the current training before entering protected product workspaces.';
comment on column public.watchdog_agent_training_progress.completed_modules is
  'Server-governed list of reviewed training modules for the current training version.';

alter table public.watchdog_agent_training_progress enable row level security;

drop policy if exists "watchdog agent training select own" on public.watchdog_agent_training_progress;
create policy "watchdog agent training select own"
  on public.watchdog_agent_training_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.watchdog_agent_training_progress from anon;
revoke insert, update, delete on public.watchdog_agent_training_progress from authenticated;
grant select on public.watchdog_agent_training_progress to authenticated;

create or replace function public.watchdog_agent_training_entitlement_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(e.billing_tier,e.plan_tier) = 'agent' then 'agent'
    when coalesce(e.billing_tier,e.plan_tier) = 'pro' then 'pro'
    when coalesce(e.billing_tier,e.plan_tier) in ('pro_plus','pro+') then 'pro_plus'
    when coalesce(e.billing_tier,e.plan_tier) = 'teams' then 'teams'
    else null
  end
  from public.account_entitlements e
  where e.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.watchdog_agent_training_entitlement_tier(uuid) from public, anon, authenticated;

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

  if new.subscription_status = 'trialing' and v_tier is not null then
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

drop trigger if exists account_entitlements_trial_training_sync on public.account_entitlements;
create trigger account_entitlements_trial_training_sync
after insert or update of subscription_status, plan_tier, billing_tier
on public.account_entitlements
for each row execute function public.sync_watchdog_agent_trial_training();

revoke all on function public.sync_watchdog_agent_trial_training() from public, anon, authenticated;

-- Cover trial accounts that existed before this migration.
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
where e.subscription_status = 'trialing'
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
    coalesce(e.subscription_status = 'trialing'
      and coalesce(e.billing_tier,e.plan_tier) in ('agent','pro','pro_plus','pro+','teams'), false) as required,
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

create or replace function public.update_my_agent_training_progress(p_module text, p_reviewed boolean default true)
returns table (
  status text,
  current_module text,
  completed_modules text[],
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_module text := lower(btrim(coalesce(p_module,'')));
  v_now timestamptz := now();
  v_tier text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  if v_module not in (
    'welcome',
    'property_intelligence',
    'agent_workspace',
    'property_pulse',
    'contacts_crm',
    'transactions',
    'pro_plus',
    'roadmap'
  ) then
    raise exception 'Unknown training module';
  end if;

  select case
    when coalesce(e.billing_tier,e.plan_tier) = 'agent' then 'agent'
    when coalesce(e.billing_tier,e.plan_tier) = 'pro' then 'pro'
    when coalesce(e.billing_tier,e.plan_tier) in ('pro_plus','pro+') then 'pro_plus'
    when coalesce(e.billing_tier,e.plan_tier) = 'teams' then 'teams'
    else null
  end
  into v_tier
  from public.account_entitlements e
  where e.user_id = v_uid
    and e.subscription_status in ('active','trialing','past_due')
  limit 1;

  if v_tier is null then
    raise exception 'Professional Watchdog access required';
  end if;

  insert into public.watchdog_agent_training_progress (
    user_id, training_version, status, plan_tier_at_start, current_module,
    completed_modules, required_at, started_at, updated_at
  ) values (
    v_uid, 1, 'in_progress', v_tier, v_module,
    case when p_reviewed then array[v_module]::text[] else '{}'::text[] end,
    v_now, v_now, v_now
  )
  on conflict (user_id) do update set
    training_version = 1,
    status = case when public.watchdog_agent_training_progress.status = 'complete' then 'complete' else 'in_progress' end,
    current_module = excluded.current_module,
    completed_modules = case
      when p_reviewed and not (v_module = any(public.watchdog_agent_training_progress.completed_modules))
        then array_append(public.watchdog_agent_training_progress.completed_modules,v_module)
      else public.watchdog_agent_training_progress.completed_modules
    end,
    started_at = coalesce(public.watchdog_agent_training_progress.started_at,v_now),
    updated_at = v_now;

  return query
  select t.status,t.current_module,t.completed_modules,t.started_at,t.completed_at
  from public.watchdog_agent_training_progress t
  where t.user_id = v_uid;
end;
$$;

create or replace function public.complete_my_agent_training(p_acknowledged boolean)
returns table (
  completed boolean,
  completed_at timestamptz,
  training_version smallint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_required text[] := array[
    'welcome',
    'property_intelligence',
    'agent_workspace',
    'property_pulse',
    'contacts_crm',
    'transactions',
    'pro_plus',
    'roadmap'
  ]::text[];
  v_modules text[];
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_acknowledged is not true then raise exception 'Training acknowledgement required'; end if;

  if not exists (
    select 1
    from public.account_entitlements e
    where e.user_id = v_uid
      and e.subscription_status in ('active','trialing','past_due')
      and coalesce(e.billing_tier,e.plan_tier) in ('agent','pro','pro_plus','pro+','teams')
  ) then
    raise exception 'Professional Watchdog access required';
  end if;

  select completed_modules into v_modules
  from public.watchdog_agent_training_progress
  where user_id = v_uid
  for update;

  if v_modules is null or not (v_modules @> v_required) then
    raise exception 'Review every training module before completing training';
  end if;

  update public.watchdog_agent_training_progress
  set training_version = 1,
      status = 'complete',
      current_module = 'roadmap',
      completed_at = v_now,
      updated_at = v_now
  where user_id = v_uid;

  return query select true,v_now,1::smallint;
end;
$$;

revoke all on function public.get_my_agent_training_state() from public, anon;
revoke all on function public.update_my_agent_training_progress(text,boolean) from public, anon;
revoke all on function public.complete_my_agent_training(boolean) from public, anon;

grant execute on function public.get_my_agent_training_state() to authenticated;
grant execute on function public.update_my_agent_training_progress(text,boolean) to authenticated;
grant execute on function public.complete_my_agent_training(boolean) to authenticated;
