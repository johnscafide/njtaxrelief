-- Watchdog Intelligence calibration control plane.
-- Calibration is deliberately separate from customer findings. No model may become live merely because it can produce scores.

create table if not exists public.intelligence_calibration_sets (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  model_version integer not null,
  name text not null,
  description text not null default '',
  source_kind text not null check (source_kind in ('governed_fixture','historical_review','shadow_run')),
  source_manifest jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','reviewing','accepted','rejected','retired')),
  minimum_reviewed_cases integer not null default 25 check (minimum_reviewed_cases > 0),
  minimum_precision numeric(5,4) not null default 0.7000 check (minimum_precision between 0 and 1),
  minimum_recall numeric(5,4) not null default 0.6000 check (minimum_recall between 0 and 1),
  maximum_false_positive_rate numeric(5,4) not null default 0.3000 check (maximum_false_positive_rate between 0 and 1),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint intelligence_calibration_set_model_version_fkey
    foreign key (model_key, model_version)
    references public.intelligence_model_versions(model_key, version)
);

create table if not exists public.intelligence_calibration_cases (
  id uuid primary key default gen_random_uuid(),
  calibration_set_id uuid not null references public.intelligence_calibration_sets(id) on delete cascade,
  case_key text not null,
  pams_pin text,
  property_address text,
  expected_class text not null default 'unreviewed' check (expected_class in ('unreviewed','review_priority','not_priority','uncertain')),
  expected_score_min numeric(5,2) check (expected_score_min is null or expected_score_min between 0 and 100),
  expected_score_max numeric(5,2) check (expected_score_max is null or expected_score_max between 0 and 100),
  evidence_snapshot jsonb not null default '{}'::jsonb,
  source_notes text,
  created_at timestamptz not null default now(),
  unique (calibration_set_id, case_key),
  constraint intelligence_calibration_case_score_range check (
    expected_score_min is null or expected_score_max is null or expected_score_min <= expected_score_max
  )
);

create table if not exists public.intelligence_calibration_reviews (
  id uuid primary key default gen_random_uuid(),
  calibration_case_id uuid not null references public.intelligence_calibration_cases(id) on delete cascade,
  model_key text not null,
  model_version integer not null,
  actual_score numeric(5,2) check (actual_score is null or actual_score between 0 and 100),
  actual_confidence numeric(5,2) check (actual_confidence is null or actual_confidence between 0 and 100),
  evidence_coverage numeric(5,2) check (evidence_coverage is null or evidence_coverage between 0 and 100),
  predicted_class text check (predicted_class is null or predicted_class in ('review_priority','not_priority','insufficient_evidence')),
  review_outcome text not null default 'needs_review' check (review_outcome in ('needs_review','pass','fail')),
  error_kind text check (error_kind is null or error_kind in ('false_positive','false_negative','score_range','data_gap','cohort_gap','source_gap','other')),
  review_notes text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (calibration_case_id, model_key, model_version),
  constraint intelligence_calibration_review_model_version_fkey
    foreign key (model_key, model_version)
    references public.intelligence_model_versions(model_key, version)
);

create table if not exists public.intelligence_calibration_summaries (
  calibration_set_id uuid primary key references public.intelligence_calibration_sets(id) on delete cascade,
  reviewed_cases integer not null default 0 check (reviewed_cases >= 0),
  true_positives integer not null default 0 check (true_positives >= 0),
  true_negatives integer not null default 0 check (true_negatives >= 0),
  false_positives integer not null default 0 check (false_positives >= 0),
  false_negatives integer not null default 0 check (false_negatives >= 0),
  uncertain_cases integer not null default 0 check (uncertain_cases >= 0),
  insufficient_evidence_cases integer not null default 0 check (insufficient_evidence_cases >= 0),
  precision numeric(7,6),
  recall numeric(7,6),
  false_positive_rate numeric(7,6),
  median_evidence_coverage numeric(5,2),
  passes_gate boolean not null default false,
  gate_reasons jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

alter table public.intelligence_calibration_sets enable row level security;
alter table public.intelligence_calibration_cases enable row level security;
alter table public.intelligence_calibration_reviews enable row level security;
alter table public.intelligence_calibration_summaries enable row level security;

revoke all on public.intelligence_calibration_sets from anon, authenticated;
revoke all on public.intelligence_calibration_cases from anon, authenticated;
revoke all on public.intelligence_calibration_reviews from anon, authenticated;
revoke all on public.intelligence_calibration_summaries from anon, authenticated;

-- Calibration is service-managed in v1. A developer console will go through a server-authorized API, never direct table access.
create policy intelligence_calibration_sets_authenticated_deny on public.intelligence_calibration_sets for all to authenticated using (false) with check (false);
create policy intelligence_calibration_cases_authenticated_deny on public.intelligence_calibration_cases for all to authenticated using (false) with check (false);
create policy intelligence_calibration_reviews_authenticated_deny on public.intelligence_calibration_reviews for all to authenticated using (false) with check (false);
create policy intelligence_calibration_summaries_authenticated_deny on public.intelligence_calibration_summaries for all to authenticated using (false) with check (false);

create index if not exists intelligence_calibration_sets_model_version_idx on public.intelligence_calibration_sets(model_key, model_version);
create index if not exists intelligence_calibration_cases_set_class_idx on public.intelligence_calibration_cases(calibration_set_id, expected_class);
create index if not exists intelligence_calibration_reviews_model_version_idx on public.intelligence_calibration_reviews(model_key, model_version);
create index if not exists intelligence_calibration_reviews_case_idx on public.intelligence_calibration_reviews(calibration_case_id);

insert into public.intelligence_calibration_sets
(model_key,model_version,name,description,source_kind,source_manifest,status,minimum_reviewed_cases,minimum_precision,minimum_recall,maximum_false_positive_rate)
select model_key,version,
  case model_key
    when 'assessment_anomaly' then 'Assessment Anomaly v2 initial calibration'
    when 'closing_review' then 'Closing Review v2 initial calibration'
    when 'property_change_priority' then 'Property Change v2 initial calibration'
  end,
  'Initial governed calibration set. Human labels and error reviews are required before this model can pass the promotion gate.',
  'governed_fixture',
  jsonb_build_object('created_for','watchdog-intelligence-v1','model_state','preview_uncalibrated'),
  'draft',25,0.7000,0.6000,0.3000
from public.intelligence_model_versions
where version=2 and model_key in ('assessment_anomaly','closing_review','property_change_priority')
on conflict do nothing;
