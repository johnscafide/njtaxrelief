begin;

with targets(marker_id) as (values
 ('watchdog.constraint_stack_count'),
 ('watchdog.attorney.land_use_exception_stack'),
 ('watchdog.attorney.public_notice_density'),
 ('watchdog.title.title_land_constraint_mix'),
 ('watchdog.agent.offer_question_density'),
 ('watchdog.contractor.site_preflight_completeness'),
 ('watchdog.contractor.preconstruction_question_set'),
 ('watchdog.insurance.mapped_hazard_overlap'),
 ('watchdog.insurance.physical_record_coverage'),
 ('watchdog.municipal.municipal_source_coverage'),
 ('watchdog.njplus.municipal_housing_evidence_depth'),
 ('watchdog.njplus.neighborhood_trend_freshness'),
 ('watchdog.title.municipal_search_scope')
), defs as (
 select d.*
 from public.derived_formula_registry d
 join targets t using(marker_id)
 where d.status='live'
)
insert into public.data_center_provider_coverage(
 marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,
 provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable
)
select
 marker_id,
 array[]::text[],
 'watchdog-derived',
 'live',
 array[]::text[],
 now(),
 explanation,
 'derived_governed',
 dependencies,
 engine_version,
 null,
 'refresh_on_demand',
 false
from defs
on conflict(marker_id) do update set
 scopes=excluded.scopes,
 provider_key=excluded.provider_key,
 value_status=excluded.value_status,
 source_keys=excluded.source_keys,
 last_verified_at=excluded.last_verified_at,
 notes=excluded.notes,
 provider_kind=excluded.provider_kind,
 source_fields=excluded.source_fields,
 calculation_key=excluded.calculation_key,
 freshness_seconds=excluded.freshness_seconds,
 cache_policy=excluded.cache_policy,
 bulk_capable=excluded.bulk_capable;

commit;
