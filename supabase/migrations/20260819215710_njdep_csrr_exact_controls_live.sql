insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('njplus.njdep-csrr-gis.deed_notice_reference',array['property']::text[],'njdep_csrr_parcel_v2','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token. Returns the official DEED_NOTICE field only from an exact parcel-attributed SRP record; it does not convert a nearby Deed Notice polygon into a parcel claim. Unit-qualified parcels fail closed because the source PARCELS field is not unit-qualified. Authenticated positive canary: 0102_830_10 -> Ongoing.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','DEED_NOTICE']::text[],null,21600,'external_live',false),
  ('njplus.njdep-csrr-gis.cea_reference',array['property']::text[],'njdep_csrr_parcel_v2','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token. Returns the official CEA field from an exact parcel-attributed SRP record; it does not infer a CEA from proximity. Unit-qualified parcels fail closed. Authenticated positive canary: 0505_824.02_12 -> Ongoing.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','CEA']::text[],null,21600,'external_live',false),
  ('njplus.njdep-csrr-gis.ust_facility_reference',array['property']::text[],'njdep_csrr_parcel_v2','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token. Returns the official REGULATED_UST field from the exact parcel record. This is separate from the existing 250m UST proximity screen and does not attribute nearby facilities to the parcel. Authenticated positive canary: 0102_830_10 -> Closed UST Case.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','REGULATED_UST']::text[],null,21600,'external_live',false),
  ('njplus.njdep-csrr-gis.brownfield_inventory_status',array['property']::text[],'njdep_csrr_parcel_v2','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token. The canonical legacy marker ID brownfield_inventory_status is constrained to NJDEP''s BROWNFIELDS_DEVELOPMENT_AREA field (for example BDA Case / Closed BDA Case); it is not a generic brownfield inventory, contamination finding, redevelopment entitlement, or suitability determination. Authenticated positive canary: 0102_830_10 -> BDA Case.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','BROWNFIELDS_DEVELOPMENT_AREA']::text[],null,21600,'external_live',false)
on conflict (marker_id) do update set
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
