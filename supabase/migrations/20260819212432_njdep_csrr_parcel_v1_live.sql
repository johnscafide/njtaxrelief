insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  ('njplus.njdep-csrr-gis.kcsl_case_status',array['property']::text[],'njdep_csrr_parcel_v1','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token, restricted to records with a nonblank KCSL field. Returns official CASE_STATUS; multiple exact KCSL cases remain distinct values. No point-distance matching. Unit-qualified parcels fail closed because the source PARCELS field is not unit-qualified. Authenticated positive canary: 0505_824.02_12 -> Active - Post Rem.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','KCSL','CASE_STATUS']::text[],null,21600,'external_live',false),
  ('njplus.njdep-csrr-gis.kcsl_program_interest',array['property']::text[],'njdep_csrr_parcel_v1','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token, restricted to KCSL records. Returns official PREFERRED_ID / PI number; NJDEP identifies the PI number as the unique case identifier. No proximity matching. Authenticated positive canary: 0505_824.02_12 -> 008682.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','KCSL','PREFERRED_ID']::text[],null,21600,'external_live',false),
  ('njplus.njdep-csrr-gis.kcsl_site_id',array['property']::text[],'njdep_csrr_parcel_v1','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Exact NJDEP SRP Preferred ID match on COMU_CODE + parsed PARCELS token, restricted to KCSL records. Returns official NJEMS SITE_ID; multiple exact KCSL cases remain distinct values. No proximity matching. Authenticated positive canary: 0505_824.02_12 -> 15447.','authoritative_spatial_reference',array['COMU_CODE','PARCELS','KCSL','SITE_ID']::text[],null,21600,'external_live',false),
  ('njplus.njdep-csrr-gis.environmental_layer_vintage',array['property']::text[],'njdep_csrr_parcel_v1','live',array['njdep-csrr-gis','njdep-environmental-njems-srp-preferred-id-24']::text[],now(),'Latest official DATALOAD_DATE reported by NJDEP SRP Preferred ID layer 24, returned as an ISO timestamp. This describes the source layer vintage, not the date of a property remediation event. Authenticated canary returned 2026-08-17T00:00:00.000Z.','authoritative_spatial_reference',array['DATALOAD_DATE']::text[],null,21600,'external_live',false)
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
