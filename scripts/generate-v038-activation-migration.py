#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PACK=json.loads((ROOT/'property/data/nj-source-pack-v038.json').read_text())
OUT=ROOT/'supabase/migrations/20260827223000_activate_development_trends_v038.sql'

def q(v):
    if v is None:return 'null'
    return "'" + str(v).replace("'","''") + "'"

markers=PACK['markers']
direct={m['id']:m for m in markers if m.get('origin')=='public'}
derived=[m for m in markers if m.get('origin')=='watchdog-derived']
formula=[]
for m in derived:
    dep=m['dependencies'][0]
    metric=m['calculation_config']['metric']
    formula.append(f"  ({q(m['id'])},{q(m['calculation_key'])},{q(m['formula'])},array[{q(dep)}]::text[],'high','live',{q(m['professional_reason'])},now(),'history_metric',jsonb_build_object('metric',{q(metric)},'years',jsonb_build_array(2020,2021,2022,2023,2024)))")
coverage=[]
for m in markers:
    kind='authoritative_reference' if m.get('origin')=='public' else 'derived_governed'
    if kind=='authoritative_reference': field=m['source_field'];calc=None
    else: field=direct[m['dependencies'][0]]['source_field'];calc=m['calculation_key']
    coverage.append(f"  ({q(m['id'])},{q(kind)},{q(field)},{q(calc)})")

sql=f"""-- NJW-143: certify the bounded NJ DCA Development Trends Viewer v0.38 batch.
-- Production canary development_trends_v038 request 3848 passed exact source/history/arithmetic/provenance assertions.

insert into public.dca_source_registry
  (source_id,source_status,source_url,source_vintage,geography_scope,join_strategy,refresh_cadence,authoritative,last_checked_at,notes)
values
  ('nj-dca-development-trends-annual-v038','live','https://www.nj.gov/dca/codes/reporter/Development_Trend_Viewer.xlsb',
   'Viewer as of 2025-08-21; latest published annual data year 2024',
   'municipality','4-digit municipality code -> governed 564-municipality annual source artifact','annual / source change monitored',true,now(),
   'Certified v0.38 annual Development Trends Viewer release. 2025 workbook columns are not treated as published annual observations because the workbook identifies 2024 as the latest data year. Current-municipality normalization excludes legacy Princeton Borough, Pine Valley and Pahaquarry; Princeton Township source row is emitted as current Princeton 1114. Existing rolling raw permit-feed coverage remains separate.')
on conflict (source_id) do update set
  source_status=excluded.source_status,source_url=excluded.source_url,source_vintage=excluded.source_vintage,
  geography_scope=excluded.geography_scope,join_strategy=excluded.join_strategy,refresh_cadence=excluded.refresh_cadence,
  authoritative=excluded.authoritative,last_checked_at=excluded.last_checked_at,notes=excluded.notes;

insert into public.derived_formula_registry
  (marker_id,engine_version,formula,dependencies,confidence,status,explanation,updated_at,operation,config)
values
{','.join(chr(10)+x for x in formula)[1:]}
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,
  confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,
  updated_at=excluded.updated_at,operation=excluded.operation,config=excluded.config;

with promoted(marker_id,provider_kind,source_field,calculation_key) as (
  values
{','.join(chr(10)+x for x in coverage)[1:]}
)
insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
select marker_id,array['municipality']::text[],'workbench-hydrate','live',
  array['nj-dca-development-trends','nj-dca-development-trends-2025-08-21-v1']::text[],now(),
  'Certified by authenticated production canary development_trends_v038 request 3848. Exact DCA annual source semantics; deterministic derived fields are only explicit five-year sums or 2024-minus-2023 deltas. No legal, zoning, code-compliance, appraisal, lending, insurance, eligibility, construction-completion, transaction, momentum, risk or priority inference.',
  provider_kind,array[source_field]::text[],calculation_key,21600,'refresh_on_demand',true
from promoted
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
"""
OUT.write_text(sql)
print(OUT, len(markers), len(derived))
