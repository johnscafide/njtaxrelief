-- Keep the public ANCHOR rating anonymous-safe without an anon-callable SECURITY DEFINER RPC.
-- Raw review rows remain private/owner-scoped. Only aggregate counts are published.

create table if not exists public.anchor_application_rating_public (
  singleton boolean primary key default true check (singleton),
  average_rating numeric(2,1) not null default 0,
  rating_count bigint not null default 0,
  five_star_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.anchor_application_rating_public enable row level security;
revoke all on public.anchor_application_rating_public from anon, authenticated;
grant select on public.anchor_application_rating_public to anon, authenticated;

drop policy if exists anchor_application_rating_public_select on public.anchor_application_rating_public;
create policy anchor_application_rating_public_select
on public.anchor_application_rating_public
for select to anon, authenticated
using (true);

create or replace function public.refresh_anchor_application_rating_public_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.anchor_application_rating_public(
    singleton, average_rating, rating_count, five_star_count, updated_at
  )
  select
    true,
    coalesce(round(avg(rating)::numeric, 1), 0::numeric),
    count(*)::bigint,
    count(*) filter (where rating = 5)::bigint,
    now()
  from public.anchor_application_reviews
  on conflict (singleton) do update set
    average_rating = excluded.average_rating,
    rating_count = excluded.rating_count,
    five_star_count = excluded.five_star_count,
    updated_at = excluded.updated_at;
  return null;
end;
$$;
revoke all on function public.refresh_anchor_application_rating_public_v1() from public, anon, authenticated;

insert into public.anchor_application_rating_public(singleton, average_rating, rating_count, five_star_count, updated_at)
select
  true,
  coalesce(round(avg(rating)::numeric, 1), 0::numeric),
  count(*)::bigint,
  count(*) filter (where rating = 5)::bigint,
  now()
from public.anchor_application_reviews
on conflict (singleton) do update set
  average_rating = excluded.average_rating,
  rating_count = excluded.rating_count,
  five_star_count = excluded.five_star_count,
  updated_at = excluded.updated_at;

drop trigger if exists anchor_application_reviews_refresh_public_rating on public.anchor_application_reviews;
create trigger anchor_application_reviews_refresh_public_rating
after insert or update or delete on public.anchor_application_reviews
for each statement execute function public.refresh_anchor_application_rating_public_v1();

create or replace function public.get_public_anchor_application_rating_v1()
returns table(average_rating numeric, rating_count bigint, five_star_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.average_rating, p.rating_count, p.five_star_count
  from public.anchor_application_rating_public p
  where p.singleton = true;
$$;
revoke all on function public.get_public_anchor_application_rating_v1() from public;
grant execute on function public.get_public_anchor_application_rating_v1() to anon, authenticated;
