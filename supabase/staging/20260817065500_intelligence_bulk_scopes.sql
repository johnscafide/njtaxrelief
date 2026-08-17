-- STAGING ONLY. Minimal mirrors used to test server-resolved Intelligence scopes.

create table if not exists public.agent_farm_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pams_pin text,
  contact_ref text,
  address text not null,
  municipality text,
  county text,
  relationship text not null default 'farm',
  source text not null default 'manual',
  match_status text not null default 'pending',
  zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.data_workbench_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid,
  name text not null,
  source_type text not null default 'saved',
  source_id uuid,
  marker_ids jsonb not null default '[]'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  sort_config jsonb not null default '{}'::jsonb,
  page_size integer not null default 50,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_farm_properties enable row level security;
alter table public.data_workbench_views enable row level security;
create policy agent_farm_properties_owner_all on public.agent_farm_properties for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy data_workbench_views_owner_all on public.data_workbench_views for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create index if not exists agent_farm_properties_user_pin_idx on public.agent_farm_properties(user_id,pams_pin);
create index if not exists data_workbench_views_user_idx on public.data_workbench_views(user_id,updated_at desc);
