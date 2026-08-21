-- NJW-264: private user-scoped Kit newsletter provider foundation.
-- Initial access is granted separately in production to approved internal users;
-- no generated user IDs or account emails are committed in this migration.

insert into public.marketing_providers(
  provider_key,display_name,provider_type,capabilities,default_mode,adapter_version,
  auth_strategy,docs_url,operations,compliance,credential_schema,billing_model,active
) values (
  'kit',
  'Kit',
  'email',
  '{"permission_required":true,"subscribers":true,"tags":true,"segments":true,"broadcasts":true,"drafts":true,"scheduled_send":true,"webhooks":true,"unsubscribe_events":true,"oauth_public_release":true}'::jsonb,
  'not_connected',
  '1',
  'api_key_private_oauth2_public',
  'https://developers.kit.com/v4',
  '["health","subscribers_list","subscriber_upsert","tags_list","tag_create","tag_apply","segments_list","broadcast_create","broadcast_update","broadcast_status","webhook_create","webhook_list","unsubscribe"]'::jsonb,
  '{"consent_required":true,"suppression_required":true,"cold_property_record_email":false,"crm_presence_is_not_consent":true,"explicit_send_approval_required":true,"provider_unsubscribe_reconciliation":true}'::jsonb,
  '{"private_beta":{"secret_types":["api_key"]},"public_release":{"oauth2":true,"refresh_token":true},"browser_secret_exposure":false}'::jsonb,
  'user_direct',
  true
)
on conflict(provider_key) do update set
  display_name=excluded.display_name,
  provider_type=excluded.provider_type,
  capabilities=excluded.capabilities,
  default_mode=excluded.default_mode,
  adapter_version=excluded.adapter_version,
  auth_strategy=excluded.auth_strategy,
  docs_url=excluded.docs_url,
  operations=excluded.operations,
  compliance=excluded.compliance,
  credential_schema=excluded.credential_schema,
  billing_model=excluded.billing_model,
  active=excluded.active,
  updated_at=now();

create table if not exists public.marketing_email_beta_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_level text not null default 'private_beta' check(access_level in ('private_beta','internal_admin')),
  note text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.marketing_email_sender_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_connection_id uuid not null references public.marketing_provider_connections(id) on delete cascade,
  provider_key text not null references public.marketing_providers(provider_key) on update cascade on delete restrict,
  email_address text not null check(email_address ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  display_name text,
  domain text not null,
  verification_status text not null default 'declared' check(verification_status in ('declared','provider_primary','provider_verified','rejected')),
  is_default boolean not null default false,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider_connection_id,email_address)
);
create unique index if not exists marketing_email_sender_default_uq
  on public.marketing_email_sender_identities(user_id,provider_connection_id)
  where is_default;
create index if not exists marketing_email_sender_user_idx
  on public.marketing_email_sender_identities(user_id,updated_at desc);

create table if not exists public.marketing_email_contact_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  crm_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  crm_external_contact_id text not null,
  provider_connection_id uuid not null references public.marketing_provider_connections(id) on delete cascade,
  provider_key text not null references public.marketing_providers(provider_key) on update cascade on delete restrict,
  provider_subscriber_id text,
  contact_email_hash text not null check(contact_email_hash ~ '^[a-f0-9]{64}$'),
  provider_state text,
  provider_tags jsonb not null default '[]'::jsonb,
  eligibility_status text not null default 'unknown' check(eligibility_status in ('unknown','eligible','suppressed','unsubscribed','bounced','complained','invalid')),
  eligibility_reason text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,crm_connection_id,crm_external_contact_id,provider_connection_id)
);
create unique index if not exists marketing_email_provider_subscriber_uq
  on public.marketing_email_contact_links(provider_connection_id,provider_subscriber_id)
  where provider_subscriber_id is not null;
create index if not exists marketing_email_contact_links_user_idx
  on public.marketing_email_contact_links(user_id,eligibility_status,updated_at desc);

create table if not exists public.marketing_email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  creative_id uuid references public.marketing_creatives(id) on delete set null,
  provider_connection_id uuid not null references public.marketing_provider_connections(id) on delete cascade,
  provider_key text not null references public.marketing_providers(provider_key) on update cascade on delete restrict,
  external_broadcast_id text,
  status text not null default 'draft' check(status in ('draft','scheduled','sending','sent','canceled','error')),
  subject text not null,
  preview_text text,
  from_email text,
  target_definition jsonb not null default '{}'::jsonb,
  content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  send_at timestamptz,
  provider_snapshot jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_email_external_broadcast_uq
  on public.marketing_email_broadcasts(provider_connection_id,external_broadcast_id)
  where external_broadcast_id is not null;
create index if not exists marketing_email_broadcasts_user_idx
  on public.marketing_email_broadcasts(user_id,updated_at desc);

alter table public.marketing_email_beta_access enable row level security;
alter table public.marketing_email_sender_identities enable row level security;
alter table public.marketing_email_contact_links enable row level security;
alter table public.marketing_email_broadcasts enable row level security;

revoke all on public.marketing_email_beta_access from anon,authenticated;
revoke all on public.marketing_email_sender_identities from anon,authenticated;
revoke all on public.marketing_email_contact_links from anon,authenticated;
revoke all on public.marketing_email_broadcasts from anon,authenticated;

grant all on public.marketing_email_beta_access to service_role;
grant all on public.marketing_email_sender_identities to service_role;
grant all on public.marketing_email_contact_links to service_role;
grant all on public.marketing_email_broadcasts to service_role;

create policy marketing_email_beta_access_service on public.marketing_email_beta_access
  for all to service_role using(true) with check(true);
create policy marketing_email_sender_identities_service on public.marketing_email_sender_identities
  for all to service_role using(true) with check(true);
create policy marketing_email_contact_links_service on public.marketing_email_contact_links
  for all to service_role using(true) with check(true);
create policy marketing_email_broadcasts_service on public.marketing_email_broadcasts
  for all to service_role using(true) with check(true);

-- Deletes all Vault material for one Marketing Studio provider connection.
-- Kept service-role only so browser clients can never enumerate or delete Vault secrets.
create or replace function public.marketing_delete_provider_secrets(p_connection_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare r record; n integer:=0;
begin
  for r in select id,vault_secret_id from public.marketing_provider_secret_refs where connection_id=p_connection_id for update loop
    delete from vault.secrets where id=r.vault_secret_id;
    delete from public.marketing_provider_secret_refs where id=r.id;
    n:=n+1;
  end loop;
  return n;
end;
$$;
revoke all on function public.marketing_delete_provider_secrets(uuid) from public,anon,authenticated;
grant execute on function public.marketing_delete_provider_secrets(uuid) to service_role;
