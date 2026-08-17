-- Watchdog Intelligence Phase 6: population scale, scheduled scopes, Daily Intelligence and team boundaries.

create table if not exists public.watchdog_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchdog_organization_members (
  organization_id uuid not null references public.watchdog_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create or replace function public.watchdog_is_org_member(p_organization_id uuid, p_roles text[] default null)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.watchdog_organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=(select auth.uid())
      and (p_roles is null or m.role=any(p_roles))
  );
$$;
revoke all on function public.watchdog_is_org_member(uuid,text[]) from public;
grant execute on function public.watchdog_is_org_member(uuid,text[]) to authenticated;

create table if not exists public.intelligence_plan_limits (
  plan_tier text primary key,
  max_scope_properties integer not null,
  max_saved_scopes integer not null,
  max_scheduled_scopes integer not null,
  max_concurrent_jobs integer not null,
  max_jobs_per_day integer not null,
  max_findings_per_run integer not null,
  retention_days integer not null,
  llm_requests_per_day integer not null,
  updated_at timestamptz not null default now()
);
insert into public.intelligence_plan_limits(plan_tier,max_scope_properties,max_saved_scopes,max_scheduled_scopes,max_concurrent_jobs,max_jobs_per_day,max_findings_per_run,retention_days,llm_requests_per_day)
values
 ('standard',0,0,0,0,0,0,0,0),
 ('agent',0,0,0,0,0,0,0,0),
 ('pro',100,10,0,1,25,50,30,75),
 ('pro_plus',10000,100,20,3,100,250,180,300),
 ('teams',50000,500,100,10,500,500,365,1500),
 ('developer',100000,1000,500,25,5000,1000,730,10000)
on conflict(plan_tier) do update set
 max_scope_properties=excluded.max_scope_properties,max_saved_scopes=excluded.max_saved_scopes,max_scheduled_scopes=excluded.max_scheduled_scopes,
 max_concurrent_jobs=excluded.max_concurrent_jobs,max_jobs_per_day=excluded.max_jobs_per_day,max_findings_per_run=excluded.max_findings_per_run,
 retention_days=excluded.retention_days,llm_requests_per_day=excluded.llm_requests_per_day,updated_at=now();

create table if not exists public.intelligence_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid references public.watchdog_organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 140),
  scope_type text not null check (scope_type in ('farm','municipality','county','workbench_view','custom')),
  scope_value jsonb not null default '{}'::jsonb,
  model_keys text[] not null default array['assessment_anomaly']::text[],
  resolved_pams_pins text[] not null default '{}'::text[],
  scope_fingerprint text,
  is_scheduled boolean not null default false,
  cadence text check (cadence is null or cadence in ('daily','weekly')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_manifest jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.watchdog_organizations(id) on delete cascade,
  scope_id uuid references public.intelligence_scopes(id) on delete set null,
  model_key text not null,
  model_version integer not null,
  scope_type text not null,
  scope_value jsonb not null default '{}'::jsonb,
  scope_fingerprint text not null,
  pams_pins text[] not null default '{}'::text[],
  idempotency_key text not null,
  trigger_type text not null default 'manual' check (trigger_type in ('manual','scheduled','retry','incremental')),
  status text not null default 'queued' check (status in ('queued','running','partial','failed','complete','cache_hit','canceled')),
  cursor_index integer not null default 0 check (cursor_index>=0),
  batch_size integer not null default 200 check (batch_size between 25 and 1000),
  candidate_count integer not null default 0,
  processed_count integer not null default 0,
  finding_count integer not null default 0,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  worker_id text,
  result_run_id uuid references public.intelligence_runs(id) on delete set null,
  cache_key text,
  error_code text,
  error_message text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);

create table if not exists public.intelligence_job_events (
  id bigint generated by default as identity primary key,
  job_id uuid not null references public.intelligence_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_run_cache (
  cache_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.watchdog_organizations(id) on delete cascade,
  model_key text not null,
  model_version integer not null,
  scope_fingerprint text not null,
  facts_fingerprint text not null,
  run_id uuid not null references public.intelligence_runs(id) on delete cascade,
  candidate_count integer not null,
  finding_count integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz,
  hit_count integer not null default 0
);

create table if not exists public.intelligence_daily_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.watchdog_organizations(id) on delete cascade,
  scope_id uuid references public.intelligence_scopes(id) on delete set null,
  model_key text not null,
  prior_run_id uuid references public.intelligence_runs(id) on delete set null,
  current_run_id uuid references public.intelligence_runs(id) on delete set null,
  digest_date date not null default current_date,
  new_findings jsonb not null default '[]'::jsonb,
  strengthened_findings jsonb not null default '[]'::jsonb,
  weakened_findings jsonb not null default '[]'::jsonb,
  removed_findings jsonb not null default '[]'::jsonb,
  evidence_changes jsonb not null default '[]'::jsonb,
  recommended_queue jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,scope_id,model_key,current_run_id)
);

create index if not exists watchdog_org_members_user_idx on public.watchdog_organization_members(user_id,organization_id);
create index if not exists intelligence_scopes_user_active_idx on public.intelligence_scopes(user_id,is_active,updated_at desc);
create index if not exists intelligence_scopes_due_idx on public.intelligence_scopes(next_run_at) where is_active and is_scheduled;
create index if not exists intelligence_jobs_claim_idx on public.intelligence_jobs(status,available_at,created_at) where status in ('queued','partial');
create index if not exists intelligence_jobs_user_created_idx on public.intelligence_jobs(user_id,created_at desc);
create index if not exists intelligence_jobs_scope_created_idx on public.intelligence_jobs(scope_id,created_at desc) where scope_id is not null;
create index if not exists intelligence_job_events_job_idx on public.intelligence_job_events(job_id,created_at);
create index if not exists intelligence_job_events_user_idx on public.intelligence_job_events(user_id,created_at desc);
create index if not exists intelligence_run_cache_user_model_idx on public.intelligence_run_cache(user_id,model_key,model_version,scope_fingerprint);
create index if not exists intelligence_run_cache_expiry_idx on public.intelligence_run_cache(expires_at);
create index if not exists intelligence_daily_digests_user_date_idx on public.intelligence_daily_digests(user_id,digest_date desc);
create index if not exists intelligence_daily_digests_scope_date_idx on public.intelligence_daily_digests(scope_id,digest_date desc) where scope_id is not null;

alter table public.watchdog_organizations enable row level security;
alter table public.watchdog_organization_members enable row level security;
alter table public.intelligence_plan_limits enable row level security;
alter table public.intelligence_scopes enable row level security;
alter table public.intelligence_jobs enable row level security;
alter table public.intelligence_job_events enable row level security;
alter table public.intelligence_run_cache enable row level security;
alter table public.intelligence_daily_digests enable row level security;

grant select,insert,update,delete on public.watchdog_organizations to authenticated;
grant select,insert,update,delete on public.watchdog_organization_members to authenticated;
grant select on public.intelligence_plan_limits to authenticated;
grant select,insert,update,delete on public.intelligence_scopes to authenticated;
grant select on public.intelligence_jobs to authenticated;
grant select on public.intelligence_job_events to authenticated;
grant select on public.intelligence_run_cache to authenticated;
grant select on public.intelligence_daily_digests to authenticated;

create policy watchdog_org_owner_read on public.watchdog_organizations for select to authenticated using (owner_user_id=(select auth.uid()) or public.watchdog_is_org_member(id,null));
create policy watchdog_org_owner_insert on public.watchdog_organizations for insert to authenticated with check (owner_user_id=(select auth.uid()));
create policy watchdog_org_owner_update on public.watchdog_organizations for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy watchdog_org_owner_delete on public.watchdog_organizations for delete to authenticated using (owner_user_id=(select auth.uid()));
create policy watchdog_org_members_read on public.watchdog_organization_members for select to authenticated using (public.watchdog_is_org_member(organization_id,null) or exists(select 1 from public.watchdog_organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())));
create policy watchdog_org_members_insert on public.watchdog_organization_members for insert to authenticated with check (exists(select 1 from public.watchdog_organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())) or public.watchdog_is_org_member(organization_id,array['owner','admin']));
create policy watchdog_org_members_update on public.watchdog_organization_members for update to authenticated using (exists(select 1 from public.watchdog_organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())) or public.watchdog_is_org_member(organization_id,array['owner','admin'])) with check (exists(select 1 from public.watchdog_organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())) or public.watchdog_is_org_member(organization_id,array['owner','admin']));
create policy watchdog_org_members_delete on public.watchdog_organization_members for delete to authenticated using (exists(select 1 from public.watchdog_organizations o where o.id=organization_id and o.owner_user_id=(select auth.uid())) or public.watchdog_is_org_member(organization_id,array['owner','admin']));
create policy intelligence_plan_limits_read on public.intelligence_plan_limits for select to authenticated using (true);
create policy intelligence_scopes_read on public.intelligence_scopes for select to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,null)));
create policy intelligence_scopes_insert on public.intelligence_scopes for insert to authenticated with check (user_id=(select auth.uid()) and (organization_id is null or public.watchdog_is_org_member(organization_id,array['owner','admin','member'])));
create policy intelligence_scopes_update on public.intelligence_scopes for update to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,array['owner','admin']))) with check (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,array['owner','admin'])));
create policy intelligence_scopes_delete on public.intelligence_scopes for delete to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,array['owner','admin'])));
create policy intelligence_jobs_read on public.intelligence_jobs for select to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,null)));
create policy intelligence_job_events_read on public.intelligence_job_events for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.intelligence_jobs j where j.id=job_id and j.organization_id is not null and public.watchdog_is_org_member(j.organization_id,null)));
create policy intelligence_run_cache_read on public.intelligence_run_cache for select to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,null)));
create policy intelligence_daily_digests_read on public.intelligence_daily_digests for select to authenticated using (user_id=(select auth.uid()) or (organization_id is not null and public.watchdog_is_org_member(organization_id,null)));
