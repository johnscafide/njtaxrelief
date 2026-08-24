-- Reconcile NJW-143 municipal-housing-profile governance identity.
-- The eight exact Municipal Housing Profile-compatible markers were already
-- promoted against the official NJ DCA Neighborhood Trends workbook, but their
-- production source_keys omitted the logical catalog source_id. Preserve the
-- authoritative workbook key and add the governed source-family identifier so
-- Data Center/provider audits can reconcile catalog intent to production truth.

update public.data_center_provider_coverage
set
  source_keys = array['nj-dca-municipal-housing-profile','NJ DCA 2026 Neighborhood Trends Database'],
  last_verified_at = now(),
  notes = case
    when position('NJW-143 source-family reconciliation' in coalesce(notes,'')) > 0 then notes
    else coalesce(notes,'') || case when coalesce(notes,'') = '' then '' else ' ' end ||
      'NJW-143 source-family reconciliation: exact values remain sourced from the official NJ DCA Neighborhood Trends workbook; logical catalog source_id added for governed provider reconciliation.'
  end
where marker_id like 'njplus.nj-dca-municipal-housing-profile.%'
  and provider_key = 'dca_housing_context_v1'
  and value_status = 'live';
