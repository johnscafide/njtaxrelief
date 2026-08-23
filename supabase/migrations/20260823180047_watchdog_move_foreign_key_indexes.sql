create index if not exists watchdog_move_sponsorships_grant_idx
  on public.watchdog_move_sponsorships(grant_id)
  where grant_id is not null;

create index if not exists watchdog_move_sponsorships_renewal_idx
  on public.watchdog_move_sponsorships(renewal_of)
  where renewal_of is not null;
