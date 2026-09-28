-- Watchdog Score batch precompute progress: the scorer walks property_lookups
-- in pams_pin order, so its resume point is text, not an OBJECTID.
alter table public.parcel_sync_runs add column if not exists cursor text;
comment on column public.parcel_sync_runs.cursor is 'Resume point for pams_pin-ordered runs (score precompute).';
