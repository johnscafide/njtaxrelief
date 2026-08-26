-- Canonicalize the difficult investor batch to the proprietary backlog IDs.
-- The profession-prefixed rows from 20260826123000 were an implementation naming mismatch.

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
select 'watchdog.exit_liquidity_score',engine_version,formula,dependencies,confidence,status,explanation,operation,config,now()
from public.derived_formula_registry where marker_id='watchdog.investor.exit_liquidity_score'
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
select 'watchdog.municipal_fiscal_beta',engine_version,formula,dependencies,confidence,status,explanation,operation,config,now()
from public.derived_formula_registry where marker_id='watchdog.investor.municipal_fiscal_beta'
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
select 'watchdog.portfolio_data_confidence',engine_version,formula,dependencies,confidence,status,explanation,operation,config,now()
from public.derived_formula_registry where marker_id='watchdog.investor.portfolio_data_confidence'
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
select 'watchdog.redevelopment_incentive_exposure',engine_version,formula,dependencies,confidence,status,explanation,operation,config,now()
from public.derived_formula_registry where marker_id='watchdog.investor.redevelopment_incentive_exposure'
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select 'watchdog.exit_liquidity_score',scopes,provider_key,value_status,source_keys,now(),notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable
from public.data_center_provider_coverage where marker_id='watchdog.investor.exit_liquidity_score'
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select 'watchdog.municipal_fiscal_beta',scopes,provider_key,value_status,source_keys,now(),notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable
from public.data_center_provider_coverage where marker_id='watchdog.investor.municipal_fiscal_beta'
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select 'watchdog.portfolio_data_confidence',scopes,provider_key,value_status,source_keys,now(),notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable
from public.data_center_provider_coverage where marker_id='watchdog.investor.portfolio_data_confidence'
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select 'watchdog.redevelopment_incentive_exposure',scopes,provider_key,value_status,source_keys,now(),notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable
from public.data_center_provider_coverage where marker_id='watchdog.investor.redevelopment_incentive_exposure'
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

delete from public.data_center_provider_coverage where marker_id in ('watchdog.investor.exit_liquidity_score','watchdog.investor.municipal_fiscal_beta','watchdog.investor.portfolio_data_confidence','watchdog.investor.redevelopment_incentive_exposure');
delete from public.derived_formula_registry where marker_id in ('watchdog.investor.exit_liquidity_score','watchdog.investor.municipal_fiscal_beta','watchdog.investor.portfolio_data_confidence','watchdog.investor.redevelopment_incentive_exposure');
