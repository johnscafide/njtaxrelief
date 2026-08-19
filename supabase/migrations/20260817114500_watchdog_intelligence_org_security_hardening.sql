-- Phase 6 security hardening.
-- Keep recursive organization-membership checks privileged, but move the privileged implementation out of the exposed public API.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.watchdog_is_org_member(p_organization_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists(
    select 1
    from public.watchdog_organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any(p_roles))
  );
$$;
revoke all on function private.watchdog_is_org_member(uuid,text[]) from public, anon;
grant execute on function private.watchdog_is_org_member(uuid,text[]) to authenticated, service_role;

create or replace function public.watchdog_is_org_member(p_organization_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security invoker
set search_path = private, public, pg_catalog
as $$
  select private.watchdog_is_org_member(p_organization_id,p_roles);
$$;
revoke all on function public.watchdog_is_org_member(uuid,text[]) from public, anon;
grant execute on function public.watchdog_is_org_member(uuid,text[]) to authenticated, service_role;

create or replace function public.watchdog_intelligence_set_run_org()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
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
revoke all on function public.watchdog_intelligence_set_run_org() from public, anon, authenticated;
grant execute on function public.watchdog_intelligence_set_run_org() to service_role;

create or replace function public.watchdog_intelligence_set_finding_org()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.intelligence_runs
    where id=new.run_id;
  end if;
  return new;
end;
$$;
revoke all on function public.watchdog_intelligence_set_finding_org() from public, anon, authenticated;
grant execute on function public.watchdog_intelligence_set_finding_org() to service_role;
