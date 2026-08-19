-- STAGING ONLY. Minimal mirrors of native Watchdog action tables for Intelligence integration testing.

create table if not exists public.professional_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text not null,
  case_type text not null default 'general',
  status text not null default 'open',
  title text not null,
  property_address text,
  municipality text,
  profession text,
  notes text,
  pinned_marker_ids jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.professional_case_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.professional_cases(id) on delete cascade,
  activity_type text not null,
  marker_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.saved_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text not null,
  address text not null,
  town text,
  block text,
  lot text,
  notes text,
  created_at timestamptz not null default now(),
  alert_frequency text,
  alerts_enabled boolean not null default true,
  last_alert_check timestamptz,
  kind text not null default 'watch',
  source_ref text,
  unique(user_id,pams_pin,kind)
);
create table if not exists public.professional_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid references public.professional_cases(id) on delete set null,
  pams_pin text,
  title text not null,
  profession text not null default 'general',
  preset text not null default 'custom',
  current_version integer not null default 1,
  brand_profile jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  selected_marker_ids jsonb not null default '[]'::jsonb,
  source_manifest jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.professional_cases enable row level security;
alter table public.professional_case_activity enable row level security;
alter table public.saved_properties enable row level security;
alter table public.professional_reports enable row level security;

create policy professional_cases_owner_all on public.professional_cases for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro'));
create policy professional_case_activity_owner_all on public.professional_case_activity for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro'));
create policy saved_properties_owner_all on public.saved_properties for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
create policy professional_reports_owner_all on public.professional_reports for all to authenticated
  using ((select auth.uid())=user_id and public.has_watchdog_plan('pro'))
  with check ((select auth.uid())=user_id and public.has_watchdog_plan('pro'));

create index if not exists professional_cases_user_idx on public.professional_cases(user_id,created_at desc);
create index if not exists professional_case_activity_case_idx on public.professional_case_activity(case_id,created_at desc);
create index if not exists saved_properties_user_kind_idx on public.saved_properties(user_id,kind,created_at desc);
create index if not exists professional_reports_user_idx on public.professional_reports(user_id,created_at desc);
