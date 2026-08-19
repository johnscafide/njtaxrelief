-- Watchdog Intelligence: Closing Review depends on preflight markers currently governed at Pro+.
-- Keep the model tier aligned with its source evidence so Pro cannot receive derived Pro+ information indirectly.

update public.intelligence_models
set minimum_plan='pro_plus', updated_at=now()
where model_key='closing_review'
  and minimum_plan is distinct from 'pro_plus';
