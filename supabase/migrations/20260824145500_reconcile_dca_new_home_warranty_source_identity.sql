-- NJW-143: reconcile the logical source-family identity for the already-governed
-- NJ DCA New Home Warranty provider rows. Preserve value status, provider kind,
-- calculation contracts, and source-vintage evidence; add only the canonical
-- source_id so family-level audits can distinguish this governed implementation.

update public.data_center_provider_coverage
set source_keys = array_prepend(
      'nj-dca-new-home-warranty',
      array_remove(source_keys, 'nj-dca-new-home-warranty')
    ),
    last_verified_at = now(),
    notes = case
      when notes like '%canonical source-family identity%' then notes
      else notes || ' Governance reconciliation: canonical source-family identity nj-dca-new-home-warranty recorded without changing provider semantics.'
    end
where marker_id like 'njplus.nj-dca-new-home-warranty.%';
