create index if not exists watchdog_organizations_owner_idx
  on public.watchdog_organizations(owner_user_id);

create index if not exists intelligence_scopes_org_idx
  on public.intelligence_scopes(organization_id)
  where organization_id is not null;

create index if not exists intelligence_jobs_org_idx
  on public.intelligence_jobs(organization_id)
  where organization_id is not null;

create index if not exists intelligence_run_cache_org_idx
  on public.intelligence_run_cache(organization_id)
  where organization_id is not null;

create index if not exists intelligence_daily_digests_org_idx
  on public.intelligence_daily_digests(organization_id)
  where organization_id is not null;
