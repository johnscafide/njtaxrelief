create table if not exists public.integration_field_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, connection_id)
);

create index if not exists integration_field_mappings_connection_idx
  on public.integration_field_mappings(connection_id, updated_at desc);

alter table public.integration_field_mappings enable row level security;
revoke all on public.integration_field_mappings from anon, authenticated;
grant select,insert,update,delete on public.integration_field_mappings to service_role;

alter table public.integration_connections
  add column if not exists intelligence_access_updated_at timestamptz,
  add column if not exists intelligence_access_updated_by text;

comment on table public.integration_field_mappings is 'Server-owned per-connection CRM field path mapping into Watchdog normalized CRM context.';
comment on column public.integration_connections.intelligence_access_updated_at is 'Last explicit CRM-context Intelligence permission change timestamp.';
comment on column public.integration_connections.intelligence_access_updated_by is 'Actor class for the latest Intelligence permission change.';
