-- CRM property matching: let the resolution worker save ZIP-enriched candidates.
--
-- integration-crm-resolution-worker labels a match "enriched_zip_exact_candidate"
-- when it had to recover the ZIP code before finding the parcel. The link_method
-- check never allowed that label, so those inserts failed silently: the resolution
-- state says "candidate" but no candidate link exists for the user to review
-- (69 contacts vs 1 link in production on 2026-09-28).
--
-- 1. Allow the label (all existing values are kept).
-- 2. Put the affected contacts back in the queue so the worker (every 5 minutes,
--    20 at a time) recreates their candidate links. Contacts that already have a
--    link of any status are left alone. Nothing is auto-verified: candidates still
--    need the user's review.

alter table public.integration_crm_property_links
  drop constraint if exists integration_crm_property_links_link_method_check;
alter table public.integration_crm_property_links
  add constraint integration_crm_property_links_link_method_check
  check (link_method = any (array[
    'provider_property_ref',
    'exact_address_candidate',
    'enriched_zip_exact_candidate',
    'manual',
    'verified_address',
    'external_mapping'
  ]));

update public.integration_crm_resolution_state s
   set detail_status = 'pending',
       next_attempt_at = null,
       candidate_count = 0,
       last_error = null,
       updated_at = now()
 where s.detail_status = 'candidate'
   and not exists (
     select 1 from public.integration_crm_property_links l
      where l.crm_context_id = s.crm_context_id
   );
