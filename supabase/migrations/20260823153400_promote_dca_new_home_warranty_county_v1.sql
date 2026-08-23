-- NJW-143: promote only the New Home Warranty markers proven by the authenticated
-- production canary. DCA's latest accessible official quarter is Q4 2025 preliminary.
-- The 2026 quarterly index exists, but its linked Q1 PDF/XLS return 404 as of
-- 2026-08-23. The official quarterly tables are county-level, so the municipality
-- rank marker remains unavailable rather than receiving a synthetic value.

update public.dca_source_registry
set source_status = 'partial',
    source_url = 'https://www.nj.gov/dca/codes/reporter/nhw.shtml',
    source_vintage = 'Q4 2025 preliminary latest accessible; 2026 Q1 PDF/XLS links 404 as of 2026-08-23',
    geography_scope = 'county',
    join_strategy = 'property county -> DCA county; report quarter/year',
    refresh_cadence = 'quarterly',
    authoritative = true,
    last_checked_at = now(),
    notes = 'Official DCA New Home Warranty quarterly data is county-level. Q4 2025 preliminary is the latest accessible official table; Q3 2025 is retained for exact quarter-over-quarter derivations. The 2026 page is live but its Q1 PDF and XLS links return 404. No municipality-level warranty enrollment rank is published, so that marker remains unavailable.'
where source_id = 'nj-dca-new-home-warranty';

insert into public.data_center_provider_coverage
(marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
('njplus.nj-dca-new-home-warranty.new_home_warranty_enrollments', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed on Atlantic County control property; DCA Number of new houses is exposed as warranty enrollments. 2026 Q1 source links remain 404.', 'authoritative_reference', array['Number of new houses'], null, 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_average_price', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; value is the published DCA county average sales price.', 'authoritative_reference', array['Average sales price'], null, 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_median_price', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; value is the published DCA county median sales price.', 'authoritative_reference', array['Median sales price'], null, 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_sales_count', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; the DCA quarterly table reports Number of new houses for the warranty-covered new-home sales table.', 'authoritative_reference', array['Number of new houses'], null, 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_quarter', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; report header quarter is exposed explicitly so consumers can see the source vintage.', 'authoritative_reference', array['Report header quarter'], null, 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_year', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; report header year is exposed explicitly so consumers can see the source vintage.', 'authoritative_reference', array['Report header year'], null, 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_price_change', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q3 2025 preliminary','NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; exact Q3-to-Q4 percentage change in published county average sales price, rounded to two decimals.', 'derived_governed', array['Average sales price'], 'nhw-q3-q4-2025-average-price-change-v1', 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_enrollment_change', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q3 2025 preliminary','NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; exact Q3-to-Q4 percentage change in DCA Number of new houses, rounded to two decimals.', 'derived_governed', array['Number of new houses'], 'nhw-q3-q4-2025-enrollment-change-v1', 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_county_rank', array['county'], 'workbench-hydrate', 'live', array['NJ DCA New Home Warranties Q4 2025 preliminary'], now(), 'Authenticated production canary passed; exact Watchdog ordinal rank across the 21 published county Number of new houses values. DCA-published average/median price ranks are not substituted for this marker.', 'derived_governed', array['Number of new houses'], 'nhw-q4-2025-enrollment-rank-v1', 7776000, 'shared_property_cache', true),
('njplus.nj-dca-new-home-warranty.new_home_warranty_municipal_rank', array['county'], 'workbench-hydrate', 'unavailable', array['NJ DCA New Home Warranties quarterly reports'], now(), 'Official DCA quarterly New Home Warranty data is county-level and does not publish municipality-level warranty enrollment rank. Authenticated canary verifies source_checked_no_value; do not synthesize a municipality rank.', 'authoritative_reference', array[]::text[], null, 7776000, 'shared_property_cache', false)
on conflict (marker_id) do update
set scopes = excluded.scopes,
    provider_key = excluded.provider_key,
    value_status = excluded.value_status,
    source_keys = excluded.source_keys,
    last_verified_at = excluded.last_verified_at,
    notes = excluded.notes,
    provider_kind = excluded.provider_kind,
    source_fields = excluded.source_fields,
    calculation_key = excluded.calculation_key,
    freshness_seconds = excluded.freshness_seconds,
    cache_policy = excluded.cache_policy,
    bulk_capable = excluded.bulk_capable;
