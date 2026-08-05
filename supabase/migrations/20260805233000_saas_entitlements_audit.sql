-- Production SaaS foundation: server-owned plan state and access audit trail.
-- This migration is additive. The current UI can keep reading profiles.plan_tier
-- until billing/webhook integration is ready to switch over.

create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text not null default 'standard' check (plan_tier in ('standard','pro','pro_plus')),
  profession text,
  subscription_status text not null default 'none' check (subscription_status in ('none','trialing','active','past_due','paused','canceled')),
  provider text check (provider is null or provider in ('stripe','manual','developer')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from anon, authenticated;
grant all on public.account_entitlements to service_role;

insert into public.account_entitlements (user_id, plan_tier, subscription_status, provider, source)
select p.id,
       case when p.plan_tier in ('standard','pro','pro_plus') then p.plan_tier else 'standard' end,
       case when p.plan_tier in ('pro','pro_plus') or p.account_role = 'developer' then 'active' else 'none' end,
       case when p.account_role = 'developer' then 'developer' else 'manual' end,
       'profiles-migration'
from public.profiles p
on conflict (user_id) do nothing;

create table if not exists public.access_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  resource_type text,
  resource_id text,
  required_plan text check (required_plan is null or required_plan in ('standard','pro','pro_plus')),
  effective_plan text check (effective_plan is null or effective_plan in ('standard','pro','pro_plus','developer')),
  allowed boolean,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_audit_log_user_created_idx on public.access_audit_log (user_id, created_at desc);
create index if not exists access_audit_log_event_created_idx on public.access_audit_log (event_type, created_at desc);
alter table public.access_audit_log enable row level security;
revoke all on public.access_audit_log from anon, authenticated;
grant all on public.access_audit_log to service_role;

create or replace function public.get_my_entitlement()
returns table (
  plan_tier text,
  profession text,
  subscription_status text,
  current_period_end timestamptz,
  account_role text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    case when p.account_role = 'developer' then 'pro_plus' else coalesce(e.plan_tier, p.plan_tier, 'standard') end,
    e.profession,
    case when p.account_role = 'developer' then 'active' else coalesce(e.subscription_status, 'none') end,
    e.current_period_end,
    coalesce(p.account_role, 'user')
  from public.profiles p
  left join public.account_entitlements e on e.user_id = p.id
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_entitlement() from public;
grant execute on function public.get_my_entitlement() to authenticated;

comment on table public.account_entitlements is 'Server-owned customer entitlement state. Billing webhooks/service-role jobs update this table; browsers do not.';
comment on table public.access_audit_log is 'Service-written authorization and sensitive-action audit events for security, billing support and professional workflow traceability.';
comment on function public.get_my_entitlement() is 'Returns the authenticated user plan/profession/status without exposing billing provider identifiers.';
