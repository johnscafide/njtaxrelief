-- Explicitly remove anonymous invocation from internal entitlement/developer RPCs.
-- `anon` may have retained a direct grant from an older migration even after PUBLIC was revoked.
revoke execute on function public.get_my_entitlement() from anon;
revoke execute on function public.has_watchdog_plan(text) from anon;
revoke execute on function public.is_watchdog_developer() from anon;
