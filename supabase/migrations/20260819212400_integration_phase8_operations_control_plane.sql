alter table public.integration_deliveries
  add column if not exists manual_replay_count integer not null default 0,
  add column if not exists last_replayed_at timestamptz,
  add column if not exists last_replayed_by text,
  add column if not exists last_replay_reason text;

create table if not exists public.integration_health_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete cascade,
  component text not null,
  state text not null check (state in ('healthy','degraded','failing','paused','disabled','unknown')),
  reason_code text,
  summary text,
  details jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, connection_id, component)
);

create index if not exists integration_health_states_user_updated_idx
  on public.integration_health_states(user_id, updated_at desc);
create index if not exists integration_health_states_connection_idx
  on public.integration_health_states(connection_id, updated_at desc)
  where connection_id is not null;

create table if not exists public.integration_connection_controls (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outbound_enabled boolean not null default true,
  external_writes_enabled boolean not null default true,
  disabled_event_types text[] not null default '{}'::text[],
  reason text,
  updated_by text not null default 'user',
  updated_at timestamptz not null default now()
);

create index if not exists integration_connection_controls_user_idx
  on public.integration_connection_controls(user_id, updated_at desc);

alter table public.integration_health_states enable row level security;
alter table public.integration_connection_controls enable row level security;
revoke all on public.integration_health_states from anon, authenticated;
revoke all on public.integration_connection_controls from anon, authenticated;
grant select, insert, update, delete on public.integration_health_states to service_role;
grant select, insert, update, delete on public.integration_connection_controls to service_role;

create or replace function private.integration_emit_health_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_connection_name text;
  v_provider text;
  v_previous_state text;
  v_event_key text;
begin
  if tg_op = 'UPDATE' and old.state is not distinct from new.state then
    return new;
  end if;

  if tg_op = 'INSERT' and new.state = 'healthy' then
    return new;
  end if;

  if new.connection_id is not null then
    select name, provider
      into v_connection_name, v_provider
    from public.integration_connections
    where id = new.connection_id
      and user_id = new.user_id;
  end if;

  v_previous_state := case when tg_op = 'UPDATE' then old.state else null end;
  v_event_key := 'integration-health:' || new.id::text || ':' ||
    floor(extract(epoch from new.observed_at) * 1000)::bigint::text;

  perform private.integration_enqueue_user_event(
    new.user_id,
    'integration.health.changed',
    v_event_key,
    'watchdog.integration.health',
    jsonb_build_object(
      'health_state_id', new.id,
      'connection_id', new.connection_id,
      'connection_name', v_connection_name,
      'provider', v_provider,
      'component', new.component,
      'state', new.state,
      'previous_state', v_previous_state,
      'reason_code', new.reason_code,
      'summary', new.summary,
      'observed_at', new.observed_at
    ),
    new.observed_at
  );

  return new;
end;
$$;

revoke all on function private.integration_emit_health_change() from public, anon, authenticated;

drop trigger if exists integration_health_state_event on public.integration_health_states;
create trigger integration_health_state_event
after insert or update of state on public.integration_health_states
for each row execute function private.integration_emit_health_change();
