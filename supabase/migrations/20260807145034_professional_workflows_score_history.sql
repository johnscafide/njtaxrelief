-- Watchdog v0.24: genuine longitudinal score observations + private appeal case workspace.
create table if not exists public.score_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text not null,
  marker_id text not null,
  score numeric not null check (score >= 0 and score <= 100),
  observed_on date not null default current_date,
  observed_at timestamptz not null default now(),
  unique (user_id, pams_pin, marker_id, observed_on)
);
alter table public.score_observations enable row level security;
revoke all on public.score_observations from anon;
grant select, insert, update on public.score_observations to authenticated;
create policy "score observations select own" on public.score_observations for select to authenticated using ((select auth.uid()) = user_id);
create policy "score observations insert own" on public.score_observations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "score observations update own" on public.score_observations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists score_observations_lookup_idx on public.score_observations(user_id,pams_pin,marker_id,observed_at);

create table if not exists public.appeal_case_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text not null,
  property_address text,
  municipality text,
  status text not null default 'screening' check (status in ('screening','evidence','ready','filed','closed')),
  filing_deadline date,
  notes text not null default '',
  opportunity_score numeric,
  evidence_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,pams_pin)
);
alter table public.appeal_case_workspaces enable row level security;
revoke all on public.appeal_case_workspaces from anon;
grant select,insert,update,delete on public.appeal_case_workspaces to authenticated;
create policy "appeal workspace developer select" on public.appeal_case_workspaces for select to authenticated using ((select auth.uid())=user_id and public.is_watchdog_developer());
create policy "appeal workspace developer insert" on public.appeal_case_workspaces for insert to authenticated with check ((select auth.uid())=user_id and public.is_watchdog_developer());
create policy "appeal workspace developer update" on public.appeal_case_workspaces for update to authenticated using ((select auth.uid())=user_id and public.is_watchdog_developer()) with check ((select auth.uid())=user_id and public.is_watchdog_developer());
create policy "appeal workspace developer delete" on public.appeal_case_workspaces for delete to authenticated using ((select auth.uid())=user_id and public.is_watchdog_developer());
create index if not exists appeal_workspace_user_updated_idx on public.appeal_case_workspaces(user_id,updated_at desc);

comment on table public.score_observations is 'Genuine per-account score observations. One daily point per parcel/marker; never synthetic history.';
comment on table public.appeal_case_workspaces is 'Developer-preview private appeal case status/deadline/notes protected by ownership and server developer role.';
