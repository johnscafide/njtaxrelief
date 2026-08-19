create or replace function public.integration_mark_crm_resolution_pending()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.source_updated_at is distinct from old.source_updated_at then
    update public.integration_crm_resolution_state
      set detail_status='pending', next_attempt_at=null, last_error=null, updated_at=now()
    where crm_context_id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.integration_mark_crm_resolution_pending() from public,anon,authenticated;
grant execute on function public.integration_mark_crm_resolution_pending() to service_role;

drop trigger if exists trg_integration_crm_resolution_pending on public.integration_crm_context;
create trigger trg_integration_crm_resolution_pending
after update of source_updated_at on public.integration_crm_context
for each row execute function public.integration_mark_crm_resolution_pending();