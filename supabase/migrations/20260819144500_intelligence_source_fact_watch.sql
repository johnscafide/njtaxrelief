-- Governed background source-fact watcher for saved paid properties.
-- Purpose: establish a factual baseline from NJ MOD-IV and record only later real changes
-- into the service-only model-research candidate ledger. This is NOT a notification
-- stream, does not create Intelligence findings, and excludes Standard-plan properties.
-- The scheduler is environment-safe: it is a no-op until this environment's control row
-- is explicitly enabled and given its own project URL.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.intelligence_source_fact_watch_control (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  project_url text,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  batch_limit integer not null default 500 check (batch_limit between 25 and 5000),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_source_fact_watch_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text not null,
  marker_id text not null,
  value_json jsonb not null,
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  source_id text not null default 'nj-parcels-modiv',
  source_ref text not null,
  first_observed_at timestamptz not null default now(),
  last_changed_at timestamptz,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,pams_pin,marker_id)
);

create table if not exists public.intelligence_source_fact_watch_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','complete','failed','disabled')),
  eligible_users integer not null default 0,
  eligible_properties integer not null default 0,
  provider_batches integer not null default 0,
  provider_records integer not null default 0,
  baselines_created integer not null default 0,
  unchanged_observations integer not null default 0,
  changed_observations integer not null default 0,
  candidates_created integer not null default 0,
  error_code text,
  error_message text,
  metrics jsonb not null default '{}'::jsonb
);

alter table public.intelligence_source_fact_watch_control enable row level security;
alter table public.intelligence_source_fact_watch_state enable row level security;
alter table public.intelligence_source_fact_watch_runs enable row level security;

revoke all on public.intelligence_source_fact_watch_control from anon, authenticated;
revoke all on public.intelligence_source_fact_watch_state from anon, authenticated;
revoke all on public.intelligence_source_fact_watch_runs from anon, authenticated;
grant select,insert,update,delete on public.intelligence_source_fact_watch_control to service_role;
grant select,insert,update,delete on public.intelligence_source_fact_watch_state to service_role;
grant select,insert,update,delete on public.intelligence_source_fact_watch_runs to service_role;

create index if not exists intelligence_source_fact_watch_state_pin_idx
  on public.intelligence_source_fact_watch_state (pams_pin,marker_id);
create index if not exists intelligence_source_fact_watch_state_checked_idx
  on public.intelligence_source_fact_watch_state (checked_at);
create index if not exists intelligence_source_fact_watch_runs_started_idx
  on public.intelligence_source_fact_watch_runs (started_at desc);

-- Generate one environment-local internal scheduler token. The plaintext lives only in Vault;
-- the Edge Function compares the request token to this service-only SHA-256 hash.
do $$
declare
  v_token text;
  v_hash text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='watchdog_source_fact_watch_token'
  order by updated_at desc
  limit 1;

  if v_token is null then
    v_token := encode(gen_random_bytes(32),'hex');
    perform vault.create_secret(v_token,'watchdog_source_fact_watch_token','Internal token for Watchdog saved-property source-fact watcher',null);
  end if;

  v_hash := encode(digest(v_token,'sha256'),'hex');
  insert into public.intelligence_source_fact_watch_control(id,enabled,project_url,token_hash,batch_limit,updated_at)
  values(true,false,null,v_hash,500,now())
  on conflict (id) do update set token_hash=excluded.token_hash,updated_at=now();
end $$;

create or replace function private.intelligence_kick_source_fact_watch()
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_enabled boolean;
  v_url text;
  v_token text;
  v_limit integer;
  v_request_id bigint;
begin
  select enabled,project_url,batch_limit
    into v_enabled,v_url,v_limit
  from public.intelligence_source_fact_watch_control
  where id=true;

  if not coalesce(v_enabled,false) or v_url is null then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='watchdog_source_fact_watch_token'
  order by updated_at desc
  limit 1;

  if v_token is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url,'/') || '/functions/v1/intelligence-source-fact-watch',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-watch-token',v_token),
    body := jsonb_build_object('limit',coalesce(v_limit,500)),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end $$;
revoke all on function private.intelligence_kick_source_fact_watch() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='watchdog-source-fact-watch';

select cron.schedule(
  'watchdog-source-fact-watch',
  '17 */6 * * *',
  'select private.intelligence_kick_source_fact_watch();'
);

comment on table public.intelligence_source_fact_watch_state is
'Service-only authoritative source-fact baseline for saved paid properties. First observation is baseline only; later value changes may create model-research candidates.';
comment on table public.intelligence_source_fact_watch_runs is
'Operational aggregate log for the saved-property source-fact watcher; contains no property values or identifiers.';
comment on function private.intelligence_kick_source_fact_watch() is
'Environment-safe pg_cron dispatcher. No-op until local control is explicitly enabled with a local project URL.';

-- Installation assertions.
do $$
begin
  if has_table_privilege('anon','public.intelligence_source_fact_watch_state','SELECT')
     or has_table_privilege('authenticated','public.intelligence_source_fact_watch_state','SELECT') then
    raise exception 'Source-fact watch state must not be browser-readable';
  end if;
  if not exists(select 1 from cron.job where jobname='watchdog-source-fact-watch') then
    raise exception 'Source-fact watch cron job was not installed';
  end if;
end $$;