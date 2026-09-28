-- Backoffice access list.
--
-- backoffice-dev-login handed a 12-hour Backoffice session to anyone who asked
-- ("temporary open access"), which exposed every Backoffice lead. Sessions now go
-- only to signed-in Watchdog accounts listed here. The same list gates the
-- one-time shared-key setup in backoffice-api, so a developer-role account that is
-- not listed cannot create a way in either.
--
-- Only the service role reads this table. Add an operator with:
--   insert into public.backoffice_operators (user_id, actor_label)
--   values ('<auth.users id>', 'john');

create table if not exists public.backoffice_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  actor_label text not null default 'john' check (actor_label in ('john', 'wife')),
  created_at timestamptz not null default now()
);

alter table public.backoffice_operators enable row level security;
revoke all on table public.backoffice_operators from public, anon, authenticated;

comment on table public.backoffice_operators is
  'Watchdog accounts allowed to open Backoffice. Read by backoffice-dev-login and backoffice-api with the service role only.';

-- End every session the open login handed out.
update public.backoffice_sessions
   set revoked_at = now()
 where revoked_at is null;
