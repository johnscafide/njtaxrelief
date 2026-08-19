-- NJW-43: Data Workbench begins at the Agent tier.
-- Keep user ownership enforcement and add the missing server-side plan boundary.

drop policy if exists "data_workbench_views_owner_all" on public.data_workbench_views;
create policy "data_workbench_views_owner_all" on public.data_workbench_views
for all to authenticated
using (
  (select auth.uid()) = user_id
  and public.has_watchdog_plan('agent')
)
with check (
  (select auth.uid()) = user_id
  and public.has_watchdog_plan('agent')
);
