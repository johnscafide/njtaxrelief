-- Watchdog v0.44: private Agent Opportunity Desk.
-- Imported sphere references contain no owner-name enrichment. All customer
-- records are protected by user ownership and a server-side Pro entitlement.

create table if not exists public.agent_farm_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text,
  contact_ref text,
  address text not null check (char_length(address) between 3 and 240),
  municipality text,
  county text,
  relationship text not null default 'farm'
    check (relationship in ('past_client','sphere','claimed_home','watchlist','farm')),
  source text not null default 'manual'
    check (source in ('manual','csv','saved_property')),
  match_status text not null default 'pending'
    check (match_status in ('pending','matched','needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_farm_properties enable row level security;
revoke all on table public.agent_farm_properties from anon;
grant select, insert, update, delete on table public.agent_farm_properties to authenticated;
create index if not exists agent_farm_user_updated_idx on public.agent_farm_properties (user_id, updated_at desc);
create index if not exists agent_farm_user_pin_idx on public.agent_farm_properties (user_id, pams_pin) where pams_pin is not null;
create unique index if not exists agent_farm_user_address_unique_idx on public.agent_farm_properties (user_id, address);

create policy "agent farm select own pro" on public.agent_farm_properties for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent farm insert own pro" on public.agent_farm_properties for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent farm update own pro" on public.agent_farm_properties for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent farm delete own pro" on public.agent_farm_properties for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));

create table if not exists public.agent_opportunity_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  opportunity_key text not null check (char_length(opportunity_key) between 3 and 240),
  pams_pin text,
  action_state text not null default 'open'
    check (action_state in ('open','watched','snoozed','dismissed','completed')),
  outcome text
    check (outcome is null or outcome in ('touch','reply','valuation_request','appointment','listing','not_relevant')),
  snoozed_until timestamptz,
  note text not null default '',
  first_opened_at timestamptz,
  touched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_key)
);
alter table public.agent_opportunity_actions enable row level security;
revoke all on table public.agent_opportunity_actions from anon;
grant select, insert, update, delete on table public.agent_opportunity_actions to authenticated;
create index if not exists agent_actions_user_updated_idx on public.agent_opportunity_actions (user_id, updated_at desc);
create index if not exists agent_actions_user_outcome_idx on public.agent_opportunity_actions (user_id, outcome, updated_at desc);

create policy "agent actions select own pro" on public.agent_opportunity_actions for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent actions insert own pro" on public.agent_opportunity_actions for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent actions update own pro" on public.agent_opportunity_actions for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent actions delete own pro" on public.agent_opportunity_actions for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));

create table if not exists public.agent_digest_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  weekday smallint not null default 1 check (weekday between 0 and 6),
  local_hour smallint not null default 8 check (local_hour between 0 and 23),
  timezone text not null default 'America/New_York',
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.agent_digest_preferences enable row level security;
revoke all on table public.agent_digest_preferences from anon;
grant select, insert, update on table public.agent_digest_preferences to authenticated;
create policy "agent digest select own pro" on public.agent_digest_preferences for select to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent digest insert own pro" on public.agent_digest_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));
create policy "agent digest update own pro" on public.agent_digest_preferences for update to authenticated
  using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')))
  with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')));

comment on table public.agent_farm_properties is 'Private agent-owned sphere/farm addresses and internal contact references; no owner-name enrichment.';
comment on table public.agent_opportunity_actions is 'Private action and conversion ledger for sourced property touch reasons.';
comment on table public.agent_digest_preferences is 'Private weekly Agent Opportunity Desk digest schedule.';
