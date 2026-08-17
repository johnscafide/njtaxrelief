alter table public.intelligence_runs
  add column if not exists organization_id uuid references public.watchdog_organizations(id) on delete set null;

alter table public.intelligence_findings
  add column if not exists organization_id uuid references public.watchdog_organizations(id) on delete set null;

create index if not exists intelligence_runs_org_created_idx
  on public.intelligence_runs(organization_id,created_at desc)
  where organization_id is not null;

create index if not exists intelligence_findings_org_created_idx
  on public.intelligence_findings(organization_id,created_at desc)
  where organization_id is not null;

create or replace function public.watchdog_intelligence_set_run_org()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is null and nullif(new.scope_value->>'scope_id','') is not null then
    select organization_id into new.organization_id
    from public.intelligence_scopes
    where id=(new.scope_value->>'scope_id')::uuid;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists watchdog_intelligence_set_run_org on public.intelligence_runs;
create trigger watchdog_intelligence_set_run_org
before insert or update of scope_value on public.intelligence_runs
for each row execute function public.watchdog_intelligence_set_run_org();

create or replace function public.watchdog_intelligence_set_finding_org()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.intelligence_runs
    where id=new.run_id;
  end if;
  return new;
end;
$$;

drop trigger if exists watchdog_intelligence_set_finding_org on public.intelligence_findings;
create trigger watchdog_intelligence_set_finding_org
before insert or update of run_id on public.intelligence_findings
for each row execute function public.watchdog_intelligence_set_finding_org();

create policy intelligence_runs_org_read on public.intelligence_runs
for select to authenticated
using (organization_id is not null and public.watchdog_is_org_member(organization_id,null));

create policy intelligence_findings_org_read on public.intelligence_findings
for select to authenticated
using (organization_id is not null and public.watchdog_is_org_member(organization_id,null));
