-- Watchdog Intelligence Phase 4 + 5 control plane
-- Analyst is tool-only; Phase 5 scenario math is deterministic and user-controlled.

create table if not exists public.intelligence_prompt_versions (
  prompt_key text not null,
  version integer not null check (version > 0),
  provider text not null default 'openai',
  model text not null default 'gpt-5.6-luna',
  system_contract text not null,
  response_schema jsonb not null default '{}'::jsonb,
  tool_manifest jsonb not null default '[]'::jsonb,
  status text not null default 'preview' check (status in ('draft','preview','live','retired')),
  created_at timestamptz not null default now(),
  primary key (prompt_key, version)
);

create table if not exists public.intelligence_analyst_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profession text,
  context jsonb not null default '{}'::jsonb,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_analyst_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.intelligence_analyst_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  prompt_key text,
  prompt_version integer,
  tool_contract_version text,
  status text not null default 'complete' check (status in ('pending','complete','refused','failed','provider_unavailable')),
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.intelligence_analyst_sessions(id) on delete cascade,
  message_id uuid references public.intelligence_analyst_messages(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  tool_version text not null,
  arguments jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  status text not null check (status in ('started','complete','refused','failed')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_tier text not null,
  event_type text not null,
  provider text,
  model text,
  request_units integer not null default 1 check (request_units >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_outcome_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.intelligence_findings(id) on delete cascade,
  run_id uuid not null references public.intelligence_runs(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('reviewed','useful','not_relevant','contacted','appointment','client','under_contract','closed','dismissed','case_created','report_created','watch_started','campaign_prepared')),
  reason_code text,
  notes text,
  revenue_cents bigint check (revenue_cents is null or revenue_cents >= 0),
  artifact_type text,
  artifact_id text,
  model_key text not null,
  model_version integer not null,
  facts_hash text,
  signal_snapshot jsonb not null default '[]'::jsonb,
  assumption_snapshot jsonb not null default '{}'::jsonb,
  scenario_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.intelligence_preference_profiles (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profession text not null default 'general',
  objective text not null default 'general',
  status text not null default 'cold_start' check (status in ('cold_start','learning','active','reset')),
  sample_size integer not null default 0 check (sample_size >= 0),
  positive_count integer not null default 0 check (positive_count >= 0),
  negative_count integer not null default 0 check (negative_count >= 0),
  default_weights jsonb not null default '{}'::jsonb,
  learned_weights jsonb not null default '{}'::jsonb,
  minimum_evidence integer not null default 8 check (minimum_evidence >= 1),
  last_rebuilt_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, profession, objective)
);

create table if not exists public.intelligence_value_snapshots (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.intelligence_findings(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  objective text not null,
  profession text,
  factual_context jsonb not null default '{}'::jsonb,
  assumption_snapshot jsonb not null default '{}'::jsonb,
  raw_scenario_value_cents bigint not null check (raw_scenario_value_cents >= 0),
  probability_adjusted_value_cents bigint not null check (probability_adjusted_value_cents >= 0),
  calculation_version text not null default 'opportunity-value-v1',
  created_at timestamptz not null default now()
);

alter table public.intelligence_feedback drop constraint if exists intelligence_feedback_outcome_check;
alter table public.intelligence_feedback add constraint intelligence_feedback_outcome_check check (outcome is null or outcome in ('reviewed','contacted','appointment','client','under_contract','closed','dismissed'));
alter table public.intelligence_feedback add column if not exists reason_code text;
alter table public.intelligence_feedback add column if not exists model_key text;
alter table public.intelligence_feedback add column if not exists model_version integer;
alter table public.intelligence_feedback add column if not exists facts_hash text;
alter table public.intelligence_feedback add column if not exists signal_snapshot jsonb not null default '[]'::jsonb;
alter table public.intelligence_feedback add column if not exists assumption_snapshot jsonb not null default '{}'::jsonb;

create index if not exists intelligence_analyst_sessions_user_updated_idx on public.intelligence_analyst_sessions(user_id, updated_at desc);
create index if not exists intelligence_analyst_messages_session_created_idx on public.intelligence_analyst_messages(session_id, created_at);
create index if not exists intelligence_tool_calls_user_created_idx on public.intelligence_tool_calls(user_id, created_at desc);
create index if not exists intelligence_usage_events_user_created_idx on public.intelligence_usage_events(user_id, created_at desc);
create index if not exists intelligence_outcome_events_user_created_idx on public.intelligence_outcome_events(user_id, occurred_at desc);
create index if not exists intelligence_outcome_events_finding_created_idx on public.intelligence_outcome_events(finding_id, occurred_at);
create index if not exists intelligence_value_snapshots_user_created_idx on public.intelligence_value_snapshots(user_id, created_at desc);

alter table public.intelligence_prompt_versions enable row level security;
alter table public.intelligence_analyst_sessions enable row level security;
alter table public.intelligence_analyst_messages enable row level security;
alter table public.intelligence_tool_calls enable row level security;
alter table public.intelligence_usage_events enable row level security;
alter table public.intelligence_outcome_events enable row level security;
alter table public.intelligence_preference_profiles enable row level security;
alter table public.intelligence_value_snapshots enable row level security;

grant select on public.intelligence_prompt_versions to authenticated;
grant select on public.intelligence_analyst_sessions to authenticated;
grant select on public.intelligence_analyst_messages to authenticated;
grant select on public.intelligence_tool_calls to authenticated;
grant select on public.intelligence_usage_events to authenticated;
grant select, insert, update, delete on public.intelligence_outcome_events to authenticated;
grant select, insert, update, delete on public.intelligence_preference_profiles to authenticated;
grant select on public.intelligence_value_snapshots to authenticated;

create policy intelligence_prompt_versions_read on public.intelligence_prompt_versions for select to authenticated using (status in ('preview','live'));
create policy intelligence_analyst_sessions_owner_read on public.intelligence_analyst_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_analyst_messages_owner_read on public.intelligence_analyst_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_tool_calls_owner_read on public.intelligence_tool_calls for select to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_usage_events_owner_read on public.intelligence_usage_events for select to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_outcome_events_owner_read on public.intelligence_outcome_events for select to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_outcome_events_owner_insert on public.intelligence_outcome_events for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.intelligence_findings f where f.id=finding_id and f.user_id=(select auth.uid()) and f.run_id=run_id));
create policy intelligence_outcome_events_owner_delete on public.intelligence_outcome_events for delete to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_preference_profiles_owner_read on public.intelligence_preference_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_preference_profiles_owner_insert on public.intelligence_preference_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy intelligence_preference_profiles_owner_update on public.intelligence_preference_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy intelligence_preference_profiles_owner_delete on public.intelligence_preference_profiles for delete to authenticated using ((select auth.uid()) = user_id);
create policy intelligence_value_snapshots_owner_read on public.intelligence_value_snapshots for select to authenticated using ((select auth.uid()) = user_id);

insert into public.intelligence_prompt_versions(prompt_key,version,provider,model,system_contract,response_schema,tool_manifest,status)
values ('watchdog_analyst',1,'openai','gpt-5.6-luna',
'You are Watchdog Analyst. You may only interpret structured evidence returned by approved Watchdog tools. Never invent property facts, values, legal conclusions, seller intent, protected-class targeting, guaranteed outcomes, or hidden financial math. Surface missing evidence explicitly. Keep factual evidence separate from Watchdog-derived intelligence and user assumptions.',
'{"type":"object","required":["conclusion","evidence","missing_evidence","caveats","suggested_actions","sources"],"properties":{"conclusion":{"type":"string"},"evidence":{"type":"array","items":{"type":"string"}},"missing_evidence":{"type":"array","items":{"type":"string"}},"caveats":{"type":"array","items":{"type":"string"}},"suggested_actions":{"type":"array","items":{"type":"string"}},"sources":{"type":"array","items":{"type":"object","required":["label","url"],"properties":{"label":{"type":"string"},"url":{"type":["string","null"]}},"additionalProperties":false}}},"additionalProperties":false}'::jsonb,
'["run_intelligence_model","get_finding_evidence","compare_findings","get_score_history","get_property_changes","inspect_lineage","create_case","create_report","watch_property","prepare_campaign"]'::jsonb,'preview')
on conflict (prompt_key,version) do update set provider=excluded.provider,model=excluded.model,system_contract=excluded.system_contract,response_schema=excluded.response_schema,tool_manifest=excluded.tool_manifest,status=excluded.status;
