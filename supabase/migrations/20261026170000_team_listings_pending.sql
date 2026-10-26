-- Team listings: add "pending" as its own status (Bright shows Pending separately from Active Under Contract).
alter table public.team_listings drop constraint if exists team_listings_status_check;
alter table public.team_listings add constraint team_listings_status_check
  check (status in ('coming_soon', 'active', 'under_contract', 'pending', 'sold', 'off_market'));
