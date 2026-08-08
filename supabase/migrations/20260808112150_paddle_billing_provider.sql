-- Provider-neutral billing foundation for the Paddle migration.
-- Applied to production as Supabase migration 20260808112150.

alter table public.account_entitlements
  drop constraint if exists account_entitlements_provider_check;

alter table public.account_entitlements
  add constraint account_entitlements_provider_check
  check (provider is null or provider in ('paddle','stripe','manual','developer'));

alter table public.account_entitlements
  add column if not exists provider_event_at timestamptz;

create table if not exists public.billing_provider_events (
  provider text not null check (provider in ('paddle','stripe')),
  provider_event_id text not null,
  event_type text not null,
  occurred_at timestamptz,
  processed_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb,
  primary key (provider, provider_event_id)
);

alter table public.billing_provider_events enable row level security;
revoke all on public.billing_provider_events from anon, authenticated;
grant all on public.billing_provider_events to service_role;

comment on column public.account_entitlements.provider_event_at is
  'Occurred-at timestamp of the most recent accepted billing-provider event; prevents stale webhook delivery from overwriting newer entitlement state.';
comment on table public.billing_provider_events is
  'Service-only provider-neutral webhook idempotency ledger. Browsers have no access.';
