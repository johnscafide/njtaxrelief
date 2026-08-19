create or replace function private.watchdog_intelligence_terminal_job_cleanup()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.status in ('complete','cache_hit') then
    new.error_code := null;
    new.error_message := null;
  end if;
  return new;
end;
$$;
revoke all on function private.watchdog_intelligence_terminal_job_cleanup() from public, anon, authenticated;

drop trigger if exists intelligence_terminal_job_cleanup on public.intelligence_jobs;
create trigger intelligence_terminal_job_cleanup before update on public.intelligence_jobs for each row execute function private.watchdog_intelligence_terminal_job_cleanup();

update public.intelligence_jobs set updated_at=updated_at where status in ('complete','cache_hit');
