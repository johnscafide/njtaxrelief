create index if not exists intelligence_daily_digests_current_run_idx on public.intelligence_daily_digests(current_run_id);
create index if not exists intelligence_daily_digests_prior_run_idx on public.intelligence_daily_digests(prior_run_id);
create index if not exists intelligence_jobs_result_run_idx on public.intelligence_jobs(result_run_id);
create index if not exists intelligence_run_cache_run_idx on public.intelligence_run_cache(run_id);

drop policy if exists intelligence_findings_org_read on public.intelligence_findings;
drop policy if exists intelligence_findings_owner_read on public.intelligence_findings;
create policy intelligence_findings_read on public.intelligence_findings
for select to authenticated
using (
  (select auth.uid()) = user_id
  or (organization_id is not null and public.watchdog_is_org_member(organization_id, null::text[]))
);

drop policy if exists intelligence_runs_org_read on public.intelligence_runs;
drop policy if exists intelligence_runs_owner_read on public.intelligence_runs;
create policy intelligence_runs_read on public.intelligence_runs
for select to authenticated
using (
  (select auth.uid()) = user_id
  or (organization_id is not null and public.watchdog_is_org_member(organization_id, null::text[]))
);
