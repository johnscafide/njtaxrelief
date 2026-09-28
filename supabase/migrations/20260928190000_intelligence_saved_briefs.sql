-- Instant Watchdog Intelligence brief: the latest brief per user is stored so
-- the Intelligence workspace can show it immediately and refresh it in the
-- background. Written only by intelligence-analyst (service role) when the
-- workspace asks it to save; each user can read only their own row.
create table if not exists public.intelligence_saved_briefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  property_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.intelligence_saved_briefs enable row level security;

drop policy if exists intelligence_saved_briefs_owner_read on public.intelligence_saved_briefs;
create policy intelligence_saved_briefs_owner_read
  on public.intelligence_saved_briefs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.intelligence_saved_briefs from anon;
revoke insert, update, delete on public.intelligence_saved_briefs from authenticated;
grant select on public.intelligence_saved_briefs to authenticated;
