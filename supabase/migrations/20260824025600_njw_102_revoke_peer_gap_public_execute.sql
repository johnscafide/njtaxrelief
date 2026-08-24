-- NJW-102 follow-up: Postgres functions inherit EXECUTE from PUBLIC by default.
-- Remove that inherited path as well as direct anon/authenticated grants.

revoke execute on function public.get_public_watchdog_score_cache(text[]) from public;
revoke execute on function public.save_public_watchdog_score_cache(jsonb) from public;
revoke execute on function public.get_public_watchdog_score_cache(text[]) from anon, authenticated;
revoke execute on function public.save_public_watchdog_score_cache(jsonb) from anon, authenticated;
