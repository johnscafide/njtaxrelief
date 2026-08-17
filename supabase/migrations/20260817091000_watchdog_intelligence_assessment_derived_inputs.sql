-- Watchdog Intelligence: live governed inputs for Assessment Anomaly.
-- Enables newly encountered properties to derive the same core facts without requiring cached score observations.

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
values
(
  'watchdog.assessment_to_sale_ratio','watchdog-derived-v5-date-sanity',
  'property.assessed_value / property.sale_price',
  array['property.assessed_value','property.sale_price'],
  'high','live','Assessment divided by sale price.','ratio',
  '{"den":"property.sale_price","num":"property.assessed_value","scale":1,"precision":3}'::jsonb
),
(
  'watchdog.source_authority_coverage','watchdog-derived-v5-date-sanity',
  'present authoritative core fields / defined authoritative core fields * 100',
  array['property.pams_pin','property.address','property.municipality','property.block','property.lot','property.property_class','property.assessed_value','property.annual_tax','property.sale_price','property.sale_date','property.deed_book','property.deed_page'],
  'high','live','Coverage of a defined authoritative public-record core used by Watchdog professional briefs.','completeness','{}'::jsonb
)
on conflict (marker_id) do update
set engine_version=excluded.engine_version,
    formula=excluded.formula,
    dependencies=excluded.dependencies,
    confidence=excluded.confidence,
    status=excluded.status,
    explanation=excluded.explanation,
    operation=excluded.operation,
    config=excluded.config,
    updated_at=now();
