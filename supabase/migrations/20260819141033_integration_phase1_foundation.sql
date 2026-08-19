create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'webhook',
  name text not null,
  status text not null default 'active' check (status in ('active','paused','revoked')),
  direction text not null default 'bidirectional' check (direction in ('inbound','outbound','bidirectional')),
  outbound_url text,
  outbound_secret_id uuid,
  inbound_token_hash text,
  event_types text[] not null default array['property.signal.changed','integration.test']::text[],
  scopes text[] not null default '{}'::text[],
  intelligence_access boolean not null default false,
  external_account_label text,
  metadata jsonb not null default '{}'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  event_type text not null,
  event_key text not null,
  source text not null default 'watchdog',
  status text not null default 'accepted' check (status in ('accepted','queued','processed','rejected')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists integration_events_connection_key_uq on public.integration_events(connection_id, direction, event_key) where connection_id is not null;
create unique index if not exists integration_events_user_key_uq on public.integration_events(user_id, direction, event_key) where connection_id is null;

create table if not exists public.integration_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.integration_events(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed','canceled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id,event_id)
);

create table if not exists public.integration_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.integration_deliveries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_no integer not null,
  status text not null check (status in ('delivered','failed')),
  response_status integer,
  response_excerpt text,
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  unique(delivery_id,attempt_no)
);

create table if not exists public.integration_crm_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  external_contact_id text not null,
  property_ref text,
  property_address text,
  contact_name text,
  contact_email text,
  contact_phone text,
  lead_stage text,
  relationship text,
  last_activity_at timestamptz,
  tags text[] not null default '{}'::text[],
  context jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists integration_crm_context_identity_uq on public.integration_crm_context(user_id,connection_id,external_contact_id,coalesce(property_ref,''));

create table if not exists public.integration_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  action text not null,
  actor text not null default 'user',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists integration_connections_user_idx on public.integration_connections(user_id,status);
create index if not exists integration_events_user_created_idx on public.integration_events(user_id,created_at desc);
create index if not exists integration_deliveries_due_idx on public.integration_deliveries(status,next_attempt_at) where status in ('pending','failed');
create index if not exists integration_deliveries_user_created_idx on public.integration_deliveries(user_id,created_at desc);
create index if not exists integration_attempts_delivery_idx on public.integration_delivery_attempts(delivery_id,attempt_no desc);
create index if not exists integration_context_user_idx on public.integration_crm_context(user_id,updated_at desc);

alter table public.integration_connections enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_deliveries enable row level security;
alter table public.integration_delivery_attempts enable row level security;
alter table public.integration_crm_context enable row level security;
alter table public.integration_audit_log enable row level security;

revoke all on public.integration_connections from anon, authenticated;
revoke all on public.integration_events from anon, authenticated;
revoke all on public.integration_deliveries from anon, authenticated;
revoke all on public.integration_delivery_attempts from anon, authenticated;
revoke all on public.integration_crm_context from anon, authenticated;
revoke all on public.integration_audit_log from anon, authenticated;

grant select,insert,update,delete on public.integration_connections to service_role;
grant select,insert,update,delete on public.integration_events to service_role;
grant select,insert,update,delete on public.integration_deliveries to service_role;
grant select,insert,update,delete on public.integration_delivery_attempts to service_role;
grant select,insert,update,delete on public.integration_crm_context to service_role;
grant select,insert,update,delete on public.integration_audit_log to service_role;

create or replace function public.integration_store_secret(p_secret text,p_name text,p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare v_id uuid;
begin
  if p_secret is null or length(p_secret) < 20 then raise exception 'Secret too short'; end if;
  v_id := vault.create_secret(p_secret,p_name,p_description,null);
  return v_id;
end;
$$;
revoke all on function public.integration_store_secret(text,text,text) from public, anon, authenticated;
grant execute on function public.integration_store_secret(text,text,text) to service_role;

create or replace function public.integration_get_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault, pg_temp
as $$ select secret from vault.decrypted_secrets where id = p_secret_id limit 1; $$;
revoke all on function public.integration_get_secret(uuid) from public, anon, authenticated;
grant execute on function public.integration_get_secret(uuid) to service_role;

create or replace function public.integration_delete_secret(p_secret_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
begin
  delete from vault.secrets where id = p_secret_id;
  return found;
end;
$$;
revoke all on function public.integration_delete_secret(uuid) from public, anon, authenticated;
grant execute on function public.integration_delete_secret(uuid) to service_role;

create or replace function private.integration_enqueue_property_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_event_id uuid;
begin
  insert into public.integration_events(user_id,direction,event_type,event_key,source,status,payload,occurred_at)
  values (new.user_id,'outbound','property.signal.changed','property_update:' || new.id::text,'watchdog.property_update_events','queued',jsonb_strip_nulls(jsonb_build_object('pams_pin',new.pams_pin,'source_event_type',new.event_type,'severity',new.severity,'title',new.title,'summary',new.summary,'marker_id',new.marker_id,'old_value',new.old_value,'new_value',new.new_value,'delta_numeric',new.delta_numeric,'source_url',new.source_url,'occurred_at',new.occurred_at)),coalesce(new.occurred_at,now()))
  on conflict do nothing returning id into v_event_id;
  if v_event_id is null then select id into v_event_id from public.integration_events where user_id=new.user_id and connection_id is null and direction='outbound' and event_key='property_update:' || new.id::text limit 1; end if;
  if v_event_id is not null then
    insert into public.integration_deliveries(event_id,connection_id,user_id,status,next_attempt_at)
    select v_event_id,c.id,new.user_id,'pending',now() from public.integration_connections c
    where c.user_id=new.user_id and c.status='active' and c.direction in ('outbound','bidirectional') and c.outbound_url is not null and 'property.signal.changed'=any(c.event_types)
    on conflict(connection_id,event_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.integration_enqueue_property_update() from public;

drop trigger if exists trg_integration_property_update on public.property_update_events;
create trigger trg_integration_property_update after insert on public.property_update_events for each row execute function private.integration_enqueue_property_update();
