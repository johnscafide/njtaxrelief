create index if not exists intelligence_analyst_messages_user_idx
  on public.intelligence_analyst_messages(user_id);

create index if not exists intelligence_outcome_events_run_idx
  on public.intelligence_outcome_events(run_id);

create index if not exists intelligence_tool_calls_message_idx
  on public.intelligence_tool_calls(message_id)
  where message_id is not null;

create index if not exists intelligence_tool_calls_session_idx
  on public.intelligence_tool_calls(session_id);

create index if not exists intelligence_value_snapshots_finding_idx
  on public.intelligence_value_snapshots(finding_id);
