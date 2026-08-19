-- Closing Review v2 completed its independent human tuning review but failed promotion gates.
-- Mark the calibration set rejected so the control plane reflects the computed result.
-- The model remains preview/uncalibrated until a structurally richer immutable version receives a fresh holdout.
update public.intelligence_calibration_sets
set status='rejected'
where model_key='closing_review' and model_version=2 and status in ('draft','reviewing');
