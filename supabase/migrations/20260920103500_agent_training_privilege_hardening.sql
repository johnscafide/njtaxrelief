-- Harden Agent training progress privileges to owner-read only.
-- All mutations remain behind the governed RPC functions.

revoke all on table public.watchdog_agent_training_progress from public, anon, authenticated;
grant select on table public.watchdog_agent_training_progress to authenticated;
