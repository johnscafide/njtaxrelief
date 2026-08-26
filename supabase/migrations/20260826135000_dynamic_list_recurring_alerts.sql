-- NJW-51: bounded recurring monitoring for saved Agent Control lists.
-- Keeps scheduler state server-owned, preserves owner RLS, and delivers only
-- complete/uncapped generation diffs through the existing alert contract.

alter table public.agent_dynamic_lists
  add column if not exists monitor_cadence text,
  add column if not exists next_check_at timestamptz,
  add column if not exists last_monitor_attempt_at timestamptz,
  add column if not exists last_monitor_completed_at timestamptz,
  add column if not exists last_monitor_status text,
  add column if not exists last_monitor_detail text,
  add column if not exists monitor_run_id uuid,
  add column if not exists monitor_lease_until timestamptz,
  add column if not exists last_alert_at timestamptz;

alter table public.agent_dynamic_lists
  drop constraint if exists agent_dynamic_lists_monitor_cadence_check;
alter table public.agent_dynamic_lists
  add constraint agent_dynamic_lists_monitor_cadence_check
  check (monitor_cadence is null or monitor_cadence in ('daily','weekly'));

create index if not exists agent_dynamic_lists_monitor_due_idx
  on public.agent_dynamic_lists(next_check_at, id)
  where monitored = true;

comment on column public.agent_dynamic_lists.monitor_cadence is
  'Server-derived recurring monitor cadence from the current effective paid plan; customers cannot accelerate it.';
comment on column public.agent_dynamic_lists.next_check_at is
  'Server-owned due time for bounded saved-list monitoring.';
comment on column public.agent_dynamic_lists.monitor_lease_until is
  'Short server lease preventing overlapping recurring list refresh claims.';

create or replace function public.agent_dynamic_list_monitor_cadence(p_plan text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(coalesce(p_plan, 'standard'))
    when 'agent' then 'weekly'
    when 'pro' then 'daily'
    when 'pro_plus' then 'daily'
    when 'teams' then 'daily'
    when 'developer' then 'daily'
    else null
  end
$$;

revoke all on function public.agent_dynamic_list_monitor_cadence(text) from public, anon;
grant execute on function public.agent_dynamic_list_monitor_cadence(text) to authenticated, service_role;

create or replace function public.sync_agent_dynamic_list_monitor_schedule_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan text;
  v_cadence text;
  v_browser_actor boolean := (select auth.uid()) is not null;
begin
  v_plan := public.watchdog_effective_plan(new.user_id);
  v_cadence := public.agent_dynamic_list_monitor_cadence(v_plan);

  if tg_op = 'INSERT' then
    new.monitor_cadence := case when new.monitored then v_cadence else null end;
    new.monitor_run_id := null;
    new.monitor_lease_until := null;
    new.last_monitor_attempt_at := null;
    new.last_monitor_completed_at := null;
    new.last_alert_at := null;
    if new.monitored and v_cadence is not null then
      new.next_check_at := case
        when new.last_checked_at is null then now() + interval '15 minutes'
        else new.last_checked_at + case when v_cadence = 'weekly' then interval '7 days' else interval '1 day' end
      end;
      new.last_monitor_status := 'scheduled';
      new.last_monitor_detail := 'Recurring monitoring is scheduled from the current effective plan.';
    else
      new.next_check_at := null;
      new.last_monitor_status := case when new.monitored then 'plan_ineligible' else 'paused' end;
      new.last_monitor_detail := case when new.monitored
        then 'Recurring monitoring requires an eligible Agent or professional plan.'
        else 'Recurring monitoring is paused by the customer.' end;
    end if;
    return new;
  end if;

  -- Browser owners may pause/resume the single monitored switch, but every
  -- scheduler-controlled field remains server-owned even though the base row
  -- itself is customer editable under owner RLS.
  if v_browser_actor then
    new.monitor_cadence := old.monitor_cadence;
    new.next_check_at := old.next_check_at;
    new.last_monitor_attempt_at := old.last_monitor_attempt_at;
    new.last_monitor_completed_at := old.last_monitor_completed_at;
    new.last_monitor_status := old.last_monitor_status;
    new.last_monitor_detail := old.last_monitor_detail;
    new.monitor_run_id := old.monitor_run_id;
    new.monitor_lease_until := old.monitor_lease_until;
    new.last_alert_at := old.last_alert_at;

    if new.monitored is distinct from old.monitored then
      if new.monitored and v_cadence is not null then
        new.monitor_cadence := v_cadence;
        new.next_check_at := now() + interval '15 minutes';
        new.last_monitor_status := 'scheduled';
        new.last_monitor_detail := 'Recurring monitoring resumed; the next bounded baseline/check is queued.';
      elsif new.monitored then
        new.monitor_cadence := null;
        new.next_check_at := null;
        new.monitor_run_id := null;
        new.monitor_lease_until := null;
        new.last_monitor_status := 'plan_ineligible';
        new.last_monitor_detail := 'Recurring monitoring requires an eligible Agent or professional plan.';
      else
        new.monitor_cadence := null;
        new.next_check_at := null;
        new.monitor_run_id := null;
        new.monitor_lease_until := null;
        new.last_monitor_status := 'paused';
        new.last_monitor_detail := 'Recurring monitoring is paused by the customer.';
      end if;
    end if;
    return new;
  end if;

  -- Service/postgres writes still normalize cadence to the current entitlement.
  if not new.monitored then
    new.monitor_cadence := null;
    new.next_check_at := null;
    new.monitor_run_id := null;
    new.monitor_lease_until := null;
    if new.last_monitor_status is null or new.last_monitor_status <> 'paused' then
      new.last_monitor_status := 'paused';
      new.last_monitor_detail := 'Recurring monitoring is paused by the customer.';
    end if;
    return new;
  end if;

  if v_cadence is null then
    new.monitor_cadence := null;
    new.next_check_at := null;
    new.monitor_run_id := null;
    new.monitor_lease_until := null;
    new.last_monitor_status := 'plan_ineligible';
    new.last_monitor_detail := 'Recurring monitoring requires an eligible Agent or professional plan.';
    return new;
  end if;

  if new.monitor_cadence is distinct from v_cadence then
    new.monitor_cadence := v_cadence;
    if new.next_check_at is not distinct from old.next_check_at then
      new.next_check_at := now() + case when v_cadence = 'weekly' then interval '7 days' else interval '1 day' end;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_agent_dynamic_list_monitor_schedule_v1() from public, anon, authenticated;

drop trigger if exists sync_agent_dynamic_list_monitor_schedule_v1 on public.agent_dynamic_lists;
create trigger sync_agent_dynamic_list_monitor_schedule_v1
before insert or update on public.agent_dynamic_lists
for each row execute function public.sync_agent_dynamic_list_monitor_schedule_v1();

create table if not exists public.agent_dynamic_list_alert_deliveries (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dynamic_list_id uuid not null references public.agent_dynamic_lists(id) on delete cascade,
  diff_id bigint not null references public.agent_dynamic_list_diffs(id) on delete cascade,
  channel text not null check (channel = 'email'),
  status text not null check (status in ('queued','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  scheduled_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diff_id, channel)
);

comment on table public.agent_dynamic_list_alert_deliveries is
  'Privacy-minimized delivery ledger for recurring saved-list diffs. Stores counts/list metadata only, never recipient email or full property rows.';

create index if not exists agent_dynamic_list_alert_deliveries_user_list_idx
  on public.agent_dynamic_list_alert_deliveries(user_id, dynamic_list_id, created_at desc);

alter table public.agent_dynamic_list_alert_deliveries enable row level security;
drop policy if exists "dynamic list alert deliveries own rows" on public.agent_dynamic_list_alert_deliveries;
create policy "dynamic list alert deliveries own rows"
  on public.agent_dynamic_list_alert_deliveries
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.agent_dynamic_list_alert_deliveries from anon, authenticated;
grant select on public.agent_dynamic_list_alert_deliveries to authenticated;

create or replace function public.claim_due_agent_dynamic_list_monitors_v1(p_limit integer default 5)
returns table (
  id uuid,
  user_id uuid,
  name text,
  scope_type text,
  scope_value text,
  criteria jsonb,
  monitored boolean,
  last_checked_at timestamptz,
  last_count integer,
  monitor_cadence text,
  next_check_at timestamptz,
  monitor_run_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit < 1 or p_limit > 5 then
    raise exception 'monitor claim limit must be between 1 and 5';
  end if;

  return query
  with due as (
    select l.id
    from public.agent_dynamic_lists l
    where l.monitored = true
      and l.next_check_at is not null
      and l.next_check_at <= now()
      and (l.monitor_lease_until is null or l.monitor_lease_until < now())
    order by l.next_check_at asc, l.id asc
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.agent_dynamic_lists l
       set monitor_lease_until = now() + interval '20 minutes',
           last_monitor_attempt_at = now(),
           last_monitor_status = 'running',
           last_monitor_detail = 'Recurring saved-list refresh is running.',
           updated_at = now()
      from due
     where l.id = due.id
    returning l.*
  )
  select c.id, c.user_id, c.name, c.scope_type, c.scope_value, c.criteria,
         c.monitored, c.last_checked_at, c.last_count, c.monitor_cadence,
         c.next_check_at, c.monitor_run_id
  from claimed c
  order by c.next_check_at asc, c.id asc;
end;
$$;

revoke all on function public.claim_due_agent_dynamic_list_monitors_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_due_agent_dynamic_list_monitors_v1(integer) to service_role;

-- Backfill current rows through the scheduler trigger. Existing rows receive their
-- settled Agent weekly / Pro+ daily cadence without opening any new entitlement.
update public.agent_dynamic_lists l
set monitored = l.monitored,
    updated_at = l.updated_at;

-- Generate the scheduler credential inside Vault so no token is hardcoded in Git.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'watchdog_agent_list_monitor_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'watchdog_agent_list_monitor_token',
      'NJW-51 token for pg_cron to invoke bounded recurring saved-list monitoring'
    );
  end if;
end
$$;

create or replace function public.verify_agent_list_monitor_token_v1(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select coalesce(
    p_token is not null
    and length(p_token) >= 32
    and p_token = (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'watchdog_agent_list_monitor_token'
      order by created_at desc
      limit 1
    ),
    false
  )
$$;

revoke all on function public.verify_agent_list_monitor_token_v1(text) from public, anon, authenticated;
grant execute on function public.verify_agent_list_monitor_token_v1(text) to service_role;

select cron.schedule(
  'watchdog-agent-list-monitor',
  '23 * * * *',
  $cron$
  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/watchdog-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watchdog-monitor-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'watchdog_agent_list_monitor_token'
        order by created_at desc
        limit 1
      )
    ),
    body := jsonb_build_object('mode', 'dynamic_lists', 'limit', 5),
    timeout_milliseconds := 25000
  ) as request_id;
  $cron$
);
