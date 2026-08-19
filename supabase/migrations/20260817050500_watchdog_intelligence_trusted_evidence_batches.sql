-- Trusted evidence boundary for Watchdog Intelligence.
-- Browser-supplied feature scores may be previewed but can never be persisted as trusted findings.

create table if not exists public.intelligence_evidence_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_key text not null,
  model_version integer not null,
  source_kind text not null check (source_kind in ('workbench_hydrate','property_change_events','governed_fixture')),
  source_manifest jsonb not null default '{}'::jsonb,
  normalization_manifest jsonb not null default '{}'::jsonb,
  cohort_manifest jsonb not null default '{}'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  facts_hash text not null,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  constraint intelligence_evidence_batch_model_version_fkey
    foreign key (model_key, model_version)
    references public.intelligence_model_versions(model_key, version)
);

alter table public.intelligence_evidence_batches enable row level security;
revoke all on public.intelligence_evidence_batches from anon, authenticated;

-- An explicit deny policy documents the trust boundary and keeps the RLS linter clear.
create policy intelligence_evidence_batches_authenticated_deny
on public.intelligence_evidence_batches
for all to authenticated
using (false)
with check (false);

create index if not exists intelligence_evidence_batches_user_created_idx
  on public.intelligence_evidence_batches(user_id, created_at desc);
create index if not exists intelligence_evidence_batches_model_version_idx
  on public.intelligence_evidence_batches(model_key, model_version);
create index if not exists intelligence_evidence_batches_expiry_idx
  on public.intelligence_evidence_batches(expires_at)
  where consumed_at is null;

alter table public.intelligence_runs
  add column if not exists evidence_batch_id uuid references public.intelligence_evidence_batches(id);

create index if not exists intelligence_runs_evidence_batch_idx
  on public.intelligence_runs(evidence_batch_id)
  where evidence_batch_id is not null;
