-- NJW-154: Creative Studio + Direct Mail Launch 1.0
-- Production migration applied via Supabase. This file records the schema/API contract.

create table if not exists public.marketing_creative_templates (
  id uuid primary key default gen_random_uuid(), template_key text not null unique,
  title text not null, description text not null default '',
  creative_type text not null check (creative_type in ('postcard','letter')),
  professions text[] not null default '{}', goals text[] not null default '{}',
  layout_key text not null default 'clean_local', content jsonb not null default '{}'::jsonb,
  active boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.marketing_creative_templates enable row level security;
create policy marketing_creative_templates_read on public.marketing_creative_templates for select to authenticated using (public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_creative_templates from authenticated;

alter table public.marketing_creatives
  add column if not exists template_key text,
  add column if not exists provider_design_id text,
  add column if not exists tracking_link_id uuid references public.marketing_tracking_links(id) on delete set null;

create table if not exists public.marketing_direct_mail_recipients (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  property_key text not null, recipient_name text not null default 'Current Resident', address text not null,
  city text not null, state text not null default 'NJ', zip text not null,
  validation_status text not null default 'valid' check (validation_status in ('valid','invalid')),
  validation_detail jsonb not null default '{}'::jsonb, snapshot_at timestamptz not null default now(),
  unique(campaign_id,property_key)
);
alter table public.marketing_direct_mail_recipients enable row level security;
create policy marketing_dm_recipients_owner on public.marketing_direct_mail_recipients for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_direct_mail_recipients from authenticated;

create table if not exists public.marketing_launch_approvals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade, channel text not null,
  provider_key text not null, creative_id uuid not null references public.marketing_creatives(id) on delete restrict,
  quote_id uuid not null references public.marketing_price_quotes(id) on delete restrict,
  payment_id uuid not null references public.marketing_payments(id) on delete restrict,
  recipient_count integer not null check (recipient_count>0), approval_fingerprint text not null,
  status text not null default 'approved' check (status in ('approved','consumed','revoked')),
  approved_at timestamptz not null default now(), consumed_at timestamptz, revoked_at timestamptz,
  unique(campaign_id,channel,provider_key,approval_fingerprint)
);
alter table public.marketing_launch_approvals enable row level security;
create policy marketing_launch_approvals_owner on public.marketing_launch_approvals for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_launch_approvals from authenticated;

-- Ten curated templates are seeded in production: seller value, equity opportunity, tax review,
-- high-tax letter, new homeowner, lending review, investor opportunity, local market update,
-- professional introduction letter and second-touch follow-up.

-- Server-authoritative RPCs deployed by this migration:
-- marketing_save_brand_profile(text,jsonb,boolean)
-- marketing_save_creative(uuid,text,jsonb,text)
-- marketing_approve_creative(uuid)
-- marketing_prepare_direct_mail_recipients(uuid)
-- marketing_creative_studio_bootstrap(uuid)
-- marketing_approve_direct_mail_launch(uuid,uuid)
-- These RPCs enforce Agent+ entitlement, campaign ownership, immutable prepared recipients,
-- approved creative, exact quote/payment linkage and explicit launch approval.
