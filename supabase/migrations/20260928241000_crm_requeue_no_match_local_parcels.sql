-- Re-check every CRM contact the old matcher could not place.
--
-- The old matcher filtered NJOGIS parcels on ZIP5 (the owner's mailing ZIP) and
-- skipped addresses whose state sat inside the street field, so these contacts
-- were marked no_match. 20260928240000_crm_parcel_match_local.sql and the new
-- resolution worker match against the statewide parcel copy instead. Verified and
-- rejected links are left alone; the worker only rebuilds unreviewed candidates.

update public.integration_crm_resolution_state
   set detail_status = 'pending',
       next_attempt_at = null,
       last_error = null,
       updated_at = now()
 where detail_status = 'no_match';
