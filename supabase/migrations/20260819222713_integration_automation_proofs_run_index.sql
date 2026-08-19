create index if not exists integration_automation_proofs_run_idx
on public.integration_automation_proofs(run_id)
where run_id is not null;
