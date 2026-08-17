-- Watchdog Intelligence foundation v1
-- Staging-first contract for governed intelligence runs, findings, feedback and user assumptions.
-- AI is never the factual source of truth. Runs/findings are service-written; customers can only read their own results.

create table if not exists public.intelligence_models (
  model_key text primary key,
  label text not null,
  description text not null,
  objective text not null,
  minimum_plan text not null default 'pro' check (minimum_plan in ('pro','pro_plus','teams','developer')),
  version integer not null default 1 check (version > 0),
  status text not null default 'preview' check (status in ('draft','preview','live','retired')),
  profession_scope text[] not null default '{}'::text[],
  signal_config jsonb not null default '{}'::jsonb,
  calibration_state text not null default 'uncalibrated' check (calibration_state in ('uncalibrated','testing','calibrated')),
  scoring_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  model_key text not null references public.intelligence_models(model_key),
  model_version integer not null,
  scope_type text not null check (scope_type in ('property','saved','farm','workbench_view','municipality','county','custom')),
  scope_value jsonb not null default '{}'::jsonb,
  requested_prompt text,
  status text not null default 'queued' check (status in ('queued','running','complete','failed','cancelled')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  finding_count integer not null default 0 check (finding_count >= 0),
  facts_hash text,
  engine_version text not null default 'watchdog-intelligence-v1',
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.intelligence_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text,
  property_address text,
  opportunity_type text not null,
  rank integer check (rank is null or rank > 0),
  score numeric(5,2) not null check (score between 0 and 100),
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  evidence_coverage numeric(5,2) not null default 0 check (evidence_coverage between 0 and 100),
  potential_impact jsonb not null default '{}'::jsonb,
  why_now jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  narrative text,
  narrative_status text not null default 'not_requested' check (narrative_status in ('not_requested','pending','ready','failed')),
  facts_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_feedback (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.intelligence_findings(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  feedback text check (feedback is null or feedback in ('useful','not_relevant')),
  outcome text check (outcome is null or outcome in ('contacted','appointment','client','under_contract','closed','dismissed')),
  revenue_cents bigint check (revenue_cents is null or revenue_cents >= 0),
  notes text,
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (finding_id, user_id)
);

create table if not exists public.intelligence_assumptions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  objective text not null,
  profession text,
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, objective)
);

create index if not exists intelligence_runs_user_created_idx on public.intelligence_runs(user_id, created_at desc);
create index if not exists intelligence_findings_run_rank_idx on public.intelligence_findings(run_id, rank);
create index if not exists intelligence_findings_user_score_idx on public.intelligence_findings(user_id, score desc);
create index if not exists intelligence_findings_pin_idx on public.intelligence_findings(pams_pin);
create index if not exists intelligence_feedback_user_updated_idx on public.intelligence_feedback(user_id, updated_at desc);

alter table public.intelligence_models enable row level security;
alter table public.intelligence_runs enable row level security;
alter table public.intelligence_findings enable row level security;
alter table public.intelligence_feedback enable row level security;
alter table public.intelligence_assumptions enable row level security;

grant select on public.intelligence_models to authenticated;
grant select on public.intelligence_runs to authenticated;
grant select on public.intelligence_findings to authenticated;
grant select, insert, update, delete on public.intelligence_feedback to authenticated;
grant select, insert, update, delete on public.intelligence_assumptions to authenticated;

create policy intelligence_models_authenticated_read
on public.intelligence_models for select
to authenticated
using (status in ('preview','live'));

create policy intelligence_runs_owner_read
on public.intelligence_runs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy intelligence_findings_owner_read
on public.intelligence_findings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy intelligence_feedback_owner_read
on public.intelligence_feedback for select
to authenticated
using ((select auth.uid()) = user_id);

create policy intelligence_feedback_owner_insert
on public.intelligence_feedback for insert
to authenticated
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.intelligence_findings f
  where f.id = finding_id and f.user_id = (select auth.uid())
));

create policy intelligence_feedback_owner_update
on public.intelligence_feedback for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy intelligence_feedback_owner_delete
on public.intelligence_feedback for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy intelligence_assumptions_owner_read
on public.intelligence_assumptions for select
to authenticated
using ((select auth.uid()) = user_id);

create policy intelligence_assumptions_owner_insert
on public.intelligence_assumptions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy intelligence_assumptions_owner_update
on public.intelligence_assumptions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy intelligence_assumptions_owner_delete
on public.intelligence_assumptions for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into public.intelligence_models
(model_key,label,description,objective,minimum_plan,version,status,profession_scope,signal_config,calibration_state,scoring_notes)
values
('assessment_anomaly','Assessment Anomaly Finder','Ranks properties whose governed assessment and transaction facts deserve closer review. It does not determine appeal eligibility or property value.','assessment_review','pro',1,'preview',array['agent','attorney','appraiser','investor'],
 '{"signals":[{"id":"watchdog.assessment_to_sale_ratio","role":"anomaly"},{"id":"watchdog.sale_to_assessment_ratio","role":"anomaly"},{"id":"watchdog.tax_to_assessment_rate","role":"context"},{"id":"watchdog.source_authority_coverage","role":"confidence"}],"requires_evidence":true}'::jsonb,
 'uncalibrated','Preview model. Ranking thresholds must be validated against real governed records before customer-facing claims.'),
('closing_review','Closing Review Priority','Ranks governed public-record exceptions for professional due-diligence review. It does not make a legal, title, code, or insurability determination.','closing_review','pro',1,'preview',array['agent','attorney','lender'],
 '{"signals":[{"id":"watchdog.closing_exception_priority","role":"priority"},{"id":"watchdog.due_diligence_signal_count","role":"support"},{"id":"watchdog.permit_closure_confidence","role":"support"},{"id":"watchdog.transaction_diligence_completion","role":"confidence"},{"id":"watchdog.title_constraint_stack","role":"support"}],"requires_evidence":true}'::jsonb,
 'uncalibrated','Preview model. All findings must expose supporting evidence and missing evidence.'),
('property_change_priority','Property Change Intelligence','Ranks material governed property-record changes by recency, severity, evidence coverage, and professional relevance.','change_intelligence','pro_plus',1,'preview',array['agent','attorney','appraiser','investor','lender'],
 '{"signals":[{"id":"event.materiality","role":"priority"},{"id":"event.recency","role":"priority"},{"id":"event.delta_numeric","role":"context"},{"id":"watchdog.property_story_confidence","role":"confidence"}],"requires_evidence":true}'::jsonb,
 'uncalibrated','Preview model. Event facts come from Watchdog snapshot/change infrastructure; AI may explain but may not invent changes.')
on conflict (model_key) do update set
  label = excluded.label,
  description = excluded.description,
  objective = excluded.objective,
  minimum_plan = excluded.minimum_plan,
  version = excluded.version,
  status = excluded.status,
  profession_scope = excluded.profession_scope,
  signal_config = excluded.signal_config,
  calibration_state = excluded.calibration_state,
  scoring_notes = excluded.scoring_notes,
  updated_at = now();
