-- Closing Review v3 fresh statewide holdout result.
-- Reproducibly records the already-completed independent human calibration outcome.
-- This migration does not move the customer-facing model pointer and does not promote v3.

insert into public.intelligence_calibration_summaries (
  calibration_set_id, reviewed_cases, true_positives, true_negatives,
  false_positives, false_negatives, uncertain_cases,
  insufficient_evidence_cases, precision, recall, false_positive_rate,
  passes_gate, gate_reasons, computed_at
)
select
  s.id, 35, 3, 24, 2, 4, 2, 0,
  0.600000, 0.428571, 0.076923,
  false,
  '["Precision gate not met","Recall gate not met"]'::jsonb,
  now()
from public.intelligence_calibration_sets s
where s.model_key='closing_review'
  and s.model_version=3
  and s.name='Closing Review v3 · Fresh Statewide Holdout'
on conflict (calibration_set_id) do update set
  reviewed_cases=excluded.reviewed_cases,
  true_positives=excluded.true_positives,
  true_negatives=excluded.true_negatives,
  false_positives=excluded.false_positives,
  false_negatives=excluded.false_negatives,
  uncertain_cases=excluded.uncertain_cases,
  insufficient_evidence_cases=excluded.insufficient_evidence_cases,
  precision=excluded.precision,
  recall=excluded.recall,
  false_positive_rate=excluded.false_positive_rate,
  passes_gate=excluded.passes_gate,
  gate_reasons=excluded.gate_reasons,
  computed_at=excluded.computed_at;

update public.intelligence_calibration_sets
set status='rejected', completed_at=coalesce(completed_at, now())
where model_key='closing_review'
  and model_version=3
  and name='Closing Review v3 · Fresh Statewide Holdout'
  and status in ('draft','reviewing');

-- Hard assertions: independent review must be complete, the gate must remain failed,
-- and this bookkeeping migration must never move the active customer model pointer.
do $$
declare
  v_set uuid;
  v_cases integer;
  v_reviewed integer;
begin
  select id into v_set
  from public.intelligence_calibration_sets
  where model_key='closing_review' and model_version=3
    and name='Closing Review v3 · Fresh Statewide Holdout';

  if v_set is null then
    raise exception 'Closing Review v3 holdout set not found';
  end if;

  select count(*), count(*) filter (where expected_class <> 'unreviewed')
  into v_cases, v_reviewed
  from public.intelligence_calibration_cases
  where calibration_set_id=v_set;

  if v_cases <> 35 or v_reviewed <> 35 then
    raise exception 'Closing Review v3 holdout is not exactly 35/35 independently reviewed';
  end if;

  if not exists (
    select 1 from public.intelligence_calibration_summaries
    where calibration_set_id=v_set and passes_gate=false
      and precision=0.600000 and recall=0.428571
      and false_positive_rate=0.076923
  ) then
    raise exception 'Closing Review v3 failed calibration summary is not preserved';
  end if;

  if exists (
    select 1 from public.intelligence_models
    where model_key='closing_review' and version<>2
  ) then
    raise exception 'Closing Review customer-facing model pointer moved unexpectedly';
  end if;
end $$;
