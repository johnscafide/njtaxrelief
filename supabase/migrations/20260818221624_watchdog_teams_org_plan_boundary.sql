-- NJW-43: Teams is a real server-side entitlement tier.
-- Organization/workspace CRUD is a Teams-only capability. This migration is
-- production-eligible, but remains unpromoted until the Intelligence Gate 5 runbook.

-- Organizations -------------------------------------------------------------

drop policy if exists "watchdog_org_owner_insert" on public.watchdog_organizations;
create policy "watchdog_org_owner_insert" on public.watchdog_organizations
for insert to authenticated
with check (
  public.has_watchdog_plan('teams')
  and owner_user_id = (select auth.uid())
);

drop policy if exists "watchdog_org_owner_read" on public.watchdog_organizations;
create policy "watchdog_org_owner_read" on public.watchdog_organizations
for select to authenticated
using (
  public.has_watchdog_plan('teams')
  and (
    owner_user_id = (select auth.uid())
    or public.watchdog_is_org_member(id, null::text[])
  )
);

drop policy if exists "watchdog_org_owner_update" on public.watchdog_organizations;
create policy "watchdog_org_owner_update" on public.watchdog_organizations
for update to authenticated
using (
  public.has_watchdog_plan('teams')
  and owner_user_id = (select auth.uid())
)
with check (
  public.has_watchdog_plan('teams')
  and owner_user_id = (select auth.uid())
);

drop policy if exists "watchdog_org_owner_delete" on public.watchdog_organizations;
create policy "watchdog_org_owner_delete" on public.watchdog_organizations
for delete to authenticated
using (
  public.has_watchdog_plan('teams')
  and owner_user_id = (select auth.uid())
);

-- Organization members -----------------------------------------------------

drop policy if exists "watchdog_org_members_read" on public.watchdog_organization_members;
create policy "watchdog_org_members_read" on public.watchdog_organization_members
for select to authenticated
using (
  public.has_watchdog_plan('teams')
  and (
    public.watchdog_is_org_member(organization_id, null::text[])
    or exists (
      select 1
      from public.watchdog_organizations o
      where o.id = organization_id
        and o.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "watchdog_org_members_insert" on public.watchdog_organization_members;
create policy "watchdog_org_members_insert" on public.watchdog_organization_members
for insert to authenticated
with check (
  public.has_watchdog_plan('teams')
  and (
    exists (
      select 1
      from public.watchdog_organizations o
      where o.id = organization_id
        and o.owner_user_id = (select auth.uid())
    )
    or public.watchdog_is_org_member(organization_id, array['owner','admin']::text[])
  )
);

drop policy if exists "watchdog_org_members_update" on public.watchdog_organization_members;
create policy "watchdog_org_members_update" on public.watchdog_organization_members
for update to authenticated
using (
  public.has_watchdog_plan('teams')
  and (
    exists (
      select 1
      from public.watchdog_organizations o
      where o.id = organization_id
        and o.owner_user_id = (select auth.uid())
    )
    or public.watchdog_is_org_member(organization_id, array['owner','admin']::text[])
  )
)
with check (
  public.has_watchdog_plan('teams')
  and (
    exists (
      select 1
      from public.watchdog_organizations o
      where o.id = organization_id
        and o.owner_user_id = (select auth.uid())
    )
    or public.watchdog_is_org_member(organization_id, array['owner','admin']::text[])
  )
);

drop policy if exists "watchdog_org_members_delete" on public.watchdog_organization_members;
create policy "watchdog_org_members_delete" on public.watchdog_organization_members
for delete to authenticated
using (
  public.has_watchdog_plan('teams')
  and (
    exists (
      select 1
      from public.watchdog_organizations o
      where o.id = organization_id
        and o.owner_user_id = (select auth.uid())
    )
    or public.watchdog_is_org_member(organization_id, array['owner','admin']::text[])
  )
);
