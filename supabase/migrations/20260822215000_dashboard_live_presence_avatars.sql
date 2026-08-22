-- Dashboard live presence: retain the authenticated account reference server-side
-- so the authenticated dashboard can render up to five profile photos.
-- Names, emails, user IDs, visitor IDs and session IDs are not returned by the RPC.

alter table public.watchdog_live_presence
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists watchdog_live_presence_user_last_seen_idx
  on public.watchdog_live_presence(user_id, last_seen desc)
  where user_id is not null;

drop function if exists public.get_watchdog_live_presence();

create function public.get_watchdog_live_presence()
returns table(
  active_sessions bigint,
  active_visitors bigint,
  window_minutes integer,
  as_of timestamptz,
  avatar_urls text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select distinct on (visitor_id)
      visitor_id,
      session_id,
      user_id,
      last_seen
    from public.watchdog_live_presence
    where last_seen >= now() - interval '3 minutes'
    order by visitor_id, last_seen desc
  ),
  avatar_rows as (
    select
      r.last_seen,
      coalesce(nullif(p.photo_url, ''), nullif(p.avatar_url, '')) as avatar_url
    from recent r
    left join public.profiles p on p.id = r.user_id
  ),
  avatars as (
    select
      (coalesce(
        array_agg(avatar_url order by last_seen desc) filter (where avatar_url is not null),
        array[]::text[]
      ))[1:5] as avatar_urls
    from avatar_rows
  )
  select
    count(distinct r.session_id)::bigint,
    count(distinct r.visitor_id)::bigint,
    3::integer,
    now(),
    coalesce((select a.avatar_urls from avatars a), array[]::text[])
  from recent r;
$$;

revoke all on function public.get_watchdog_live_presence() from public;
revoke all on function public.get_watchdog_live_presence() from anon;
grant execute on function public.get_watchdog_live_presence() to authenticated;
grant execute on function public.get_watchdog_live_presence() to service_role;
