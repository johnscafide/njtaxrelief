alter table public.integration_crm_property_links
  drop constraint if exists integration_crm_property_links_link_method_check;
alter table public.integration_crm_property_links
  add constraint integration_crm_property_links_link_method_check
  check (link_method in ('provider_property_ref','exact_address_candidate','manual','verified_address','external_mapping'));

alter table public.integration_crm_property_links
  add column if not exists candidate_property_address text,
  add column if not exists candidate_municipality text,
  add column if not exists candidate_count integer not null default 1 check (candidate_count >= 1),
  add column if not exists reviewed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create index if not exists integration_crm_property_links_review_idx
  on public.integration_crm_property_links(user_id,status,created_at desc);

create table if not exists public.integration_crm_resolution_state (
  crm_context_id uuid primary key references public.integration_crm_context(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null,
  detail_status text not null default 'pending'
    check (detail_status in ('pending','enriched','no_address','non_nj','no_match','candidate','ambiguous','error')),
  provider_address_source text,
  normalized_address text,
  normalized_zip text,
  detail_checked_at timestamptz,
  next_attempt_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_crm_resolution_state_queue_idx
  on public.integration_crm_resolution_state(connection_id,detail_status,next_attempt_at,updated_at);
create index if not exists integration_crm_resolution_state_user_idx
  on public.integration_crm_resolution_state(user_id,detail_status,updated_at desc);

alter table public.integration_crm_resolution_state enable row level security;
revoke all on table public.integration_crm_resolution_state from anon, authenticated;
grant select,insert,update,delete on table public.integration_crm_resolution_state to service_role;

create or replace function public.integration_seed_crm_resolution(
  p_user_id uuid,
  p_connection_id uuid
) returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_count integer := 0;
begin
  insert into public.integration_crm_resolution_state(
    crm_context_id,user_id,connection_id,provider,detail_status,updated_at
  )
  select c.id,c.user_id,c.connection_id,coalesce(nullif(c.context->>'provider',''),'generic'),'pending',now()
  from public.integration_crm_context c
  join public.integration_connections ic on ic.id=c.connection_id and ic.user_id=c.user_id
  where c.user_id=p_user_id
    and c.connection_id=p_connection_id
    and ic.status='active'
  on conflict (crm_context_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.integration_seed_crm_resolution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.integration_seed_crm_resolution(uuid,uuid) to service_role;

comment on table public.integration_crm_resolution_state is
  'Server-only CRM property-resolution work state. Address evidence may create candidates but never ownership truth without explicit or user-verified evidence.';
comment on column public.integration_crm_property_links.reviewed_by_user_id is
  'Watchdog account user who explicitly accepted or rejected a CRM-property candidate.';
comment on column public.integration_crm_property_links.candidate_property_address is
  'Governed property address returned by the parcel source for the candidate PAMS pin.';