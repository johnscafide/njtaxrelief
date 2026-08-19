create or replace function public.integration_set_provider_unique_context_total()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select count(*)::bigint
    into new.records_synced_total
  from public.integration_crm_context c
  where c.connection_id = new.connection_id
    and c.user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.integration_set_provider_unique_context_total() from public, anon, authenticated;
grant execute on function public.integration_set_provider_unique_context_total() to service_role;

drop trigger if exists trg_integration_provider_unique_context_total on public.integration_provider_connections;
create trigger trg_integration_provider_unique_context_total
before insert or update of last_records_upserted, last_sync_completed_at, sync_status
on public.integration_provider_connections
for each row
execute function public.integration_set_provider_unique_context_total();

update public.integration_provider_connections p
set records_synced_total = (
  select count(*)::bigint
  from public.integration_crm_context c
  where c.connection_id = p.connection_id
    and c.user_id = p.user_id
), updated_at = now();

comment on function public.integration_set_provider_unique_context_total() is 'Keeps provider records_synced_total aligned to current unique normalized CRM context rows rather than cumulative repeat upsert operations.';
