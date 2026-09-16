-- Agent includes private transaction coordination. Source-populated evidence remains Pro+.
-- Preserve ownership on every operation, including direct REST calls and downgraded accounts.
begin;

alter policy transaction_workspaces_select on public.transaction_workspaces
  using (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_workspaces_insert on public.transaction_workspaces
  with check (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_workspaces_update on public.transaction_workspaces
  using (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))))
  with check (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_workspaces_delete on public.transaction_workspaces
  using (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_disclosures_select on public.transaction_disclosures
  using (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_disclosures_insert on public.transaction_disclosures
  with check (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_disclosures_update on public.transaction_disclosures
  using (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))))
  with check (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_disclosures_delete on public.transaction_disclosures
  using (((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))));

alter policy transaction_items_select on public.transaction_items
  using ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or (source_type is null and source_label is null and source_url is null and source_checked_at is null and payload = '{}'::jsonb))));

alter policy transaction_items_insert on public.transaction_items
  with check ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or (source_type is null and source_label is null and source_url is null and source_checked_at is null and payload = '{}'::jsonb))));

alter policy transaction_items_update on public.transaction_items
  using ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or (source_type is null and source_label is null and source_url is null and source_checked_at is null and payload = '{}'::jsonb))))
  with check ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or (source_type is null and source_label is null and source_url is null and source_checked_at is null and payload = '{}'::jsonb))));

alter policy transaction_items_delete on public.transaction_items
  using ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or (source_type is null and source_label is null and source_url is null and source_checked_at is null and payload = '{}'::jsonb))));

alter policy transaction_activity_select on public.transaction_activity
  using ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or action in ('transaction_create','transaction_update','item_create','item_update','disclosure_update','stage_update'))));

alter policy transaction_activity_insert on public.transaction_activity
  with check ((((select auth.uid()) = user_id and (select public.has_watchdog_plan('agent'))) and ((select public.has_watchdog_plan('pro_plus')) or action in ('transaction_create','transaction_update','item_create','item_update','disclosure_update','stage_update'))));

-- An Agent may coordinate the file but cannot enable paid automated evidence jobs.
-- The trigger is invoker-owned; server jobs retain their existing service-role boundary.
create or replace function public.guard_transaction_evidence_settings()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' and not public.has_watchdog_plan('pro_plus') then
    new.watch_enabled := false;
    if tg_op = 'UPDATE' then
      new.last_watch_at := old.last_watch_at;
      new.readiness_status := old.readiness_status;
    else
      new.last_watch_at := null;
      new.readiness_status := 'review';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_transaction_evidence_settings() from public, anon, authenticated;
create trigger guard_transaction_evidence_settings
before insert or update on public.transaction_workspaces
for each row execute function public.guard_transaction_evidence_settings();
commit;
