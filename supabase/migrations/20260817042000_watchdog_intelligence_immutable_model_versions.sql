-- Preserve immutable Watchdog Intelligence model configurations for reproducible historical runs.
-- `intelligence_models` remains the current-model pointer; every runnable revision is snapshotted here.

create table if not exists public.intelligence_model_versions (
  model_key text not null,
  version integer not null check (version > 0),
  label text not null,
  description text not null,
  objective text not null,
  minimum_plan text not null check (minimum_plan in ('pro','pro_plus','teams','developer')),
  status text not null check (status in ('draft','preview','live','retired')),
  profession_scope text[] not null default '{}'::text[],
  signal_config jsonb not null default '{}'::jsonb,
  calibration_state text not null check (calibration_state in ('uncalibrated','testing','calibrated')),
  scoring_notes text,
  created_at timestamptz not null default now(),
  primary key (model_key, version)
);

alter table public.intelligence_model_versions enable row level security;
grant select on public.intelligence_model_versions to authenticated;

create policy intelligence_model_versions_authenticated_read
on public.intelligence_model_versions for select
to authenticated
using (true);

-- Snapshot the original v1 definitions exactly as introduced by the foundation migration.
insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select m.model_key, 1, m.label, m.description, m.objective, m.minimum_plan, 'preview', m.profession_scope,
  case m.model_key
    when 'assessment_anomaly' then '{"signals":[{"id":"watchdog.assessment_to_sale_ratio","role":"anomaly"},{"id":"watchdog.sale_to_assessment_ratio","role":"anomaly"},{"id":"watchdog.tax_to_assessment_rate","role":"context"},{"id":"watchdog.source_authority_coverage","role":"confidence"}],"requires_evidence":true}'::jsonb
    when 'closing_review' then '{"signals":[{"id":"watchdog.closing_exception_priority","role":"priority"},{"id":"watchdog.due_diligence_signal_count","role":"support"},{"id":"watchdog.permit_closure_confidence","role":"support"},{"id":"watchdog.transaction_diligence_completion","role":"confidence"},{"id":"watchdog.title_constraint_stack","role":"support"}],"requires_evidence":true}'::jsonb
    when 'property_change_priority' then '{"signals":[{"id":"event.materiality","role":"priority"},{"id":"event.recency","role":"priority"},{"id":"event.delta_numeric","role":"context"},{"id":"watchdog.property_story_confidence","role":"confidence"}],"requires_evidence":true}'::jsonb
    else '{}'::jsonb
  end,
  'uncalibrated',
  m.scoring_notes
from public.intelligence_models m
where m.model_key in ('assessment_anomaly','closing_review','property_change_priority')
on conflict (model_key,version) do nothing;

-- The normalized scoring contract is the second immutable revision.
update public.intelligence_models
set version = 2, updated_at = now()
where model_key in ('assessment_anomaly','closing_review','property_change_priority') and version = 1;

insert into public.intelligence_model_versions
(model_key,version,label,description,objective,minimum_plan,status,profession_scope,signal_config,calibration_state,scoring_notes)
select model_key, version, label, description, objective, minimum_plan, status, profession_scope, signal_config, calibration_state, scoring_notes
from public.intelligence_models
where model_key in ('assessment_anomaly','closing_review','property_change_priority')
on conflict (model_key,version) do nothing;

create index if not exists intelligence_runs_model_version_idx
on public.intelligence_runs(model_key, model_version);

alter table public.intelligence_runs
  drop constraint if exists intelligence_runs_model_version_fkey;

alter table public.intelligence_runs
  add constraint intelligence_runs_model_version_fkey
  foreign key (model_key, model_version)
  references public.intelligence_model_versions(model_key, version);
