-- Register deterministic market-value candidates without changing canonical provider coverage.
-- LIVE promotion remains gated on authenticated production canary evidence.
--
-- Existing production metadata already defines both markers as SR-1A equalized market value
-- using NET_VALUE and SR1A_RATIO. The governed inputs below are currently LIVE:
--   property.assessed_value <- NJ MOD-IV / NET_VALUE
--   sales.ratio             <- NJ Division of Taxation SR-1A verified municipal ratio
-- Missing inputs remain missing. No substitute ratio or neutral value is introduced.

insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'property.market_value',
    'watchdog-derived-v16-chapter123-fields',
    'property.assessed_value / sales.ratio',
    array['property.assessed_value','sales.ratio']::text[],
    'high',
    'live',
    'Exact equalized market-value estimate from governed NJ MOD-IV assessed value divided by the governed NJ Division of Taxation SR-1A verified municipal assessment-to-sale ratio. Missing dependencies remain missing; no fallback ratio is synthesized.',
    'ratio',
    '{"num":"property.assessed_value","den":"sales.ratio","scale":1,"precision":0}'::jsonb,
    now()
  ),
  (
    'watchdog.market_value_estimate',
    'watchdog-derived-v16-chapter123-fields',
    'property.assessed_value / sales.ratio',
    array['property.assessed_value','sales.ratio']::text[],
    'high',
    'live',
    'Watchdog presentation of the same exact governed equalized market-value estimate: NJ MOD-IV assessed value divided by the NJ Division of Taxation SR-1A verified municipal assessment-to-sale ratio. Missing dependencies remain missing; no fallback ratio is synthesized.',
    'ratio',
    '{"num":"property.assessed_value","den":"sales.ratio","scale":1,"precision":0}'::jsonb,
    now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,
  formula=excluded.formula,
  dependencies=excluded.dependencies,
  confidence=excluded.confidence,
  status=excluded.status,
  explanation=excluded.explanation,
  operation=excluded.operation,
  config=excluded.config,
  updated_at=excluded.updated_at;
