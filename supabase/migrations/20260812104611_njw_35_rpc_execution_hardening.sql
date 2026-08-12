-- NJW-35: harden execution privileges for internal access/quota helpers.
-- Per-user RPCs that validate auth.uid() remain callable by authenticated users.

revoke execute on function public.can_use_data_workbench(uuid) from anon, public;
revoke execute on function public.watchdog_effective_plan(uuid) from anon, public;
revoke execute on function public.get_agent_usage() from anon, public;
revoke execute on function public.enforce_agent_control_quota() from anon, authenticated, public;
revoke execute on function public.agent_plan_limits(text) from anon, public;

alter function public.agent_plan_limits(text)
  set search_path = public, pg_temp;
