-- Tighten Daily Intelligence Today event privileges after production verification.
-- Authenticated users need only owner-scoped SELECT + INSERT under RLS.

revoke all on table public.intelligence_today_events from authenticated;
grant select, insert on table public.intelligence_today_events to authenticated;

grant all on table public.intelligence_today_events to service_role;
