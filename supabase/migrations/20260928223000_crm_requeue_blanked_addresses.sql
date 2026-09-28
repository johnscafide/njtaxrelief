-- Put back the CRM addresses that BoldTrail re-syncs erased.
--
-- 20260928220000_crm_sync_keeps_resolved_address stops new re-syncs from erasing
-- resolved addresses. Contacts that already lost theirs (185 in production on
-- 2026-09-28) still show no address, because their resolution state was finished
-- and nothing re-queued them. The resolution worker already found an address for
-- each one (normalized_address is set), so send them back through it: it re-reads
-- the contact detail from BoldTrail, stores the address again, and re-checks
-- matches. Verified and rejected links are left alone by the worker; only
-- unreviewed candidates are rebuilt.

update public.integration_crm_resolution_state s
   set detail_status = 'pending',
       next_attempt_at = null,
       last_error = null,
       updated_at = now()
  from public.integration_crm_context c
 where c.id = s.crm_context_id
   and c.property_address is null
   and s.normalized_address is not null
   and s.detail_status not in ('pending', 'error')
   and coalesce(c.property_ref, '') !~ '^\d{4}_';
