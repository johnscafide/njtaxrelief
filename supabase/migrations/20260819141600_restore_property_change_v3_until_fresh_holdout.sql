-- Safety reconciliation after concurrent Property Change repair work.
-- v4/v5 remain immutable research history, but neither may become the current customer-facing
-- Preview pointer before a structurally representative fresh holdout is independently labeled.
-- Restore the last reviewed v3 Preview configuration while repair work continues in shadow/draft.

update public.intelligence_models m
set version = v.version,
    minimum_plan = v.minimum_plan,
    status = v.status,
    profession_scope = v.profession_scope,
    signal_config = v.signal_config,
    calibration_state = v.calibration_state,
    scoring_notes = v.scoring_notes,
    updated_at = now()
from public.intelligence_model_versions v
where m.model_key = 'property_change_priority'
  and v.model_key = 'property_change_priority'
  and v.version = 3
  and m.version in (4,5)
  and m.calibration_state = 'uncalibrated';

update public.intelligence_calibration_sets
set status = 'rejected',
    completed_at = coalesce(completed_at, now()),
    source_manifest = source_manifest || jsonb_build_object(
      'rejected_reason', 'structural_event_pool_not_representative_and_repair_not_independently_calibrated',
      'customer_pointer_restored_to', 3,
      'fresh_independent_holdout_still_required', true
    )
where model_key = 'property_change_priority'
  and model_version in (4,5)
  and status in ('draft','reviewing');

do $$
declare
  current_version integer;
  current_status text;
  current_calibration text;
begin
  select version,status,calibration_state
    into current_version,current_status,current_calibration
  from public.intelligence_models
  where model_key='property_change_priority';

  if current_version <> 3 or current_status <> 'preview' or current_calibration <> 'uncalibrated' then
    raise exception 'Property Change safety reconciliation failed: expected current v3 Preview uncalibrated, got v% % %', current_version, current_status, current_calibration;
  end if;
end $$;