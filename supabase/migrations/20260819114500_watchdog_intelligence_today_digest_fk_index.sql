-- Cover the Today inbox digest foreign key for delete/set-null and digest cleanup paths.
create index if not exists intelligence_today_events_digest_idx
  on public.intelligence_today_events (digest_id)
  where digest_id is not null;
