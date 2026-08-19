create table if not exists public.integration_crm_property_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  crm_context_id uuid not null references public.integration_crm_context(id) on delete cascade,
  pams_pin text not null,
  crm_property_address text,
  link_method text not null check (link_method in ('provider_property_ref','manual','verified_address','external_mapping')),
  confidence numeric(5,4) not null default 1 check (confidence >= 0 and confidence <= 1),
  status text not null default 'verified' check (status in ('candidate','verified','rejected')),
  evidence jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, crm_context_id, pams_pin)
);

create index if not exists integration_crm_property_links_user_pin_idx on public.integration_crm_property_links(user_id,pams_pin,status);
create index if not exists integration_crm_property_links_connection_idx on public.integration_crm_property_links(connection_id,status);

alter table public.integration_crm_property_links enable row level security;
revoke all on table public.integration_crm_property_links from anon, authenticated;
grant select,insert,update,delete on table public.integration_crm_property_links to service_role;

create table if not exists public.intelligence_crm_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.intelligence_analyst_sessions(id) on delete set null,
  connection_ids uuid[] not null default '{}'::uuid[],
  access_mode text not null check (access_mode in ('overview','property','search')),
  record_count integer not null default 0,
  property_scope_count integer not null default 0,
  fields_returned text[] not null default '{}'::text[],
  query_fingerprint text,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_crm_access_log_user_created_idx on public.intelligence_crm_access_log(user_id,created_at desc);
alter table public.intelligence_crm_access_log enable row level security;
revoke all on table public.intelligence_crm_access_log from anon, authenticated;
grant select,insert on table public.intelligence_crm_access_log to service_role;

create or replace function public.integration_refresh_explicit_crm_links(p_user_id uuid, p_connection_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  insert into public.integration_crm_property_links(
    user_id, connection_id, crm_context_id, pams_pin, crm_property_address,
    link_method, confidence, status, evidence, verified_at, updated_at
  )
  select
    c.user_id, c.connection_id, c.id, c.property_ref, c.property_address,
    'provider_property_ref', 1, 'verified',
    jsonb_build_object('source','explicit_crm_property_ref','crm_context_id',c.id),
    now(), now()
  from public.integration_crm_context c
  join public.integration_connections ic on ic.id=c.connection_id and ic.user_id=c.user_id
  where c.user_id=p_user_id
    and (p_connection_id is null or c.connection_id=p_connection_id)
    and ic.status='active'
    and c.property_ref is not null
    and c.property_ref ~ '^\d{4}_.+'
  on conflict (user_id,crm_context_id,pams_pin)
  do update set
    crm_property_address=excluded.crm_property_address,
    link_method='provider_property_ref',
    confidence=1,
    status='verified',
    evidence=excluded.evidence,
    verified_at=coalesce(public.integration_crm_property_links.verified_at,now()),
    updated_at=now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.integration_refresh_explicit_crm_links(uuid,uuid) from public, anon, authenticated;
grant execute on function public.integration_refresh_explicit_crm_links(uuid,uuid) to service_role;

comment on table public.integration_crm_property_links is 'Verified or user-controlled CRM-to-property relationships. Phase 5 never infers ownership or seller intent from names.';
comment on table public.intelligence_crm_access_log is 'Audit trail for governed CRM context reads by Watchdog Intelligence; stores metadata only, not CRM payloads or prompts.';
