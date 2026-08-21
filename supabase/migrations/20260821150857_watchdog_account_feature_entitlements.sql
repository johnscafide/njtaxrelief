create table if not exists public.account_feature_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z0-9_]+$'),
  status text not null default 'inactive' check (status in ('inactive','trialing','active','past_due','canceled','expired')),
  provider text,
  provider_price_id text,
  provider_subscription_item_id text,
  current_period_end timestamptz,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

alter table public.account_feature_entitlements enable row level security;

revoke all on table public.account_feature_entitlements from anon;
revoke insert, update, delete on table public.account_feature_entitlements from authenticated;
grant select on table public.account_feature_entitlements to authenticated;
grant select, insert, update, delete on table public.account_feature_entitlements to service_role;

drop policy if exists account_feature_entitlements_owner_read on public.account_feature_entitlements;
create policy account_feature_entitlements_owner_read
  on public.account_feature_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists account_feature_entitlements_feature_status_idx
  on public.account_feature_entitlements (feature_key, status, user_id);

create unique index if not exists account_feature_entitlements_provider_item_uidx
  on public.account_feature_entitlements (provider, provider_subscription_item_id)
  where provider_subscription_item_id is not null;
