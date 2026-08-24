-- NJW-102: peer-gap-v1 was never the governed Watchdog Score.
-- Purge the invalid persisted values and prevent public clients from writing more.

truncate table public.public_watchdog_score_cache;

revoke execute on function public.save_public_watchdog_score_cache(jsonb) from anon, authenticated;
revoke execute on function public.get_public_watchdog_score_cache(text[]) from anon, authenticated;

comment on table public.public_watchdog_score_cache is
  'Retired NJW-102 peer-gap-v1 cache. Do not use as Watchdog Score or ROBUST evidence.';

comment on function public.get_public_watchdog_score_cache(text[]) is
  'Retired NJW-102. Kept temporarily for migration compatibility; public execution revoked.';

comment on function public.save_public_watchdog_score_cache(jsonb) is
  'Retired NJW-102. Public execution revoked; peer-gap-v1 must not be persisted.';
