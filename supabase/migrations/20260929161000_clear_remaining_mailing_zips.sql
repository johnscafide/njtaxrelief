-- Finish the mailing ZIP purge (see 20260928231000 / 20260928233000).
-- The throttled job only cleared rows from the statewide sync
-- (source_synced_at is not null). 4,350 older rows, mostly the Gloucester Twp
-- pilot load, still held owner mailing ZIPs (08701 Lakewood, 08043 Voorhees,
-- and so on for a Gloucester Twp parcel). Small enough for one statement.
set local statement_timeout = '120s';
set local lock_timeout = '5s';
update public.property_lookups set zip = null where zip is not null;
