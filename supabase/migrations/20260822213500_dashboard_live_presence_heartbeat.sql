create table if not exists public.watchdog_live_presence (
  session_id uuid primary key,
  visitor_id uuid not null,
  audience_class text not null default 'external_visitor',
  path text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchdog_live_presence_last_seen_idx
  on public.watchdog_live_presence(last_seen desc);

alter table public.watchdog_live_presence enable row level security;
revoke all on table public.watchdog_live_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.watchdog_live_presence to service_role;

create or replace function public.get_watchdog_live_presence()
returns table(
  active_sessions bigint,
  active_visitors bigint,
  window_minutes integer,
  as_of timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select
    count(distinct session_id)::bigint as active_sessions,
    count(distinct visitor_id)::bigint as active_visitors,
    3::integer as window_minutes,
    now() as as_of
  from public.watchdog_live_presence
  where last_seen >= now() - interval '3 minutes';
$$;

revoke all on function public.get_watchdog_live_presence() from public, anon;
grant execute on function public.get_watchdog_live_presence() to authenticated, service_role;
