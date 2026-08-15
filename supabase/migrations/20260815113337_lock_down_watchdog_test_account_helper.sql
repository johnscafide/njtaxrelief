revoke all on function public.is_watchdog_test_account(uuid) from public, anon, authenticated;
grant execute on function public.is_watchdog_test_account(uuid) to service_role;
