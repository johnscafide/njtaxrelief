create table if not exists public.integration_provider_connections (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('boldtrail','follow_up_boss')),
  auth_type text not null check (auth_type in ('api_token','oauth2')),
  credential_secret_id uuid,
  sync_enabled boolean not null default true,
  sync_status text not null default 'idle' check (sync_status in ('idle','syncing','error','revoked')),
  sync_interval_minutes integer not null default 15 check (sync_interval_minutes between 5 and 1440),
  cursor_updated_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  last_records_seen integer not null default 0,
  last_records_upserted integer not null default 0,
  records_synced_total bigint not null default 0,
  provider_account_ref text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.integration_provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null,
  trigger_source text not null check (trigger_source in ('connect','manual','schedule','retry')),
  status text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  cursor_from timestamptz,
  cursor_to timestamptz,
  records_seen integer not null default 0,
  records_upserted integer not null default 0,
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists integration_provider_due_idx on public.integration_provider_connections(sync_enabled, sync_status, last_sync_completed_at) where sync_enabled = true and sync_status <> 'revoked';
create index if not exists integration_provider_user_idx on public.integration_provider_connections(user_id, provider);
create index if not exists integration_provider_sync_runs_user_idx on public.integration_provider_sync_runs(user_id, started_at desc);
create index if not exists integration_provider_sync_runs_connection_idx on public.integration_provider_sync_runs(connection_id, started_at desc);

alter table public.integration_provider_connections enable row level security;
alter table public.integration_provider_sync_runs enable row level security;
revoke all on public.integration_provider_connections from anon, authenticated;
revoke all on public.integration_provider_sync_runs from anon, authenticated;
grant all on public.integration_provider_connections to service_role;
grant all on public.integration_provider_sync_runs to service_role;

comment on table public.integration_provider_connections is 'Server-owned state for native direct CRM connections. Provider credentials live in Vault and are never browser-readable.';
comment on table public.integration_provider_sync_runs is 'Auditable execution history for native CRM synchronization.';

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='integration_provider_worker_token') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'integration_provider_worker_token','Internal token for Watchdog direct CRM sync worker',null);
  end if;
end;
$$;

create or replace function public.dispatch_due_provider_syncs()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net, pg_temp
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  if not exists (
    select 1
    from public.integration_provider_connections p
    join public.integration_connections c on c.id = p.connection_id
    where p.sync_enabled = true
      and p.sync_status <> 'revoked'
      and c.status = 'active'
      and (p.last_sync_completed_at is null or p.last_sync_completed_at <= now() - make_interval(mins => p.sync_interval_minutes))
  ) then return null; end if;

  select project_url into v_url from public.integration_runtime_config where id = true limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='integration_provider_worker_token' order by updated_at desc limit 1;
  if coalesce(v_url,'') = '' or coalesce(v_token,'') = '' then return null; end if;

  select net.http_post(
    url := rtrim(v_url,'/') || '/functions/v1/integration-provider-sync-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-provider-worker-token',v_token),
    body := jsonb_build_object('trigger','schedule'),
    timeout_milliseconds := 10000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.dispatch_due_provider_syncs() from public, anon, authenticated;
grant execute on function public.dispatch_due_provider_syncs() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'watchdog-integration-provider-sync';
select cron.schedule('watchdog-integration-provider-sync', '*/15 * * * *', 'select public.dispatch_due_provider_syncs();');
