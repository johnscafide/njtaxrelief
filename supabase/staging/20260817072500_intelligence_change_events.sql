-- STAGING ONLY. Minimal user-owned change-event mirror for Property Change Intelligence tests.

create table if not exists public.property_update_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text not null,
  event_key text not null,
  event_type text not null,
  severity text not null default 'info',
  title text not null,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  read_at timestamptz,
  marker_id text,
  old_value text,
  new_value text,
  delta_numeric numeric,
  source_url text,
  minimum_plan text not null default 'agent',
  unique(user_id,pams_pin,event_key)
);
alter table public.property_update_events enable row level security;
create policy property_update_events_owner_read on public.property_update_events for select to authenticated using ((select auth.uid())=user_id);
create policy property_update_events_owner_write on public.property_update_events for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create index if not exists property_update_events_user_pin_time_idx on public.property_update_events(user_id,pams_pin,occurred_at desc);
create index if not exists property_update_events_user_time_idx on public.property_update_events(user_id,occurred_at desc);
