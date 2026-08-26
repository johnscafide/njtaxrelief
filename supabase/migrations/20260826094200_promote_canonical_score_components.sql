-- Promote score components that already execute directly through the canonical
-- workbench-score runtime. Persisted score observations are history/cache, not the
-- execution contract for these markers.

update public.data_center_provider_coverage
set provider_key = 'workbench-score',
    provider_kind = 'canonical_score_component',
    value_status = 'live',
    source_keys = array['Watchdog Score powered by ROBUST','NJ general tax-rate series']::text[],
    source_fields = array['tax.rate history']::text[],
    calculation_key = 'workbench-signals-v2.1.0-tax-pressure',
    freshness_seconds = 21600,
    cache_policy = 'refresh_on_demand',
    bulk_capable = true,
    last_verified_at = now(),
    notes = 'Promoted 2026-08-26: watchdog.tax_pressure is computed directly by the canonical workbench-score runtime, not merely read from sparse trusted observations. Exact formula: 70% positive five-year general-tax-rate CAGR risk normalized at 4% full scale plus 30% latest YoY positive tax-rate risk normalized at 6% full scale, clamped 0-100. workbench-refresh explicitly routes watchdog.tax_pressure to workbench-score as a score marker. Persisted observations remain a cache/history artifact, not the execution contract.'
where marker_id = 'watchdog.tax_pressure';

update public.data_center_provider_coverage
set provider_key = 'workbench-score',
    provider_kind = 'canonical_score_component',
    value_status = 'live',
    source_keys = array['Watchdog governed signal engine','NJ assessment uniformity source']::text[],
    source_fields = array['uniformity.score','uniformity.coefficient','uniformity.volatility','uniformity.sales']::text[],
    calculation_key = 'workbench-signals-v2.1.0-uniformity',
    freshness_seconds = 21600,
    cache_policy = 'refresh_on_demand',
    bulk_capable = true,
    last_verified_at = now(),
    notes = 'Promoted 2026-08-26: uniformity.score is emitted directly by the canonical workbench-score runtime from the governed municipality uniformity source. workbench-refresh explicitly routes uniformity.score to workbench-score as a score marker. Stored score observations are persistence/history, not the execution contract.'
where marker_id = 'uniformity.score';
