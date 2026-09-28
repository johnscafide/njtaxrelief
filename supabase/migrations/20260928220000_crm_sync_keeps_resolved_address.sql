-- BoldTrail re-syncs were erasing resolved CRM addresses.
--
-- The provider sync worker always sends property_address = null (kvCORE's contact
-- list has no address; integration-crm-resolution-worker fetches it from the contact
-- detail and stores it with integration_set_crm_resolution_address). The upsert then
-- overwrote the stored address with null on every re-sync. Contacts whose
-- source_updated_at did not change were never re-queued, so the address stayed gone
-- (185 contacts in production on 2026-09-28).
--
-- 1. Keep the stored address when an incoming row has none, the same rule the
--    function already uses for phone, tags and last activity. A non-null incoming
--    address (webhooks, Zapier) still replaces it. Only this one assignment changes;
--    the statement stops if the current definition does not contain it.
-- 2. Resolution states left at "candidate" after every candidate was reviewed and
--    verified are marked "enriched", which is what integration_bulk_decide_crm_candidates
--    sets for reviewed contacts.

do $$
declare
  v_def text := pg_get_functiondef('public.integration_upsert_crm_context_batch(uuid,uuid,jsonb)'::regprocedure);
  v_old text := 'property_address = excluded.property_address,';
  v_new text := 'property_address = coalesce(excluded.property_address, integration_crm_context.property_address),';
begin
  if position(v_new in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'integration_upsert_crm_context_batch changed; review the address rule by hand';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

update public.integration_crm_resolution_state s
   set detail_status = 'enriched',
       candidate_count = 0,
       updated_at = now()
 where s.detail_status = 'candidate'
   and exists (
     select 1 from public.integration_crm_property_links l
      where l.crm_context_id = s.crm_context_id and l.status = 'verified'
   )
   and not exists (
     select 1 from public.integration_crm_property_links l
      where l.crm_context_id = s.crm_context_id and l.status = 'candidate'
   );
