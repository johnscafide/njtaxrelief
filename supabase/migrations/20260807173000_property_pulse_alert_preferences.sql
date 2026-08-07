-- Property Pulse: user-owned delivery preferences and server-created event inbox.
create table if not exists public.property_alert_preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text not null, alert_score boolean not null default true, alert_tax boolean not null default true,
  alert_assessment boolean not null default true, alert_deadline boolean not null default true, paused boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, pams_pin)
);
create table if not exists public.property_update_events (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, pams_pin text,
  event_key text not null, event_type text not null check (event_type in ('score_change', 'assessment_change', 'tax_change', 'appeal_deadline', 'source_refresh', 'system')),
  severity text not null default 'info' check (severity in ('info', 'watch', 'action')), title text not null check (char_length(title) <= 180),
  summary text not null check (char_length(summary) <= 700), payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(), read_at timestamptz, unique (user_id, event_key)
);
create index if not exists property_alert_preferences_user_pin_idx on public.property_alert_preferences (user_id, pams_pin);
create index if not exists property_update_events_user_occurred_idx on public.property_update_events (user_id, occurred_at desc);
alter table public.property_alert_preferences enable row level security;
alter table public.property_update_events enable row level security;
revoke all on table public.property_alert_preferences from anon;
revoke all on table public.property_update_events from anon;
grant select, insert, update, delete on table public.property_alert_preferences to authenticated;
grant select, update (read_at) on table public.property_update_events to authenticated;
create policy "pulse preference select own" on public.property_alert_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "pulse preference insert own" on public.property_alert_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pulse preference update own" on public.property_alert_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "pulse preference delete own" on public.property_alert_preferences for delete to authenticated using ((select auth.uid()) = user_id);
create policy "pulse events select own" on public.property_update_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "pulse events update own" on public.property_update_events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
