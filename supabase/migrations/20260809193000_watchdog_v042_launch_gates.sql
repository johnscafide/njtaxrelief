-- Watchdog v0.42: paid-launch evidence, reliability incidents and a tightened
-- authenticated database boundary. Browser grants are kept to the operations
-- each product surface actually uses; RLS remains the final authorization gate.

create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  title text not null check (char_length(title) between 1 and 180),
  severity text not null default 'warning' check (severity in ('warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  signal_type text not null,
  route text,
  event_count integer not null default 1 check (event_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  release text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.platform_incidents enable row level security;
revoke all on table public.platform_incidents from public, anon, authenticated;
grant all on table public.platform_incidents to service_role;
create index if not exists platform_incidents_status_seen_idx
  on public.platform_incidents (status, last_seen_at desc);

-- Convert every sanitized client error into an aggregated incident without a
-- polling worker. Slow-page samples remain telemetry unless they repeat five
-- times for the same route and release on the same UTC day.
create or replace function public.capture_platform_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  route_value text := coalesce(new.resource_id, 'unknown');
  release_value text := coalesce(new.metadata->>'release', 'unknown');
  key_value text := concat(new.event_type, ':', route_value, ':', release_value, ':', (new.created_at at time zone 'utc')::date);
  row_count integer;
begin
  if new.event_type not like 'platform.%' then return new; end if;
  insert into public.platform_incidents (
    incident_key, title, severity, signal_type, route, event_count,
    first_seen_at, last_seen_at, release, metadata
  ) values (
    key_value,
    case when new.event_type = 'platform.slow_page' then 'Repeated slow page' else 'Customer-facing JavaScript error' end,
    case when new.event_type in ('platform.client_error','platform.unhandled_rejection') then 'critical' else 'warning' end,
    new.event_type, route_value, 1, new.created_at, new.created_at, release_value,
    jsonb_build_object('last_message', left(coalesce(new.metadata->>'message',''), 240))
  )
  on conflict (incident_key) do update set
    event_count = public.platform_incidents.event_count + 1,
    last_seen_at = excluded.last_seen_at,
    severity = case when public.platform_incidents.event_count + 1 >= 5 then 'critical' else public.platform_incidents.severity end,
    status = case when public.platform_incidents.status = 'resolved' then 'open' else public.platform_incidents.status end,
    resolved_at = null,
    metadata = excluded.metadata,
    updated_at = now()
  returning event_count into row_count;
  -- One-off slow samples are retained as telemetry, not active incidents.
  if new.event_type = 'platform.slow_page' and row_count < 5 then
    update public.platform_incidents set status = 'resolved', resolved_at = now() where incident_key = key_value;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_platform_incident() from public, anon, authenticated;
drop trigger if exists capture_platform_incident_after_audit on public.access_audit_log;
create trigger capture_platform_incident_after_audit
after insert on public.access_audit_log
for each row execute function public.capture_platform_incident();

-- Verification delivery totals are private account data. Anonymous execution
-- was an unnecessary legacy grant even though the function filters auth.uid().
revoke all on function public.verification_delivery_status() from public, anon;
grant execute on function public.verification_delivery_status() to authenticated;

-- Replace permissive legacy profile policies with one clear owner boundary.
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile write" on public.profiles;
drop policy if exists "watchdog profile owner boundary" on public.profiles;
drop policy if exists "watchdog profile select own" on public.profiles;
drop policy if exists "watchdog profile update own" on public.profiles;
create policy "watchdog profile select own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "watchdog profile update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Recreate older owner policies using init-plan friendly auth evaluation.
drop policy if exists "saved properties select own" on public.saved_properties;
drop policy if exists "saved properties insert own" on public.saved_properties;
drop policy if exists "saved properties update own" on public.saved_properties;
drop policy if exists "saved properties delete own" on public.saved_properties;
create policy "saved properties select own" on public.saved_properties for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved properties insert own" on public.saved_properties for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved properties update own" on public.saved_properties for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved properties delete own" on public.saved_properties for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "verify codes select own" on public.verify_codes;
create policy "verify codes select own" on public.verify_codes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "property verify codes select own" on public.property_verify_codes;
create policy "property verify codes select own" on public.property_verify_codes for select to authenticated using ((select auth.uid()) = user_id);

-- Least-privilege browser grants. Service-only tables remain deny-all to users.
revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;
revoke all on table public.saved_properties from anon, authenticated;
grant select, insert, update, delete on table public.saved_properties to authenticated;
revoke all on table public.verify_codes from anon, authenticated;
grant select on table public.verify_codes to authenticated;
revoke all on table public.property_verify_codes from anon, authenticated;
grant select on table public.property_verify_codes to authenticated;
revoke all on table public.professional_preferences from anon, authenticated;
grant select, insert, update on table public.professional_preferences to authenticated;
revoke all on table public.property_alert_preferences from anon, authenticated;
grant select, insert, update, delete on table public.property_alert_preferences to authenticated;
revoke all on table public.property_update_events from anon, authenticated;
grant select, update (read_at) on table public.property_update_events to authenticated;
revoke all on table public.score_observations from anon, authenticated;
grant select on table public.score_observations to authenticated;
revoke all on table public.saved_data_center_views from anon, authenticated;
grant select, insert, update, delete on table public.saved_data_center_views to authenticated;
revoke all on table public.professional_cases from anon, authenticated;
grant select, insert, update, delete on table public.professional_cases to authenticated;
revoke all on table public.professional_case_activity from anon, authenticated;
grant select, insert, delete on table public.professional_case_activity to authenticated;
revoke all on table public.appeal_case_workspaces from anon, authenticated;
grant select, insert, update, delete on table public.appeal_case_workspaces to authenticated;
revoke all on table public.insights_articles from anon, authenticated;
grant select on table public.insights_articles to anon, authenticated;

create index if not exists professional_case_activity_user_idx
  on public.professional_case_activity (user_id, created_at desc);
create index if not exists property_verify_codes_user_idx
  on public.property_verify_codes (user_id);

comment on table public.platform_incidents is
  'Service-only reliability incidents derived from sanitized platform telemetry.';
