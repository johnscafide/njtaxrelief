-- Watchdog Intelligence Today Inbox
-- Append-only owner-scoped triage events for Daily Intelligence queue items.

create table if not exists public.intelligence_today_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_id uuid references public.intelligence_daily_digests(id) on delete set null,
  pams_pin text not null,
  model_key text not null,
  action text not null,
  snooze_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint intelligence_today_events_pin_check check (length(btrim(pams_pin)) between 1 and 160),
  constraint intelligence_today_events_model_check check (length(btrim(model_key)) between 1 and 120),
  constraint intelligence_today_events_action_check check (action in ('reviewed','snoozed','dismissed','reopened')),
  constraint intelligence_today_events_snooze_check check (action = 'snoozed' or snooze_until is null)
);

alter table public.intelligence_today_events enable row level security;

revoke all on table public.intelligence_today_events from anon;
revoke update, delete on table public.intelligence_today_events from authenticated;
grant select, insert on table public.intelligence_today_events to authenticated;
grant all on table public.intelligence_today_events to service_role;

create policy intelligence_today_events_owner_select
  on public.intelligence_today_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy intelligence_today_events_owner_insert
  on public.intelligence_today_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create index if not exists intelligence_today_events_user_created_idx
  on public.intelligence_today_events (user_id, created_at desc);

create index if not exists intelligence_today_events_item_idx
  on public.intelligence_today_events (user_id, digest_id, model_key, pams_pin, created_at desc);

comment on table public.intelligence_today_events is
  'Append-only user triage trail for Watchdog Daily Intelligence Today inbox. Events record review/snooze/dismiss/reopen actions without mutating governed digest facts.';
comment on column public.intelligence_today_events.metadata is
  'Non-authoritative UI/action context only. Never treat client-supplied metadata as property truth or model evidence.';
