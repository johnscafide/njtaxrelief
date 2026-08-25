-- NJW-37: durable anti-scraping request budgets and security-event ledger.
-- Client identifiers are HMACs produced server-side with the existing service-role
-- secret. Raw IP addresses are never persisted in this schema.

create schema if not exists watchdog_security;
revoke all on schema watchdog_security from public;
revoke all on schema watchdog_security from anon;
revoke all on schema watchdog_security from authenticated;

grant usage on schema watchdog_security to service_role;

create table if not exists watchdog_security.public_request_rate_limits (
  client_hash text not null,
  bucket text not null,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (client_hash, bucket),
  check (length(client_hash) between 16 and 128),
  check (length(bucket) between 1 and 96)
);

alter table watchdog_security.public_request_rate_limits enable row level security;
revoke all on watchdog_security.public_request_rate_limits from public;
revoke all on watchdog_security.public_request_rate_limits from anon;
revoke all on watchdog_security.public_request_rate_limits from authenticated;

create table if not exists watchdog_security.public_request_security_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default clock_timestamp(),
  event_type text not null check (length(event_type) between 1 and 64),
  client_hash text,
  route text not null check (length(route) between 1 and 160),
  scope text,
  automation_hint boolean not null default false,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists public_request_security_events_created_at_idx
  on watchdog_security.public_request_security_events (created_at desc);

alter table watchdog_security.public_request_security_events enable row level security;
revoke all on watchdog_security.public_request_security_events from public;
revoke all on watchdog_security.public_request_security_events from anon;
revoke all on watchdog_security.public_request_security_events from authenticated;

create or replace function public.consume_public_request_budget(
  p_client_hash text,
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = 'watchdog_security', 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_count integer;
begin
  if trim(coalesce(p_client_hash, '')) = '' or length(p_client_hash) > 128 then
    raise exception 'invalid client hash';
  end if;
  if trim(coalesce(p_bucket, '')) = '' or length(p_bucket) > 96 then
    raise exception 'invalid bucket';
  end if;
  if p_window_seconds < 10 or p_window_seconds > 86400 then
    raise exception 'invalid window';
  end if;
  if p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid limit';
  end if;

  insert into watchdog_security.public_request_rate_limits (
    client_hash, bucket, window_started_at, request_count, updated_at
  ) values (
    p_client_hash, p_bucket, v_now, 1, v_now
  )
  on conflict (client_hash, bucket) do update
  set
    window_started_at = case
      when watchdog_security.public_request_rate_limits.window_started_at
           + make_interval(secs => p_window_seconds) <= v_now then v_now
      else watchdog_security.public_request_rate_limits.window_started_at
    end,
    request_count = case
      when watchdog_security.public_request_rate_limits.window_started_at
           + make_interval(secs => p_window_seconds) <= v_now then 1
      else watchdog_security.public_request_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning window_started_at, request_count
  into v_started, v_count;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_started + make_interval(secs => p_window_seconds);
end;
$function$;

revoke all on function public.consume_public_request_budget(text, text, integer, integer) from public;
revoke all on function public.consume_public_request_budget(text, text, integer, integer) from anon;
revoke all on function public.consume_public_request_budget(text, text, integer, integer) from authenticated;
grant execute on function public.consume_public_request_budget(text, text, integer, integer) to service_role;

create or replace function public.record_public_request_security_event(
  p_event_type text,
  p_client_hash text,
  p_route text,
  p_scope text default null,
  p_automation_hint boolean default false,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = 'watchdog_security', 'public', 'pg_temp'
as $function$
begin
  insert into watchdog_security.public_request_security_events (
    event_type, client_hash, route, scope, automation_hint, detail
  ) values (
    left(trim(coalesce(p_event_type, 'unknown')), 64),
    nullif(left(trim(coalesce(p_client_hash, '')), 128), ''),
    left(trim(coalesce(p_route, '/')), 160),
    nullif(left(trim(coalesce(p_scope, '')), 160), ''),
    coalesce(p_automation_hint, false),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.record_public_request_security_event(text, text, text, text, boolean, jsonb) from public;
revoke all on function public.record_public_request_security_event(text, text, text, text, boolean, jsonb) from anon;
revoke all on function public.record_public_request_security_event(text, text, text, text, boolean, jsonb) from authenticated;
grant execute on function public.record_public_request_security_event(text, text, text, text, boolean, jsonb) to service_role;

-- Keep only short-lived pseudonymous security telemetry. The largest active
-- request budget is one hour, so two hours is sufficient for the counter rows.
-- Suspicious-event evidence is retained for seven days for operational review.
do $do$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'njw37_public_request_security_cleanup'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end
$do$;

select cron.schedule(
  'njw37_public_request_security_cleanup',
  '17 * * * *',
  $$delete from watchdog_security.public_request_rate_limits where updated_at < now() - interval '2 hours';
    delete from watchdog_security.public_request_security_events where created_at < now() - interval '7 days';$$
);
