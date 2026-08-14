-- NJW-153: provider-specific capability/auth metadata without provider secrets.
alter table public.marketing_providers
  add column if not exists adapter_version text not null default '1',
  add column if not exists auth_strategy text not null default 'api_key',
  add column if not exists docs_url text,
  add column if not exists operations jsonb not null default '[]'::jsonb,
  add column if not exists compliance jsonb not null default '{}'::jsonb,
  add column if not exists credential_schema jsonb not null default '{}'::jsonb;

create table if not exists public.marketing_provider_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid, provider_key text not null references public.marketing_providers(provider_key) on update cascade on delete restrict,
  connection_scope text not null default 'platform' check(connection_scope in ('platform','organization','user')),
  mode text not null default 'not_connected' check(mode in ('not_connected','sandbox','live','degraded')),
  status text not null default 'not_connected' check(status in ('not_connected','pending','connected','degraded','revoked')),
  external_account_ref text, public_config jsonb not null default '{}'::jsonb, health_summary jsonb not null default '{}'::jsonb,
  last_health_at timestamptz, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((connection_scope='user' and user_id is not null) or connection_scope<>'user')
);
create unique index if not exists marketing_provider_connections_platform_key on public.marketing_provider_connections(provider_key) where connection_scope='platform';
create unique index if not exists marketing_provider_connections_user_key on public.marketing_provider_connections(user_id,provider_key) where connection_scope='user';
create index if not exists marketing_provider_connections_org_idx on public.marketing_provider_connections(organization_id,provider_key) where connection_scope='organization';
alter table public.marketing_provider_connections enable row level security;
revoke all on public.marketing_provider_connections from anon,authenticated;
grant all on public.marketing_provider_connections to service_role;
create policy marketing_provider_connections_service on public.marketing_provider_connections for all to service_role using (true) with check (true);

update public.marketing_providers set display_name='PostcardMania',adapter_version='1',auth_strategy='api_key_or_oauth_token',docs_url='https://docs.pcmintegrations.com/docs/directmail-api/84aca6606cef4-direct-mail-api-v3',operations='["health","quote","validate","submit","status","cancel","proof","tracking"]'::jsonb,compliance='{"physical_mail":true,"property_address_allowed":true,"demographic_profiling":false}'::jsonb,credential_schema='{"server_secrets":["PCM_ACCESS_TOKEN","PCM_API_KEY","PCM_API_SECRET","PCM_TOKEN_URL"],"optional":["PCM_CHILD_REF_NBR"]}'::jsonb where provider_key='pcm';
update public.marketing_providers set display_name='CallRail',adapter_version='1',auth_strategy='api_key',docs_url='https://apidocs.callrail.com/',operations='["health","tracking_number","calls","attribution","status"]'::jsonb,compliance='{"call_attribution":true,"request_from_header":"nj_watchdog","store_minimum_call_metadata":true}'::jsonb,credential_schema='{"server_secrets":["CALLRAIL_API_KEY","CALLRAIL_ACCOUNT_ID"],"optional":["CALLRAIL_COMPANY_ID"]}'::jsonb where provider_key='callrail';
update public.marketing_providers set display_name='Google Ads',adapter_version='1',auth_strategy='oauth2_multi_user',docs_url='https://developers.google.com/google-ads/api/docs/oauth/overview',operations='["health","accounts","campaign_create","campaign_update","budget","geo_targeting","conversion_tracking","status"]'::jsonb,compliance='{"owner_record_custom_audiences":false,"geo_contextual_allowed":true,"first_party_only_for_customer_match":true}'::jsonb,credential_schema='{"server_secrets":["GOOGLE_ADS_DEVELOPER_TOKEN","GOOGLE_ADS_CLIENT_ID","GOOGLE_ADS_CLIENT_SECRET"],"per_user_oauth":true,"optional":["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]}'::jsonb where provider_key='google_ads';
update public.marketing_providers set display_name='Lob',adapter_version='1',auth_strategy='basic_api_key',docs_url='https://docs.lob.com/',operations='["health","address_verify","postcard","letter","self_mailer","status","cancel","tracking"]'::jsonb,compliance='{"physical_mail":true,"property_address_allowed":true}'::jsonb,credential_schema='{"server_secrets":["LOB_API_KEY"]}'::jsonb where provider_key='lob';
update public.marketing_providers set active=false where provider_key in ('email','sms');
insert into public.marketing_providers(provider_key,display_name,provider_type,capabilities,default_mode,adapter_version,auth_strategy,docs_url,operations,compliance,credential_schema,active) values
('sendgrid','Twilio SendGrid','email','{"permission_required":true,"templates":true,"scheduled_send":true,"tracking":true}'::jsonb,'not_connected','1','bearer_api_key','https://www.twilio.com/docs/sendgrid/api-reference/mail-send','["health","send","template","status","events"]'::jsonb,'{"consent_required":true,"suppression_required":true,"cold_property_record_email":false,"domain_authentication_required":true}'::jsonb,'{"server_secrets":["SENDGRID_API_KEY","SENDGRID_FROM_EMAIL"],"optional":["SENDGRID_FROM_NAME"]}'::jsonb,true),
('twilio_sms','Twilio Messaging','sms','{"permission_required":true,"scheduled_send":true,"status_callbacks":true,"quiet_hours":true}'::jsonb,'not_connected','1','basic_api_key','https://www.twilio.com/docs/messaging/api','["health","send","status","events"]'::jsonb,'{"consent_required":true,"suppression_required":true,"cold_property_record_sms":false,"quiet_hours_required":true}'::jsonb,'{"server_secrets":["TWILIO_ACCOUNT_SID","TWILIO_API_KEY","TWILIO_API_KEY_SECRET","TWILIO_MESSAGING_SERVICE_SID"]}'::jsonb,true)
on conflict(provider_key) do update set display_name=excluded.display_name,provider_type=excluded.provider_type,capabilities=excluded.capabilities,adapter_version=excluded.adapter_version,auth_strategy=excluded.auth_strategy,docs_url=excluded.docs_url,operations=excluded.operations,compliance=excluded.compliance,credential_schema=excluded.credential_schema,active=excluded.active,updated_at=now();
