create table if not exists public.integration_provider_controls (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  outbound_enabled boolean not null default true,
  external_writes_enabled boolean not null default true,
  disabled_event_types text[] not null default '{}'::text[],
  reason text,
  updated_by text not null default 'user',
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  check (length(trim(provider)) between 1 and 80)
);

create index if not exists integration_provider_controls_updated_idx
  on public.integration_provider_controls(user_id, updated_at desc);

alter table public.integration_provider_controls enable row level security;
revoke all on public.integration_provider_controls from anon, authenticated;
grant select, insert, update, delete on public.integration_provider_controls to service_role;

create unique index if not exists integration_health_states_global_component_uidx
  on public.integration_health_states(user_id, component)
  where connection_id is null;
