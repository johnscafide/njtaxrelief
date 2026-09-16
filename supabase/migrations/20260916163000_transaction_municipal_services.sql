-- NJW-371: statewide municipal service routing for Transaction Command Center.
-- Source discovery is informational. It must never be interpreted as an address-level pickup day
-- unless a provider has supplied a route/address-specific schedule.

with municipalities as (
  select distinct on (municipality_code)
    municipality_code,
    municipality_name,
    county
  from public.transaction_municipal_requirements
  where municipality_code ~ '^\d{4}$'
  order by municipality_code, municipality_name
)
insert into public.transaction_provider_registry (
  jurisdiction_type,jurisdiction_key,jurisdiction_name,county,
  provider_key,provider_label,provider_url,evidence_families,
  access_mode,adapter_status,source_url,metadata,last_verified_at,updated_at
)
select
  'municipality',m.municipality_code,m.municipality_name,m.county,
  'njdep_recycle_coach','NJDEP Recycle Coach',
  'https://dep.nj.gov/dshw/rhwm/recycle-coach/',
  array['municipal_services','trash_recycling'],
  'official_interactive_schedule','source_only',
  'https://dep.nj.gov/dshw/rhwm/recycle-coach/',
  jsonb_build_object(
    'statewide',true,
    'schedule_scope','municipality_or_address_in_official_tool',
    'address_day_resolved',false,
    'can_infer_address_day',false,
    'semantics','NJDEP provides statewide Recycle Coach access for trash/recycling schedules and municipality notices. Watchdog must not label a pickup day as address-specific unless an authoritative route/address match is available.'
  ),now(),now()
from municipalities m
on conflict (jurisdiction_type,jurisdiction_key,provider_key,provider_url)
do update set
  jurisdiction_name=excluded.jurisdiction_name,
  county=excluded.county,
  evidence_families=excluded.evidence_families,
  access_mode=excluded.access_mode,
  adapter_status=excluded.adapter_status,
  source_url=excluded.source_url,
  metadata=excluded.metadata,
  last_verified_at=excluded.last_verified_at,
  updated_at=excluded.updated_at;

with municipalities as (
  select distinct on (municipality_code)
    municipality_code,
    municipality_name,
    county
  from public.transaction_municipal_requirements
  where municipality_code ~ '^\d{4}$'
  order by municipality_code, municipality_name
)
insert into public.transaction_provider_registry (
  jurisdiction_type,jurisdiction_key,jurisdiction_name,county,
  provider_key,provider_label,provider_url,evidence_families,
  access_mode,adapter_status,source_url,metadata,last_verified_at,updated_at
)
select
  'municipality',m.municipality_code,m.municipality_name,m.county,
  'njdep_recycling_coordinator_registry','NJDEP Municipal Recycling Coordinator Registry',
  'https://dep.nj.gov/dshw/rhwm/recycoor/county-municipal-recycling-coordinators/',
  array['municipal_services','recycling_contact'],
  'official_public_registry','live_parse',
  'https://dep.nj.gov/dshw/rhwm/recycoor/county-municipal-recycling-coordinators/',
  jsonb_build_object(
    'statewide',true,
    'registry_last_published','2026-08',
    'semantics','Current municipal recycling coordinator/contact source. This does not by itself resolve a household collection route.'
  ),now(),now()
from municipalities m
on conflict (jurisdiction_type,jurisdiction_key,provider_key,provider_url)
do update set
  jurisdiction_name=excluded.jurisdiction_name,
  county=excluded.county,
  evidence_families=excluded.evidence_families,
  access_mode=excluded.access_mode,
  adapter_status=excluded.adapter_status,
  source_url=excluded.source_url,
  metadata=excluded.metadata,
  last_verified_at=excluded.last_verified_at,
  updated_at=excluded.updated_at;

-- First structured municipal service profile. The runtime is provider-driven so additional
-- municipalities can be added without changing the UI or transaction schema.
insert into public.transaction_provider_registry (
  jurisdiction_type,jurisdiction_key,jurisdiction_name,county,
  provider_key,provider_label,provider_url,evidence_families,
  access_mode,adapter_status,source_url,metadata,last_verified_at,updated_at
) values (
  'municipality','0422','LINDENWOLD BORO','CAMDEN',
  'municipal_public_works','Lindenwold Public Works',
  'https://www.lindenwoldnj.gov/196/Trash-Routes',
  array['municipal_services','trash_recycling','bulk_pickup','yard_waste','special_collection'],
  'official_public_schedule','structured_schedule',
  'https://www.lindenwoldnj.gov/196/Trash-Routes',
  jsonb_build_object(
    'department','Lindenwold Public Works',
    'department_url','https://www.lindenwoldnj.gov/168/Public-Works',
    'phone','856-783-1848 Ext. 659',
    'trash_route_url','https://www.lindenwoldnj.gov/196/Trash-Routes',
    'trash_route_scope','street_or_area_route',
    'address_day_resolved',false,
    'recycling','Recycling is collected on the regular trash day. Use the blue-lid recycling cart.',
    'yard_waste','Vegetation/yard waste is collected every Monday curbside January through October; first Monday of the month is bulk yard waste.',
    'bulk_trash','Large-item bulk trash is collected Thursdays by advance request; the published guide states one large item per week with limited exceptions.',
    'special_collections',jsonb_build_array(
      'Scrap metal: Monday by advance request',
      'Concrete/asphalt: Wednesday by advance request',
      'Stumps/logs 12 inches or larger: Thursday by advance request',
      'Electronics and motor oil: Public Works drop-off during published weekday hours'
    ),
    'guide_url','https://www.lindenwoldnj.gov/197/Trash-Recycling',
    'verified_from_official_site',true,
    'semantics','Route-level trash rules are published by Lindenwold. Do not infer a household trash day when the subject street is not explicitly resolved by the published route text.'
  ),now(),now()
)
on conflict (jurisdiction_type,jurisdiction_key,provider_key,provider_url)
do update set
  provider_label=excluded.provider_label,
  evidence_families=excluded.evidence_families,
  access_mode=excluded.access_mode,
  adapter_status=excluded.adapter_status,
  source_url=excluded.source_url,
  metadata=excluded.metadata,
  last_verified_at=excluded.last_verified_at,
  updated_at=excluded.updated_at;
