create table if not exists public.dashboard_layout_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  layout jsonb not null default '{"metrics":[],"analytics":[],"sizes":{},"hidden":[],"motion":true}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_layout_preferences_layout_object check (jsonb_typeof(layout) = 'object'),
  constraint dashboard_layout_preferences_layout_size check (pg_column_size(layout) <= 32768)
);

alter table public.dashboard_layout_preferences enable row level security;

create policy "dashboard layout select own"
on public.dashboard_layout_preferences
for select
to authenticated
using (auth.uid() = user_id);

create policy "dashboard layout insert own"
on public.dashboard_layout_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "dashboard layout update own"
on public.dashboard_layout_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.dashboard_layout_preferences to authenticated;
