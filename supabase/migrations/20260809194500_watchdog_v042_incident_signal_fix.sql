-- Correct the v0.42 critical-signal names to match report-platform-event's
-- allow-list (`client_error` and `unhandled_rejection`).
create or replace function public.capture_platform_incident()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  route_value text := coalesce(new.resource_id, 'unknown');
  release_value text := coalesce(new.metadata->>'release', 'unknown');
  key_value text := concat(new.event_type, ':', route_value, ':', release_value, ':', (new.created_at at time zone 'utc')::date);
  row_count integer;
begin
  if new.event_type not like 'platform.%' then return new; end if;
  insert into public.platform_incidents (incident_key,title,severity,signal_type,route,event_count,first_seen_at,last_seen_at,release,metadata)
  values (key_value,case when new.event_type='platform.slow_page' then 'Repeated slow page' else 'Customer-facing JavaScript error' end,
    case when new.event_type in ('platform.client_error','platform.unhandled_rejection') then 'critical' else 'warning' end,
    new.event_type,route_value,1,new.created_at,new.created_at,release_value,jsonb_build_object('last_message',left(coalesce(new.metadata->>'message',''),240)))
  on conflict (incident_key) do update set event_count=public.platform_incidents.event_count+1,last_seen_at=excluded.last_seen_at,
    severity=case when public.platform_incidents.event_count+1>=5 then 'critical' else public.platform_incidents.severity end,
    status=case when public.platform_incidents.status='resolved' then 'open' else public.platform_incidents.status end,
    resolved_at=null,metadata=excluded.metadata,updated_at=now()
  returning event_count into row_count;
  if new.event_type='platform.slow_page' and row_count<5 then update public.platform_incidents set status='resolved',resolved_at=now() where incident_key=key_value; end if;
  return new;
end;
$$;
revoke all on function public.capture_platform_incident() from public, anon, authenticated;
