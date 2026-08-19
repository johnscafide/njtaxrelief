-- Phase 6 server-side quota enforcement. These guards apply even to service-written jobs/scopes.

create or replace function private.watchdog_effective_intelligence_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
    when exists(select 1 from public.profiles p where p.id=p_user_id and p.account_role='developer') then 'developer'
    else coalesce((select e.plan_tier from public.account_entitlements e where e.user_id=p_user_id limit 1),'standard')
  end;
$$;
revoke all on function private.watchdog_effective_intelligence_plan(uuid) from public, anon, authenticated;
grant execute on function private.watchdog_effective_intelligence_plan(uuid) to service_role;

create or replace function private.watchdog_intelligence_job_quota_guard()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_plan text;
  v_limits public.intelligence_plan_limits%rowtype;
  v_jobs_today integer;
  v_active integer;
begin
  if exists(select 1 from public.intelligence_jobs j where j.user_id=new.user_id and j.idempotency_key=new.idempotency_key) then return new; end if;
  v_plan := private.watchdog_effective_intelligence_plan(new.user_id);
  if v_plan not in ('pro_plus','teams','developer') then raise exception 'Pro+ plan required for population Intelligence jobs'; end if;
  if new.organization_id is not null and v_plan not in ('teams','developer') then raise exception 'Teams plan required for organization Intelligence jobs'; end if;
  select * into v_limits from public.intelligence_plan_limits where plan_tier=v_plan;
  if not found then raise exception 'Intelligence plan limits unavailable'; end if;
  if new.candidate_count <= 0 then raise exception 'Population Intelligence job must have at least one governed property'; end if;
  if new.candidate_count > v_limits.max_scope_properties then raise exception 'Resolved population exceeds the plan property limit'; end if;
  select count(*) into v_jobs_today from public.intelligence_jobs where user_id=new.user_id and created_at >= now()-interval '24 hours';
  if v_jobs_today >= v_limits.max_jobs_per_day then raise exception 'Daily Intelligence job quota reached for this plan'; end if;
  select count(*) into v_active from public.intelligence_jobs where user_id=new.user_id and status in ('queued','running','partial');
  if v_active >= v_limits.max_concurrent_jobs then raise exception 'Concurrent Intelligence job quota reached for this plan'; end if;
  return new;
end;
$$;
revoke all on function private.watchdog_intelligence_job_quota_guard() from public, anon, authenticated;

drop trigger if exists intelligence_job_quota_guard on public.intelligence_jobs;
create trigger intelligence_job_quota_guard before insert on public.intelligence_jobs for each row execute function private.watchdog_intelligence_job_quota_guard();

create or replace function private.watchdog_intelligence_scope_quota_guard()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_plan text;
  v_limits public.intelligence_plan_limits%rowtype;
  v_saved integer;
  v_scheduled integer;
begin
  if not coalesce(new.is_active,true) then return new; end if;
  v_plan := private.watchdog_effective_intelligence_plan(new.user_id);
  if new.organization_id is not null and v_plan not in ('teams','developer') then raise exception 'Teams plan required for shared Intelligence scopes'; end if;
  select * into v_limits from public.intelligence_plan_limits where plan_tier=v_plan;
  if not found then raise exception 'Intelligence plan limits unavailable'; end if;
  if cardinality(coalesce(new.resolved_pams_pins,'{}'::text[])) > v_limits.max_scope_properties then raise exception 'Saved Intelligence scope exceeds the plan property limit'; end if;
  if new.is_scheduled and v_limits.max_scheduled_scopes <= 0 then raise exception 'Scheduled Intelligence is not available on this plan'; end if;
  if new.is_scheduled and new.cadence not in ('daily','weekly') then raise exception 'Scheduled Intelligence supports daily or weekly cadence'; end if;
  select count(*) into v_saved from public.intelligence_scopes s where s.user_id=new.user_id and s.is_active and s.id<>new.id;
  if v_saved >= v_limits.max_saved_scopes then raise exception 'Saved Intelligence scope limit reached'; end if;
  if new.is_scheduled then
    select count(*) into v_scheduled from public.intelligence_scopes s where s.user_id=new.user_id and s.is_active and s.is_scheduled and s.id<>new.id;
    if v_scheduled >= v_limits.max_scheduled_scopes then raise exception 'Scheduled Intelligence scope limit reached'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.watchdog_intelligence_scope_quota_guard() from public, anon, authenticated;

drop trigger if exists intelligence_scope_quota_guard on public.intelligence_scopes;
create trigger intelligence_scope_quota_guard before insert or update on public.intelligence_scopes for each row execute function private.watchdog_intelligence_scope_quota_guard();

create or replace function private.watchdog_prune_intelligence_findings_to_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  r record;
  v_plan text;
  v_limit integer;
begin
  for r in select distinct run_id,user_id from new_findings loop
    v_plan := private.watchdog_effective_intelligence_plan(r.user_id);
    select max_findings_per_run into v_limit from public.intelligence_plan_limits where plan_tier=v_plan;
    if coalesce(v_limit,0) <= 0 then
      delete from public.intelligence_findings where run_id=r.run_id and user_id=r.user_id;
    else
      with ranked as (
        select id,row_number() over(order by score desc,confidence desc,evidence_coverage desc,created_at asc,id asc) rn
        from public.intelligence_findings where run_id=r.run_id and user_id=r.user_id
      )
      delete from public.intelligence_findings f using ranked x where f.id=x.id and x.rn>v_limit;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.watchdog_prune_intelligence_findings_to_plan_limit() from public, anon, authenticated;

drop trigger if exists intelligence_findings_plan_limit_guard on public.intelligence_findings;
create trigger intelligence_findings_plan_limit_guard after insert on public.intelligence_findings referencing new table as new_findings for each statement execute function private.watchdog_prune_intelligence_findings_to_plan_limit();
