-- NJW-343: Pro+ Transaction Command Center
-- Private transaction-coordination data. Missing provider evidence must never imply a clear result.

create table if not exists public.transaction_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  address text not null,
  city text,
  state text not null default 'NJ',
  postal_code text,
  municipality text,
  county text,
  block text,
  lot text,
  qualifier text,
  pams_pin text,
  property_key text,
  side text not null default 'seller' check (side in ('seller','buyer','dual','other')),
  status text not null default 'under_contract' check (status in ('intake','under_contract','attorney_review','inspection','mortgage','appraisal','title','municipal','clear_to_close','closed','canceled')),
  contract_date date,
  closing_date date,
  coordinator_name text,
  agent_name text,
  client_label text,
  readiness_status text not null default 'review' check (readiness_status in ('ready','review','attention','blocked')),
  watch_enabled boolean not null default true,
  last_watch_at timestamptz,
  participants jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists transaction_workspaces_user_idx on public.transaction_workspaces(user_id);
create index if not exists transaction_workspaces_user_status_idx on public.transaction_workspaces(user_id, status);
create index if not exists transaction_workspaces_closing_idx on public.transaction_workspaces(user_id, closing_date) where closing_date is not null;

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null default auth.uid(),
  category text not null,
  item_key text not null,
  title text not null,
  description text,
  severity text not null default 'review' check (severity in ('info','review','attention','blocked')),
  state text not null default 'open' check (state in ('open','requested','received','verified','resolved','waived','not_applicable')),
  evidence_state text not null default 'unknown' check (evidence_state in ('unknown','clear_observed','verify','issue_observed','provider_missing','not_applicable')),
  assigned_role text check (assigned_role is null or assigned_role in ('seller','buyer','agent','tc','attorney','title','lender','municipality','other')),
  assigned_name text,
  due_date date,
  source_type text,
  source_label text,
  source_checked_at timestamptz,
  source_url text,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, item_key),
  constraint transaction_items_workspace_fk foreign key (transaction_id, user_id)
    references public.transaction_workspaces(id, user_id) on delete cascade
);

create index if not exists transaction_items_tx_idx on public.transaction_items(transaction_id, sort_order);
create index if not exists transaction_items_user_state_idx on public.transaction_items(user_id, state);
create index if not exists transaction_items_due_idx on public.transaction_items(user_id, due_date) where due_date is not null;

create table if not exists public.transaction_disclosures (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null default auth.uid(),
  question_key text not null,
  question_label text not null,
  answer text not null default 'unknown' check (answer in ('yes','no','unknown','not_applicable')),
  notes text,
  evidence_state text not null default 'unknown' check (evidence_state in ('unknown','consistent','needs_follow_up','conflict','not_applicable')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, question_key),
  constraint transaction_disclosures_workspace_fk foreign key (transaction_id, user_id)
    references public.transaction_workspaces(id, user_id) on delete cascade
);

create index if not exists transaction_disclosures_tx_idx on public.transaction_disclosures(transaction_id);

create table if not exists public.transaction_activity (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null default auth.uid(),
  action text not null,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transaction_activity_workspace_fk foreign key (transaction_id, user_id)
    references public.transaction_workspaces(id, user_id) on delete cascade
);

create index if not exists transaction_activity_tx_idx on public.transaction_activity(transaction_id, created_at desc);

alter table public.transaction_workspaces enable row level security;
alter table public.transaction_items enable row level security;
alter table public.transaction_disclosures enable row level security;
alter table public.transaction_activity enable row level security;

-- Opt in only the browser role we need. The project's legacy defaults may otherwise grant broader table rights.
revoke all on public.transaction_workspaces from anon, authenticated;
revoke all on public.transaction_items from anon, authenticated;
revoke all on public.transaction_disclosures from anon, authenticated;
revoke all on public.transaction_activity from anon, authenticated;

grant select, insert, update, delete on public.transaction_workspaces to authenticated;
grant select, insert, update, delete on public.transaction_items to authenticated;
grant select, insert, update, delete on public.transaction_disclosures to authenticated;
grant select, insert on public.transaction_activity to authenticated;

drop policy if exists transaction_workspaces_select on public.transaction_workspaces;
create policy transaction_workspaces_select on public.transaction_workspaces for select to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_workspaces_insert on public.transaction_workspaces;
create policy transaction_workspaces_insert on public.transaction_workspaces for insert to authenticated
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_workspaces_update on public.transaction_workspaces;
create policy transaction_workspaces_update on public.transaction_workspaces for update to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')))
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_workspaces_delete on public.transaction_workspaces;
create policy transaction_workspaces_delete on public.transaction_workspaces for delete to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_items_select on public.transaction_items;
create policy transaction_items_select on public.transaction_items for select to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_items_insert on public.transaction_items;
create policy transaction_items_insert on public.transaction_items for insert to authenticated
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_items_update on public.transaction_items;
create policy transaction_items_update on public.transaction_items for update to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')))
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_items_delete on public.transaction_items;
create policy transaction_items_delete on public.transaction_items for delete to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_disclosures_select on public.transaction_disclosures;
create policy transaction_disclosures_select on public.transaction_disclosures for select to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_disclosures_insert on public.transaction_disclosures;
create policy transaction_disclosures_insert on public.transaction_disclosures for insert to authenticated
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_disclosures_update on public.transaction_disclosures;
create policy transaction_disclosures_update on public.transaction_disclosures for update to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')))
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_disclosures_delete on public.transaction_disclosures;
create policy transaction_disclosures_delete on public.transaction_disclosures for delete to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_activity_select on public.transaction_activity;
create policy transaction_activity_select on public.transaction_activity for select to authenticated
using ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));

drop policy if exists transaction_activity_insert on public.transaction_activity;
create policy transaction_activity_insert on public.transaction_activity for insert to authenticated
with check ((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro_plus')));
