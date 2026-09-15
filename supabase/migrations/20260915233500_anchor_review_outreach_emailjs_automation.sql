-- NJW-365: automatic ANCHOR review-request delivery through EmailJS.
-- Keeps review outreach privacy-safe: per-recipient URLs contain only opaque random tokens.

alter table public.anchor_review_outreach
  add column if not exists delivery_status text not null default 'prepared',
  add column if not exists send_attempts integer not null default 0,
  add column if not exists lease_until timestamptz,
  add column if not exists last_send_attempt_at timestamptz,
  add column if not exists last_send_error text,
  add column if not exists provider_message text,
  add column if not exists unsubscribed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.anchor_review_outreach'::regclass
      and conname = 'anchor_review_outreach_delivery_status_check'
  ) then
    alter table public.anchor_review_outreach
      add constraint anchor_review_outreach_delivery_status_check
      check (delivery_status in ('prepared','processing','retry','sent','failed','suppressed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.anchor_review_outreach'::regclass
      and conname = 'anchor_review_outreach_send_attempts_check'
  ) then
    alter table public.anchor_review_outreach
      add constraint anchor_review_outreach_send_attempts_check
      check (send_attempts >= 0);
  end if;
end $$;

update public.anchor_review_outreach
set delivery_status = case
  when unsubscribed_at is not null then 'suppressed'
  when sent_at is not null then 'sent'
  else 'prepared'
end
where delivery_status is null
   or (sent_at is not null and delivery_status = 'prepared');

create index if not exists anchor_review_outreach_delivery_idx
  on public.anchor_review_outreach(campaign_key, delivery_status, last_send_attempt_at)
  where sent_at is null;

create table if not exists private.anchor_review_outreach_runtime (
  singleton boolean primary key default true check (singleton),
  worker_url text not null default 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/anchor-review-outreach-worker',
  worker_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  automation_enabled boolean not null default false,
  automation_started_at timestamptz not null default now(),
  delay_minutes smallint not null default 60 check (delay_minutes between 5 and 10080),
  campaign_key text not null default 'anchor_review_auto_v1' check (char_length(campaign_key) between 1 and 120),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  updated_at timestamptz not null default now()
);

insert into private.anchor_review_outreach_runtime(singleton)
values(true)
on conflict(singleton) do nothing;

revoke all on private.anchor_review_outreach_runtime from public, anon, authenticated;

create or replace function public.verify_anchor_review_outreach_worker_token_v1(p_token text)
returns boolean
language sql
security definer
set search_path = private, pg_temp
as $$
  select exists(
    select 1
    from private.anchor_review_outreach_runtime
    where singleton = true
      and worker_token = p_token
  );
$$;
revoke all on function public.verify_anchor_review_outreach_worker_token_v1(text) from public, anon, authenticated;
grant execute on function public.verify_anchor_review_outreach_worker_token_v1(text) to service_role;

create or replace function public.get_anchor_review_outreach_runtime_v1()
returns table(
  automation_enabled boolean,
  automation_started_at timestamptz,
  delay_minutes smallint,
  campaign_key text,
  max_attempts smallint
)
language sql
security definer
set search_path = private, pg_temp
as $$
  select r.automation_enabled, r.automation_started_at, r.delay_minutes, r.campaign_key, r.max_attempts
  from private.anchor_review_outreach_runtime r
  where r.singleton = true;
$$;
revoke all on function public.get_anchor_review_outreach_runtime_v1() from public, anon, authenticated;
grant execute on function public.get_anchor_review_outreach_runtime_v1() to service_role;

create or replace function public.set_anchor_review_outreach_automation_v1(
  p_enabled boolean,
  p_delay_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_row private.anchor_review_outreach_runtime%rowtype;
begin
  if auth.role() <> 'service_role' and not public.is_watchdog_developer() then
    raise exception 'developer_access_required';
  end if;

  if p_delay_minutes is not null and (p_delay_minutes < 5 or p_delay_minutes > 10080) then
    raise exception 'invalid_delay_minutes';
  end if;

  update private.anchor_review_outreach_runtime
  set automation_enabled = coalesce(p_enabled, automation_enabled),
      delay_minutes = coalesce(p_delay_minutes, delay_minutes),
      automation_started_at = case
        when coalesce(p_enabled, automation_enabled) = true and automation_enabled = false then now()
        else automation_started_at
      end,
      updated_at = now()
  where singleton = true
  returning * into v_row;

  return jsonb_build_object(
    'enabled', v_row.automation_enabled,
    'started_at', v_row.automation_started_at,
    'delay_minutes', v_row.delay_minutes,
    'campaign_key', v_row.campaign_key,
    'max_attempts', v_row.max_attempts
  );
end;
$$;
revoke all on function public.set_anchor_review_outreach_automation_v1(boolean,integer) from public, anon;
grant execute on function public.set_anchor_review_outreach_automation_v1(boolean,integer) to authenticated, service_role;

create or replace function public.invoke_anchor_review_outreach_worker()
returns bigint
language plpgsql
security definer
set search_path = public, private, net, pg_temp
as $$
declare
  v_url text;
  v_token text;
  v_enabled boolean;
  v_request bigint;
begin
  select worker_url, worker_token, automation_enabled
    into v_url, v_token, v_enabled
  from private.anchor_review_outreach_runtime
  where singleton = true;

  if not coalesce(v_enabled, false) or v_url is null or v_url = '' then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-anchor-review-token', v_token
    ),
    body := jsonb_build_object('limit', 20)
  ) into v_request;

  return v_request;
end;
$$;
revoke all on function public.invoke_anchor_review_outreach_worker() from public, anon, authenticated;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'watchdog-anchor-review-outreach'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'watchdog-anchor-review-outreach',
    '*/5 * * * *',
    'select public.invoke_anchor_review_outreach_worker();'
  );
end $$;

comment on table private.anchor_review_outreach_runtime is
  'Server-only runtime controls for automated ANCHOR review-request EmailJS delivery. Automation starts disabled until the EmailJS template is confirmed.';
