-- Promote the two equalized market-value markers only after the authenticated
-- derived_exact_v1 production canary passed on 2026-08-21.
--
-- Control: 0101_25.01_10 / Absecon City
-- Independent governed inputs:
--   property.assessed_value = 335800
--   sales.ratio             = 0.5163
-- Expected: round(335800 / 0.5163) = 650397
-- Canary request 1486: HTTP 200; exact values matched for both markers;
-- provider_kind=derived_governed; zero missing or semantic mismatches.

update public.data_center_provider_coverage
set
  provider_key = 'workbench-derived',
  provider_kind = 'derived_governed',
  value_status = 'live',
  source_keys = array['NJ MOD-IV','NJ Division of Taxation SR-1A verified sales']::text[],
  source_fields = array['NET_VALUE','ratio']::text[],
  calculation_key = 'watchdog-derived-v16-chapter123-fields',
  bulk_capable = true,
  last_verified_at = now(),
  notes = case marker_id
    when 'property.market_value' then 'Governed equalized market-value estimate: NJ MOD-IV assessed value divided by the verified municipal SR-1A assessment-to-sale ratio. Authenticated exact-value production canary passed; missing inputs remain missing.'
    else 'Watchdog presentation of the governed equalized market-value estimate: NJ MOD-IV assessed value divided by the verified municipal SR-1A assessment-to-sale ratio. Authenticated exact-value production canary passed; missing inputs remain missing.'
  end
where marker_id in ('property.market_value','watchdog.market_value_estimate');

-- Fail closed if the expected canonical rows were not both updated.
do $$
begin
  if (select count(*) from public.data_center_provider_coverage where marker_id in ('property.market_value','watchdog.market_value_estimate') and value_status='live' and provider_kind='derived_governed') <> 2 then
    raise exception 'Market-value provider promotion did not produce two governed LIVE rows';
  end if;
end $$;
