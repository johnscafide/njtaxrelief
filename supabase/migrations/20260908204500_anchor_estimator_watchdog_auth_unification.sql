alter table public.backoffice_leads
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists backoffice_leads_auth_user_idx
  on public.backoffice_leads (auth_user_id)
  where auth_user_id is not null;

-- Link retained leads that already have a Watchdog account. Multiple lead events
-- may belong to one account, so this is intentionally not unique.
update public.backoffice_leads l
set auth_user_id = u.id
from auth.users u
where l.auth_user_id is null
  and l.email is not null
  and u.email is not null
  and lower(trim(l.email)) = lower(trim(u.email));

alter table public.watchdog_user_lifecycle
  drop constraint if exists watchdog_user_lifecycle_origin_source_check;

alter table public.watchdog_user_lifecycle
  add constraint watchdog_user_lifecycle_origin_source_check
  check (origin_source in (
    'auth_metadata',
    'authenticated_rpc',
    'attribution_backfill',
    'product_backfill',
    'historical_backfill',
    'verified_anchor_handoff'
  ));

comment on column public.backoffice_leads.auth_user_id is
  'Watchdog Auth account associated with this retained lead when the visitor has a Watchdog account. ANCHOR estimator verification can establish this link server-side.';
