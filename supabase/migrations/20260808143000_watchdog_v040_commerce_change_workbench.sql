-- Watchdog v0.40: provider-neutral commerce, trusted change history and Pro Workbench.
-- Safe to apply after the existing SaaS entitlement + Property Pulse migrations.

alter table public.account_entitlements
  add column if not exists provider_event_at timestamptz;

alter table public.account_entitlements
  drop constraint if exists account_entitlements_provider_check;
alter table public.account_entitlements
  add constraint account_entitlements_provider_check
  check (provider is null or provider in ('paddle','stripe','manual','developer'));

-- Provider-neutral webhook ledger. The older Stripe ledger remains intact so
-- an already-deployed Stripe endpoint is not destructively changed.
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
revoke all on table public.billing_provider_events from anon, authenticated;
grant all on table public.billing_provider_events to service_role;

-- Profession is a customer preference, separate from the billing entitlement.
-- It can personalize defaults without ever granting a paid capability.
create table if not exists public.professional_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profession text not null default 'homeowner' check (profession in ('homeowner','real_estate','attorney','mortgage_lending','investor','appraiser','contractor','property_tax_professional','title_closing','other')),
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.professional_preferences enable row level security;
revoke all on table public.professional_preferences from anon;
grant select, insert, update on table public.professional_preferences to authenticated;
drop policy if exists "professional preferences select own" on public.professional_preferences;
create policy "professional preferences select own" on public.professional_preferences for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "professional preferences insert own" on public.professional_preferences;
create policy "professional preferences insert own" on public.professional_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "professional preferences update own" on public.professional_preferences;
create policy "professional preferences update own" on public.professional_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.get_my_entitlement()
returns table (plan_tier text, profession text, subscription_status text, current_period_end timestamptz, account_role text)
language sql security definer set search_path = public stable
as $$
  select
    case when p.account_role = 'developer' then 'pro_plus' when e.subscription_status in ('active','trialing','past_due') then coalesce(e.plan_tier,'standard') else 'standard' end,
    coalesce(pref.profession,e.profession,'homeowner'),
    case when p.account_role = 'developer' then 'active' else coalesce(e.subscription_status,'none') end,
    e.current_period_end,
    coalesce(p.account_role,'user')
  from public.profiles p
  left join public.account_entitlements e on e.user_id = p.id
  left join public.professional_preferences pref on pref.user_id = p.id
  where p.id = auth.uid();
$$;
revoke all on function public.get_my_entitlement() from public;
grant execute on function public.get_my_entitlement() to authenticated;

create or replace function public.has_watchdog_plan(required_plan text)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles p
    left join public.account_entitlements e on e.user_id = p.id
    where p.id = auth.uid() and (
      p.account_role = 'developer' or (
        e.subscription_status in ('active','trialing','past_due') and
        case coalesce(e.plan_tier,'standard') when 'pro_plus' then 2 when 'pro' then 1 else 0 end >=
        case required_plan when 'pro_plus' then 2 when 'pro' then 1 else 0 end
      )
    )
  );
$$;
revoke all on function public.has_watchdog_plan(text) from public;
grant execute on function public.has_watchdog_plan(text) to authenticated;

-- Historical scores are professional evidence. Customers may read their own
-- observations, but only trusted server/data jobs may create or rewrite them.
drop policy if exists "score observations insert own" on public.score_observations;
drop policy if exists "score observations update own" on public.score_observations;
revoke insert, update, delete on table public.score_observations from authenticated;
grant select on table public.score_observations to authenticated;

-- Property Pulse becomes the durable Change Intelligence event stream.
alter table public.property_update_events
  add column if not exists marker_id text,
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists delta_numeric numeric,
  add column if not exists source_url text,
  add column if not exists minimum_plan text not null default 'standard';

alter table public.property_update_events
  drop constraint if exists property_update_events_event_type_check;
alter table public.property_update_events
  add constraint property_update_events_event_type_check
  check (event_type in (
    'score_change','assessment_change','tax_change','appeal_deadline','source_refresh','system',
    'permit_change','deed_change','environment_change','evidence_change','market_change','municipal_change'
  ));
alter table public.property_update_events
  drop constraint if exists property_update_events_minimum_plan_check;
alter table public.property_update_events
  add constraint property_update_events_minimum_plan_check
  check (minimum_plan in ('standard','pro','pro_plus'));
create index if not exists property_update_events_pin_occurred_idx
  on public.property_update_events (user_id, pams_pin, occurred_at desc);
create index if not exists property_update_events_marker_occurred_idx
  on public.property_update_events (user_id, marker_id, occurred_at desc);

drop policy if exists "pulse events select own" on public.property_update_events;
create policy "pulse events select own" on public.property_update_events for select to authenticated
  using ((select auth.uid()) = user_id and (
    minimum_plan = 'standard'
    or (minimum_plan = 'pro' and public.has_watchdog_plan('pro'))
    or (minimum_plan = 'pro_plus' and public.has_watchdog_plan('pro_plus'))
  ));

-- A professional case is a private working file around one property. It is
-- intentionally plan-gated by RLS rather than hidden only in the interface.
create table if not exists public.professional_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text,
  case_type text not null default 'general'
    check (case_type in ('general','appeal','purchase','listing','lending','investment','title','construction')),
  status text not null default 'research'
    check (status in ('research','review','ready','active','closed','archived')),
  title text not null check (char_length(title) between 1 and 180),
  property_address text,
  municipality text,
  profession text,
  notes text not null default '',
  pinned_marker_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(pinned_marker_ids) = 'array'),
  evidence_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.professional_cases enable row level security;
revoke all on table public.professional_cases from anon;
grant select, insert, update, delete on table public.professional_cases to authenticated;
create index if not exists professional_cases_user_updated_idx on public.professional_cases (user_id, updated_at desc);
create index if not exists professional_cases_user_pin_idx on public.professional_cases (user_id, pams_pin);

drop policy if exists "professional cases select own pro" on public.professional_cases;
create policy "professional cases select own pro" on public.professional_cases for select to authenticated
  using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro'));
drop policy if exists "professional cases insert own pro" on public.professional_cases;
create policy "professional cases insert own pro" on public.professional_cases for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_watchdog_plan('pro'));
drop policy if exists "professional cases update own pro" on public.professional_cases;
create policy "professional cases update own pro" on public.professional_cases for update to authenticated
  using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid()) = user_id and public.has_watchdog_plan('pro'));
drop policy if exists "professional cases delete own pro" on public.professional_cases;
create policy "professional cases delete own pro" on public.professional_cases for delete to authenticated
  using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro'));

create table if not exists public.professional_case_activity (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.professional_cases(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created','note','status','marker_pin','evidence','export')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.professional_case_activity enable row level security;
revoke all on table public.professional_case_activity from anon;
grant select, insert, delete on table public.professional_case_activity to authenticated;
create index if not exists professional_case_activity_case_created_idx on public.professional_case_activity (case_id, created_at desc);

drop policy if exists "professional case activity select own pro" on public.professional_case_activity;
create policy "professional case activity select own pro" on public.professional_case_activity for select to authenticated
  using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro') and exists (
    select 1 from public.professional_cases c where c.id = case_id and c.user_id = (select auth.uid())
  ));
drop policy if exists "professional case activity insert own pro" on public.professional_case_activity;
create policy "professional case activity insert own pro" on public.professional_case_activity for insert to authenticated
  with check ((select auth.uid()) = user_id and public.has_watchdog_plan('pro') and exists (
    select 1 from public.professional_cases c where c.id = case_id and c.user_id = (select auth.uid())
  ));
drop policy if exists "professional case activity delete own pro" on public.professional_case_activity;
create policy "professional case activity delete own pro" on public.professional_case_activity for delete to authenticated
  using ((select auth.uid()) = user_id and public.has_watchdog_plan('pro') and exists (
    select 1 from public.professional_cases c where c.id = case_id and c.user_id = (select auth.uid())
  ));

comment on table public.billing_provider_events is 'Service-only provider-neutral billing webhook idempotency and ordering ledger.';
comment on table public.professional_preferences is 'Customer-owned profession personalization. It never grants or changes paid authorization.';
comment on table public.professional_cases is 'Pro/Pro+ customer-owned property case files protected by server plan RLS.';
comment on table public.professional_case_activity is 'Private audit/activity stream for an owned professional case.';
comment on table public.property_update_events is 'Customer-visible server-created Change Intelligence events with source/delta metadata.';
comment on table public.score_observations is 'Trusted server-created longitudinal score observations. Authenticated customers have read-only history.';
