-- Database-level safety interlock for models that failed independent calibration.
-- A newer Closing Review or Property Change version may not become the current
-- customer-facing pointer until that exact version has accepted, passing, fresh calibration.
-- Version decreases remain allowed for rollback/recovery.

create or replace function public.enforce_failed_intelligence_model_promotion_gate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  gate_ok boolean;
begin
  if new.model_key not in ('closing_review','property_change_priority') then
    return new;
  end if;

  if new.version <= old.version then
    return new;
  end if;

  if new.calibration_state <> 'calibrated' then
    raise exception 'Intelligence model % v% cannot become current before calibration_state=calibrated', new.model_key, new.version;
  end if;

  select exists (
    select 1
    from public.intelligence_calibration_sets s
    join public.intelligence_calibration_summaries z
      on z.calibration_set_id = s.id
    where s.model_key = new.model_key
      and s.model_version = new.version
      and s.status = 'accepted'
      and z.passes_gate = true
      and z.reviewed_cases >= s.minimum_reviewed_cases
      and coalesce((s.source_manifest->>'fresh_holdout_required')::boolean, true) = true
      and coalesce((s.source_manifest->>'do_not_reuse_prior_calibration_cases')::boolean, true) = true
  ) into gate_ok;

  if not coalesce(gate_ok,false) then
    raise exception 'Intelligence model % v% cannot become current without an accepted passing fresh independent calibration set', new.model_key, new.version;
  end if;

  return new;
end $$;

drop trigger if exists intelligence_failed_model_promotion_gate on public.intelligence_models;
create trigger intelligence_failed_model_promotion_gate
before update of version on public.intelligence_models
for each row
when (new.version is distinct from old.version)
execute function public.enforce_failed_intelligence_model_promotion_gate();

comment on function public.enforce_failed_intelligence_model_promotion_gate() is
'Blocks forward current-pointer promotion for Closing Review and Property Change until the exact new version has accepted, passing, fresh independent calibration. Rollbacks remain allowed.';

-- Assert the known-safe current pointers at installation time.
do $$
begin
  if not exists (
    select 1 from public.intelligence_models
    where model_key='closing_review' and version=2 and status='preview' and calibration_state='uncalibrated'
  ) then raise exception 'Closing Review pointer is not at the expected safe v2 Preview state'; end if;

  if not exists (
    select 1 from public.intelligence_models
    where model_key='property_change_priority' and version=3 and status='preview' and calibration_state='uncalibrated'
  ) then raise exception 'Property Change pointer is not at the expected safe v3 Preview state'; end if;
end $$;