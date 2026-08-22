-- Restrict the privacy-preserving dashboard live-presence aggregate to authenticated users.
-- Supabase role defaults may grant anon EXECUTE separately from PUBLIC, so revoke it explicitly.
revoke execute on function public.get_watchdog_live_presence() from anon;
grant execute on function public.get_watchdog_live_presence() to authenticated;
