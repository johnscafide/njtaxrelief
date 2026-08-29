create or replace function public.get_public_data_center_overview_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with coverage as (
  select
    count(*) filter (where value_status = 'live')::int as live_fields,
    count(*) filter (where value_status = 'live' and bulk_capable is true)::int as bulk_ready_fields,
    count(*) filter (where value_status = 'partial')::int as partial_fields,
    count(*) filter (where value_status = 'planned')::int as planned_fields,
    count(*) filter (where value_status = 'unavailable')::int as unavailable_fields,
    min(last_verified_at) filter (where value_status = 'live') as oldest_live_verified_at,
    max(last_verified_at) filter (where value_status = 'live') as newest_live_verified_at
  from public.data_center_provider_coverage
),
marker_rows as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'marker_id', marker_id,
        'value_status', value_status,
        'bulk_capable', coalesce(bulk_capable, false),
        'last_verified_at', last_verified_at
      ) order by marker_id
    ),
    '[]'::jsonb
  ) as payload
  from public.data_center_provider_coverage
),
freshness_rows as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'group_key', group_key,
        'compliant_count', compliant_count,
        'total_count', total_count,
        'oldest_verified_at', oldest_verified_at,
        'newest_verified_at', newest_verified_at,
        'refreshed_at', refreshed_at
      ) order by group_key
    ),
    '[]'::jsonb
  ) as payload
  from public.data_center_source_currency_metrics
)
select jsonb_build_object(
  'contract', 'public-data-center-overview-v1',
  'generated_at', now(),
  'summary', jsonb_build_object(
    'live_fields', coverage.live_fields,
    'bulk_ready_fields', coverage.bulk_ready_fields,
    'partial_fields', coverage.partial_fields,
    'planned_fields', coverage.planned_fields,
    'unavailable_fields', coverage.unavailable_fields,
    'oldest_live_verified_at', coverage.oldest_live_verified_at,
    'newest_live_verified_at', coverage.newest_live_verified_at
  ),
  'marker_coverage', marker_rows.payload,
  'source_freshness', freshness_rows.payload
)
from coverage cross join marker_rows cross join freshness_rows;
$$;

revoke all on function public.get_public_data_center_overview_v1() from public;
grant execute on function public.get_public_data_center_overview_v1() to anon, authenticated;

comment on function public.get_public_data_center_overview_v1() is
'Public-safe bounded Data Center transparency contract. Returns aggregate provider coverage, per-marker status/bulk readiness/verification time, and source-family freshness metrics only. It intentionally exposes no customer properties, provider credentials, source field mappings, formulas, internal notes, or user data.';