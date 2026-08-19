alter table public.intelligence_preference_profiles
  add column if not exists reset_at timestamptz;

create index if not exists intelligence_outcome_events_user_finding_idx
  on public.intelligence_outcome_events(user_id, finding_id, occurred_at desc);
