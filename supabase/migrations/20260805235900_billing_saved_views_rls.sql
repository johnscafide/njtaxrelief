-- Watchdog SaaS production layer: billing metadata, saved Data Center views,
-- webhook idempotency, and explicit customer-owned row security.

alter table public.account_entitlements
  add column if not exists provider_price_id text,
  add column if not exists cancel_at_period_end boolean not null default false;

-- A browser may edit ordinary profile preferences, but it must never be able
-- to promote its own role or paid plan by updating profile columns directly.
create or replace function public.protect_profile_entitlement_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated','anon') and (
    new.account_role is distinct from old.account_role or
    new.plan_tier is distinct from old.plan_tier
  ) then
    raise exception 'account_role and plan_tier are server-managed';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_entitlement_fields on public.profiles;
create trigger protect_profile_entitlement_fields
before update on public.profiles
for each row execute function public.protect_profile_entitlement_fields();

alter table public.profiles enable row level security;
drop policy if exists "watchdog profile select own" on public.profiles;
create policy "watchdog profile select own" on public.profiles
as permissive for select to authenticated
using ((select auth.uid()) = id);
drop policy if exists "watchdog profile update own" on public.profiles;
create policy "watchdog profile update own" on public.profiles
as permissive for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
drop policy if exists "watchdog profile owner boundary" on public.profiles;
create policy "watchdog profile owner boundary" on public.profiles
as restrictive for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.has_watchdog_plan(required_plan text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.account_entitlements e on e.user_id = p.id
    where p.id = auth.uid()
      and (
        p.account_role = 'developer'
        or (
          e.subscription_status in ('active','trialing')
          and case coalesce(e.plan_tier,'standard') when 'pro_plus' then 2 when 'pro' then 1 else 0 end
              >= case required_plan when 'pro_plus' then 2 when 'pro' then 1 else 0 end
        )
      )
  );
$$;
revoke all on function public.has_watchdog_plan(text) from public;
grant execute on function public.has_watchdog_plan(text) to authenticated;

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
    case
      when p.account_role = 'developer' then 'pro_plus'
      when e.subscription_status in ('active','trialing') then coalesce(e.plan_tier,'standard')
      else 'standard'
    end,
    e.profession,
    case when p.account_role = 'developer' then 'active' else coalesce(e.subscription_status,'none') end,
    e.current_period_end,
    coalesce(p.account_role,'user')
  from public.profiles p
  left join public.account_entitlements e on e.user_id = p.id
  where p.id = auth.uid();
$$;
revoke all on function public.get_my_entitlement() from public;
grant execute on function public.get_my_entitlement() to authenticated;

create table if not exists public.saved_data_center_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  scope text not null default 'property' check (scope in ('property','municipality','county','portfolio')),
  marker_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(marker_ids) = 'array'),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  sort_config jsonb not null default '{}'::jsonb check (jsonb_typeof(sort_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_data_center_views enable row level security;
grant select, insert, update, delete on public.saved_data_center_views to authenticated;

drop policy if exists "saved views select own" on public.saved_data_center_views;
create policy "saved views select own" on public.saved_data_center_views
  for select to authenticated using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro_plus'));
drop policy if exists "saved views insert own" on public.saved_data_center_views;
create policy "saved views insert own" on public.saved_data_center_views
  for insert to authenticated with check ((select auth.uid()) = user_id and public.has_watchdog_plan('pro_plus'));
drop policy if exists "saved views update own" on public.saved_data_center_views;
create policy "saved views update own" on public.saved_data_center_views
  for update to authenticated using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro_plus')) with check ((select auth.uid()) = user_id and public.has_watchdog_plan('pro_plus'));
drop policy if exists "saved views delete own" on public.saved_data_center_views;
create policy "saved views delete own" on public.saved_data_center_views
  for delete to authenticated using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro_plus'));

create index if not exists saved_data_center_views_user_updated_idx
  on public.saved_data_center_views (user_id, updated_at desc);

create table if not exists public.billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload_version text,
  result jsonb not null default '{}'::jsonb
);
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from anon, authenticated;
grant all on public.billing_webhook_events to service_role;

create or replace function public.is_watchdog_developer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_role = 'developer'
  );
$$;
revoke all on function public.is_watchdog_developer() from public;
grant execute on function public.is_watchdog_developer() to authenticated;

comment on table public.saved_data_center_views is 'Customer-owned server-persisted Data Center field/filter configurations protected by RLS.';
comment on function public.has_watchdog_plan(text) is 'Server-side paid plan check. Developer bypass is explicit; client View As cannot change the result.';
comment on table public.billing_webhook_events is 'Service-only Stripe webhook idempotency ledger. Never writable by browser clients.';
comment on function public.is_watchdog_developer() is 'Server-evaluated developer role check for internal product/data operations pages.';
