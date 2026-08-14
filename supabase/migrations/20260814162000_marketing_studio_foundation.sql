-- NJW-149: provider-neutral Marketing Studio foundation.
-- Production migration applied through Supabase. This checked-in migration documents the schema contract.
-- Agent+ access is enforced through public.can_use_data_workbench(auth.uid()).

create table if not exists public.marketing_providers (
  id uuid primary key default gen_random_uuid(), provider_key text not null unique,
  display_name text not null, provider_type text not null, capabilities jsonb not null default '{}'::jsonb,
  default_mode text not null default 'not_connected' check (default_mode in ('not_connected','sandbox','live','degraded')),
  config_schema jsonb not null default '{}'::jsonb, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- The production schema created by this migration contains these user-scoped resources:
-- marketing_audiences, marketing_audience_snapshots, marketing_campaigns,
-- marketing_campaign_versions, marketing_campaign_steps, marketing_brand_profiles,
-- marketing_creatives, marketing_price_quotes, marketing_payments,
-- marketing_provider_jobs, marketing_events, marketing_attribution, marketing_suppressions.
-- Immutable/server-authoritative resources (snapshots, versions, steps, creatives, quotes,
-- payments, provider jobs, events and attribution) are SELECT-only to authenticated clients.
-- RLS restricts reads to auth.uid() and Agent+ entitlement. Server functions/service role own writes.

insert into public.marketing_providers(provider_key,display_name,provider_type,capabilities,default_mode) values
('pcm','PostcardMania','direct_mail','{"postcards":true,"letters":true,"proofs":true,"scheduled_send":true,"tracking":true,"sequences":true}'::jsonb,'not_connected'),
('callrail','CallRail','call_attribution','{"tracking_numbers":true,"calls":true,"attribution":true}'::jsonb,'not_connected'),
('google_ads','Google Ads','digital_ads','{"search":true,"geo_targeting":true,"conversion_tracking":true}'::jsonb,'not_connected'),
('lob','Lob','direct_mail','{"postcards":true,"letters":true,"address_verification":true,"scheduled_send":true,"tracking":true}'::jsonb,'not_connected'),
('email','Email Provider','email','{"permission_required":true,"sequences":true,"tracking":true}'::jsonb,'not_connected'),
('sms','SMS Provider','sms','{"permission_required":true,"sequences":true,"quiet_hours":true}'::jsonb,'not_connected')
on conflict(provider_key) do update set capabilities=excluded.capabilities, updated_at=now();
