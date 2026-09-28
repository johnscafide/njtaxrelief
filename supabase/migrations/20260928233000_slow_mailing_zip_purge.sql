-- Slow, self-braking clear of owner mailing ZIPs (see 20260928231000).
--
-- The one-shot UPDATE of ~3M rows, run alongside the statewide score
-- precompute, exhausted the database's disk I/O and caused an outage on
-- 2026-09-28 (18:05-18:35 UTC, fixed by a restart). This replaces it with a
-- throttled job:
--   * every 2 minutes, at most 5,000 rows, town by town (town index);
--   * skips its turn when the database is busy (more than 10 active
--     queries, or any query running longer than 15 seconds);
--   * hard 60 s statement limit and 2 s lock wait per step;
--   * unschedules itself when every town is done.
-- Each run's result is visible in cron.job_run_details.

create table if not exists public.parcel_zip_purge_queue (
  town text not null,
  county text not null,
  cleared integer,
  done_at timestamptz,
  primary key (town, county)
);
alter table public.parcel_zip_purge_queue enable row level security;
revoke all on public.parcel_zip_purge_queue from anon, authenticated;

insert into public.parcel_zip_purge_queue (town, county)
select distinct town, county from public.public_town_class_stats
on conflict do nothing;

drop function if exists public.purge_mailing_zip_step(integer);

create or replace function public.purge_mailing_zip_slow(p_max_rows integer default 5000)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
set lock_timeout = '2s'
as $$
declare
  v_active integer;
  v_longest interval;
  v_budget integer := greatest(p_max_rows, 1);
  v_total integer := 0;
  v_towns integer := 0;
  q record;
  n integer;
begin
  select count(*), coalesce(max(now() - query_start), interval '0')
  into v_active, v_longest
  from pg_stat_activity
  where state = 'active' and pid <> pg_backend_pid() and backend_type = 'client backend';
  if v_active > 10 or v_longest > interval '15 seconds' then
    return format('skipped: database busy (%s active, longest %s)', v_active, date_trunc('second', v_longest));
  end if;

  -- Work through towns until this turn's row budget is used.
  while v_budget > 0 loop
    select town, county into q from public.parcel_zip_purge_queue where done_at is null order by town, county limit 1;
    if not found then
      perform cron.unschedule('watchdog-mailing-zip-purge-slow');
      return format('done: every town cleared (%s rows this turn); job unscheduled', v_total);
    end if;

    update public.property_lookups p set zip = null
    where p.pams_pin in (
      select l.pams_pin from public.property_lookups l
      where l.town = q.town and l.county = q.county and l.source_synced_at is not null and l.zip is not null
      limit v_budget
    );
    get diagnostics n = row_count;

    update public.parcel_zip_purge_queue
    set cleared = coalesce(cleared, 0) + n,
        done_at = case when n < v_budget then now() else null end
    where town = q.town and county = q.county;

    v_total := v_total + n;
    v_towns := v_towns + 1;
    v_budget := v_budget - greatest(n, 1);
  end loop;
  return format('cleared %s rows across %s town(s)', v_total, v_towns);
end;
$$;
revoke all on function public.purge_mailing_zip_slow(integer) from public, anon, authenticated;

select cron.schedule('watchdog-mailing-zip-purge-slow', '*/2 * * * *', 'select public.purge_mailing_zip_slow(5000);');
